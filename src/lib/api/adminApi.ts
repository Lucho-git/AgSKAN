import { supabase } from '$lib/supabaseClient';

export interface AdminMapEntry {
    owner_id: string;
    owner_name: string | null;
    owner_email: string | null;
    owner_phone: string | null;
    company_name: string | null;
    owner_last_sign_in: string | null;
    owner_created_at: string | null;

    master_map_id: string;
    map_name: string | null;
    map_created_at: string;

    subscription: string;
    subscription_status: string;
    allowed_seats: number;
    payment_interval: string | null;
    next_billing_date: string | null;
    founder: boolean;

    connected_vehicles: number;
    total_members: number;
    seats_over_limit: number;
    seat_status: 'EXCEEDING' | 'AT_LIMIT' | 'OK';
    owner_connected: boolean;

    latest_vehicle_update: string | null;
    vehicles_active_24h: number;
    vehicles_active_7d: number;
    vehicles_active_30d: number;

    latest_member_sign_in: string | null;
    members_active_7d: number;
    members_active_30d: number;

    members: {
        id: string;
        full_name: string | null;
        email: string | null;
        last_sign_in: string | null;
        last_location_update: string | null;
        is_owner: boolean;
        role: string | null;
        map_role: string | null;
    }[];
}

export interface AdminMapActivity {
    master_map_id: string;
    active_profiles: number;
    active_days: number;
}

export interface AdminMapContentStats {
    master_map_id: string;
    field_count: number;
    field_hectares: number;
    trail_count: number;
    marker_count: number;
}

export interface MapDailyRow {
    activity_date: string;
    profile_id: string;
    profile_count: number;
}

/** Admin-only free-text note about a map (farm). Keyed by map id when fetched. */
export interface AdminMapNote {
    note: string;
    updated_at: string | null;
}

// ── Global farm map ──────────────────────────────────────────────────────────

export interface GlobalFarmMember {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    role: string | null;
    map_role: string | null;
    is_owner: boolean;
    last_sign_in: string | null;
}

export interface GlobalFarmVehicle {
    id: string;
    name: string | null;
    type: string | null;
    color: string | null;
    last_update: string | null;
    heading: number | null;
    lng: number | null;
    lat: number | null;
    recording: boolean;
}

/** Why a map is treated as a test map (see admin_global_map_farms). */
export type GlobalFarmTestReason = 'manual' | 'internal' | 'name' | 'duplicate';

/** One farm (master map) on the global map. */
export interface GlobalFarm {
    id: string;
    map_name: string | null;
    created_at: string;
    owner_name: string | null;
    owner_email: string | null;
    owner_phone: string | null;
    company_name: string | null;
    subscription: string;
    paid: boolean;
    member_count: number;
    /** Seats on the owner's paid plan (0 on the free plan). */
    paid_seats: number;
    members: GlobalFarmMember[];
    vehicles: GlobalFarmVehicle[];
    vehicles_active_24h: number;
    vehicles_active_7d: number;
    latest_vehicle_update: string | null;
    last_activity: string | null;
    field_count: number;
    hectares: number;
    trail_count: number;
    marker_count: number;
    lng: number | null;
    lat: number | null;
    /** Farm position comes from its fields, or failing that its vehicles. */
    located_by: 'fields' | 'vehicles' | null;
    bbox: [number, number, number, number] | null;
    /** Admin override: true = test, false = real client, null = automatic. */
    manual_flag: boolean | null;
    is_test: boolean;
    test_reasons: GlobalFarmTestReason[];
    duplicate_of: { id: string; name: string | null; shared_fields: number } | null;
}

/** Simplified field boundary: m = map id, n = name, a = hectares, g = GeoJSON geometry. */
export interface GlobalMapField {
    m: string;
    n: string | null;
    a: number | null;
    g: { type: string; coordinates: any };
}

/** One field as the admin field editor lists it (no boundary). */
export interface AdminMapField {
    field_id: string;
    name: string;
    area: number | null;
    farm_id: string | null;
    created_at: string;
}

