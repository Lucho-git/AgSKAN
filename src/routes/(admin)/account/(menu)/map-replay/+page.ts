// src/routes/(admin)/account/(menu)/map-replay/+page.ts
import type { PageLoad } from "./$types";
import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { session, initializeSession } from "$lib/stores/sessionStore";
import { get } from "svelte/store";
import { supabase } from "$lib/supabaseClient";

export const ssr = false;

export const load: PageLoad = async () => {
    if (!browser) return { loading: true };

    try {
        await initializeSession();
        const currentSession = get(session);
        if (!currentSession?.user?.id) {
            goto("/login");
            return { loading: true };
        }

        const { data: profile } = await supabase
            .from("profiles")
            .select("master_map_id, full_name")
            .eq("id", currentSession.user.id)
            .single();

        const masterMapId = profile?.master_map_id;
        if (!masterMapId) {
            return { loading: false, error: "No master map connected" };
        }

        // Load fields with boundaries
        const { data: fields, error: fieldsError } = await supabase
            .from("fields")
            .select("field_id, name, area, boundary")
            .eq("map_id", masterMapId)
            .order("name");

        if (fieldsError) throw fieldsError;

        // Load all spray records (with field_path for trail rendering)
        const { data: records, error: recordsError } = await supabase
            .from("spray_records")
            .select(`
                id, trail_id, field_id, operation_id, vehicle_id,
                operator_id, operator_name, operator_confirmed,
                start_time, end_time, duration_seconds,
                area_hectares, distance_km, point_count,
                vehicle_type, swath_width, intervals, interval_paths,
                field_path, status, activity_type,
                gen_dominant_field_id, gen_pct_of_dominant,
                gen_edge_noise, gen_method
            `)
            .eq("master_map_id", masterMapId)
            .not("field_path", "is", null)
            .order("start_time", { ascending: true });

        if (recordsError) throw recordsError;

        // Load operations for labels
        const { data: operations, error: opsError } = await supabase
            .from("operations")
            .select("id, name")
            .eq("master_map_id", masterMapId);

        if (opsError) throw opsError;

        const fieldMap = new Map((fields || []).map(f => [f.field_id, f]));
        const opMap = new Map((operations || []).map(o => [o.id, o.name]));

        return {
            loading: false,
            masterMapId,
            fields: fields || [],
            records: (records || []).map(r => ({
                ...r,
                field_name: fieldMap.get(r.field_id)?.name || "Unknown",
                field_boundary: fieldMap.get(r.field_id)?.boundary || null,
                operation_name: opMap.get(r.operation_id) || "Unknown",
            })),
        };
    } catch (e: any) {
        return { loading: false, error: e.message };
    }
};
