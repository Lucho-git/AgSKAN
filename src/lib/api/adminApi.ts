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

export const adminApi = {
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