// Field ids per request when moving or deleting in bulk (keeps the URL short).
const FIELD_BATCH = 100;

const GLOBAL_MAP_FIELDS_PAGE = 1000;
const GLOBAL_MAP_FIELDS_CONCURRENCY = 2;

export const adminApi = {
    /** Every farm with its team, vehicles, content counts and test/duplicate status. */
    async fetchGlobalMapFarms(): Promise<{ success: boolean; data: GlobalFarm[]; error?: string }> {
        try {
            const { data, error } = await supabase.rpc('admin_global_map_farms');

            if (error) {
                console.error('Global map farms RPC error:', error);
                return { success: false, data: [], error: error.message };
            }

            return { success: true, data: (data as GlobalFarm[]) || [] };
        } catch (error: any) {
            console.error('Global map farms fetch error:', error);
            return { success: false, data: [], error: error.message || 'Unexpected error' };
        }
    },

    /**
     * Simplified boundaries for every field, fetched in pages, two at a time
     * (each page stays well under the database statement timeout).
     */
    async fetchGlobalMapFields(
        totalFields: number,
    ): Promise<{ success: boolean; data: GlobalMapField[]; error?: string }> {
        try {
            // One spare page in case fields were added since the farms query.
            const pages = Math.max(1, Math.ceil(totalFields / GLOBAL_MAP_FIELDS_PAGE) + 1);
            const fetchPage = (i: number) =>
                supabase.rpc('admin_global_map_fields', {
                    p_offset: i * GLOBAL_MAP_FIELDS_PAGE,
                    p_limit: GLOBAL_MAP_FIELDS_PAGE,
                });

            // Only a few pages at a time: fetching them all at once makes the
            // queries compete and pushes each one towards the statement timeout.
            const results: GlobalMapField[][] = new Array(pages).fill(null).map(() => []);
            let next = 0;
            let failure: string | null = null;
            const worker = async () => {
                while (next < pages && !failure) {
                    const i = next++;
                    let res = await fetchPage(i);
                    if (res.error) res = await fetchPage(i); // one retry
                    if (res.error) {
                        console.error('Global map fields RPC error:', res.error);
                        failure = res.error.message;
                        return;
                    }
                    results[i] = (res.data as GlobalMapField[]) || [];
                }
            };
            await Promise.all(
                Array.from({ length: Math.min(GLOBAL_MAP_FIELDS_CONCURRENCY, pages) }, worker),
            );

            if (failure) return { success: false, data: [], error: failure };

            return { success: true, data: results.flat() };
        } catch (error: any) {
            console.error('Global map fields fetch error:', error);
            return { success: false, data: [], error: error.message || 'Unexpected error' };
        }
    },

    /** Flag a map as a test map (true), a real client (false), or back to automatic (null). */
    async setMapTestFlag(
        mapId: string,
        isTest: boolean | null,
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const { error } = await supabase.rpc('admin_set_map_test_flag', {
                p_master_map_id: mapId,
                p_is_test: isTest,
            });

            if (error) {
                console.error('Set map test flag error:', error);
                return { success: false, error: error.message };
            }

            return { success: true };
        } catch (error: any) {
            console.error('Set map test flag error:', error);
            return { success: false, error: error.message || 'Unexpected error' };
        }
    },

    /** Every field on one map, without boundaries — for the admin field editor. */
    async fetchMapFields(
        mapId: string,
    ): Promise<{ success: boolean; data: AdminMapField[]; error?: string }> {
        try {
            const { data, error } = await supabase
                .from('fields')
                .select('field_id, name, area, farm_id, created_at')
                .eq('map_id', mapId)
                .order('name', { ascending: true })
                .limit(10000);

            if (error) return { success: false, data: [], error: error.message };
            return { success: true, data: (data as AdminMapField[]) || [] };
        } catch (error: any) {
            return { success: false, data: [], error: error.message || 'Unexpected error' };
        }
    },

    /** Put fields under a farm name on their map (null = no farm name). */
    async moveFields(
        mapId: string,
        fieldIds: string[],
        farmId: string | null,
    ): Promise<{ success: boolean; error?: string }> {
        try {
            for (let i = 0; i < fieldIds.length; i += FIELD_BATCH) {
                const { error } = await supabase
                    .from('fields')
                    .update({ farm_id: farmId })
                    .eq('map_id', mapId)
                    .in('field_id', fieldIds.slice(i, i + FIELD_BATCH));
                if (error) return { success: false, error: error.message };
            }
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message || 'Unexpected error' };
        }
    },

    /**
     * Permanently delete fields from a map. Spray records on those fields go
     * with them; trails stay but lose their field link.
     */
    async deleteFields(
        mapId: string,
        fieldIds: string[],
    ): Promise<{ success: boolean; error?: string }> {
        try {
            for (let i = 0; i < fieldIds.length; i += FIELD_BATCH) {
                const { error } = await supabase
                    .from('fields')
                    .delete()
                    .eq('map_id', mapId)
                    .in('field_id', fieldIds.slice(i, i + FIELD_BATCH));
                if (error) return { success: false, error: error.message };
            }
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message || 'Unexpected error' };
        }
    },

    /** Rename a map (farm). */
    async updateMapName(
        mapId: string,
        name: string,
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const { error } = await supabase
                .from('master_maps')
                .update({ map_name: name })
                .eq('id', mapId);

            if (error) {
                console.error('Update map name error:', error);
                return { success: false, error: error.message };
            }

            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message || 'Unexpected error' };
        }
    },

    /**
     * Change the vehicle a member shows as on a map. Only the icon type and
     * colour change; the rest of their marker (size, swath, load) is kept.
     */
    async updateVehicleMarker(
        mapId: string,
        vehicleId: string,
        change: { type: string; bodyColor: string },
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const { data, error: readError } = await supabase
                .from('vehicle_state')
                .select('vehicle_marker')
                .eq('vehicle_id', vehicleId)
                .eq('master_map_id', mapId)
                .maybeSingle();

            if (readError || !data) {
                return { success: false, error: readError?.message || 'Vehicle not found' };
            }

            const { error } = await supabase
                .from('vehicle_state')
                .update({ vehicle_marker: { ...(data.vehicle_marker || {}), ...change } })
                .eq('vehicle_id', vehicleId)
                .eq('master_map_id', mapId);

            if (error) {
                console.error('Update vehicle marker error:', error);
                return { success: false, error: error.message };
            }

            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message || 'Unexpected error' };
        }
    },

    async fetchDashboardData(): Promise<{ success: boolean; data: AdminMapEntry[]; error?: string }> {
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            if (!sessionData?.session) {
                return { success: false, data: [], error: 'Not logged in' };
            }

            const { data, error } = await supabase.rpc('admin_dashboard_query');

            if (error) {
                console.error('Admin dashboard RPC error:', error);
                return { success: false, data: [], error: error.message };
            }

            return { success: true, data: data || [] };
        } catch (error: any) {
            console.error('Admin dashboard fetch error:', error);
            return { success: false, data: [], error: error.message || 'Unexpected error' };
        }
    },

    async fetchActivityStats(
        since?: string,
        until?: string,
    ): Promise<{ success: boolean; data: AdminMapActivity[]; error?: string }> {
        try {
            const params: Record<string, string> = {}
            if (since) params._since = since
            if (until) params._until = until

            const { data, error } = await supabase.rpc('admin_activity_stats', params);

            if (error) {
                console.error('Admin activity stats RPC error:', error);
                return { success: false, data: [], error: error.message };
            }

            return { success: true, data: data || [] };
        } catch (error: any) {
            console.error('Admin activity stats fetch error:', error);
            return { success: false, data: [], error: error.message || 'Unexpected error' };
        }
    },

    /** Per-map content stats: fields + hectares, trails recorded, markers placed (admin_map_content_stats). */
    async fetchContentStats(): Promise<{ success: boolean; data: AdminMapContentStats[]; error?: string }> {
        try {
            const { data, error } = await supabase.rpc('admin_map_content_stats');

            if (error) {
                console.error('Admin content stats RPC error:', error);
                return { success: false, data: [], error: error.message };
            }

            return { success: true, data: data || [] };
        } catch (error: any) {
            console.error('Admin content stats fetch error:', error);
            return { success: false, data: [], error: error.message || 'Unexpected error' };
        }
    },

    async fetchDailyActivity(
        mapId: string,
        since?: string,
        until?: string,
    ): Promise<{ success: boolean; data: MapDailyRow[]; error?: string }> {
        try {
            const params: Record<string, string> = { _map_id: mapId }
            if (since) params._since = since
            if (until) params._until = until

            const { data, error } = await supabase.rpc('map_daily_activity', params)

            if (error) {
                console.error('Daily activity RPC error:', error)
                return { success: false, data: [], error: error.message }
            }

            return { success: true, data: data || [] }
        } catch (error: any) {
            console.error('Daily activity fetch error:', error)
            return { success: false, data: [], error: error.message || 'Unexpected error' }
        }
    },

    // ── Admin map notes ──────────────────────────────────────────────────────

    /** All non-empty notes, keyed by master_map_id. */
    async fetchMapNotes(): Promise<{
        success: boolean;
        data: Record<string, AdminMapNote>;
        error?: string;
    }> {
        try {
            const { data, error } = await supabase.rpc('admin_map_notes_query');

            if (error) {
                console.error('Admin map notes RPC error:', error);
                return { success: false, data: {}, error: error.message };
            }

            return { success: true, data: (data as Record<string, AdminMapNote>) || {} };
        } catch (error: any) {
            console.error('Admin map notes fetch error:', error);
            return { success: false, data: {}, error: error.message || 'Unexpected error' };
        }
    },

    /** Create/update the note for one map. An empty note clears it. */
    async saveMapNote(
        mapId: string,
        note: string,
    ): Promise<{ success: boolean; data?: AdminMapNote; error?: string }> {
        try {
            const { data, error } = await supabase.rpc('admin_set_map_note', {
                p_master_map_id: mapId,
                p_note: note,
            });

            if (error) {
                console.error('Save map note error:', error);
                return { success: false, error: error.message };
            }

            return {
                success: true,
                data: (data as AdminMapNote) || { note, updated_at: null },
            };
        } catch (error: any) {
            console.error('Save map note error:', error);
            return { success: false, error: error.message || 'Unexpected error' };
        }
    },

    async updateMemberName(
        profileId: string,
        newName: string,
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ full_name: newName, updated_at: new Date().toISOString() })
                .eq('id', profileId)

            if (error) {
                console.error('Update member name error:', error)
                return { success: false, error: error.message }
            }

            return { success: true }
        } catch (error: any) {
            return { success: false, error: error.message || 'Unexpected error' }
        }
    },

    async updateMemberRole(
        profileId: string,
        newRole: string,
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ role: newRole, updated_at: new Date().toISOString() })
                .eq('id', profileId)

            if (error) {
                console.error('Update member role error:', error)
                return { success: false, error: error.message }
            }

            return { success: true }
        } catch (error: any) {
            return { success: false, error: error.message || 'Unexpected error' }
        }
    },

    async transferOwnership(
        mapId: string,
        newOwnerId: string,
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const { error } = await supabase
                .from('master_maps')
                .update({ master_user_id: newOwnerId })
                .eq('id', mapId)

            if (error) {
                console.error('Transfer ownership error:', error)
                return { success: false, error: error.message }
            }

            return { success: true }
        } catch (error: any) {
            return { success: false, error: error.message || 'Unexpected error' }
        }
    },
};
