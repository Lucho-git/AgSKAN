// src/routes/(admin)/account/(menu)/records/+page.ts
import type { PageLoad } from "./$types";
import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { session, initializeSession } from "$lib/stores/sessionStore";
import { get } from "svelte/store";
import { supabase } from "$lib/supabaseClient";

export const ssr = false;

export const load: PageLoad = async () => {
    if (!browser) {
        return { loading: true };
    }

    try {
        await initializeSession();
        const currentSession = get(session);

        if (!currentSession?.user?.id) {
            goto("/login");
            return { loading: true };
        }

        // Get the user's master_map_id
        const { data: profile } = await supabase
            .from("profiles")
            .select("master_map_id, full_name")
            .eq("id", currentSession.user.id)
            .single();

        const masterMapId = profile?.master_map_id;
        if (!masterMapId) {
            return { loading: false, error: "No master map connected" };
        }

        // Load fields for the filter dropdown (including boundary for snapshots)
        const { data: fields, error: fieldsError } = await supabase
            .from("fields")
            .select("field_id, name, area, boundary")
            .eq("map_id", masterMapId)
            .order("name");

        if (fieldsError) throw fieldsError;

        // Load operations for the filter dropdown
        const { data: operations, error: operationsError } = await supabase
            .from("operations")
            .select("id, name, year")
            .eq("master_map_id", masterMapId)
            .order("name");

        if (operationsError) throw operationsError;

        // Load spray records for this farm (including interval_paths for snapshots)
        const { data: records, error: recordsError } = await supabase
            .from("spray_records")
            .select(`
                id, trail_id, field_id, operation_id, vehicle_id,
                operator_id, operator_name, operator_confirmed,
                start_time, end_time, duration_seconds,
                area_hectares, distance_km, point_count,
                vehicle_type, swath_width, intervals, interval_paths,
                field_path, status, activity_type,
                chem_mix, weather_data, created_at
            `)
            .eq("master_map_id", masterMapId)
            .order("start_time", { ascending: false });

        if (recordsError) throw recordsError;

        // Get field names + boundaries for the records
        const fieldMap = new Map((fields || []).map(f => [f.field_id, f]));
        const opMap = new Map((operations || []).map(o => [o.id, o.name]));

        const recordsWithFieldNames = (records || []).map(r => {
            const field = fieldMap.get(r.field_id)
            return {
                ...r,
                field_name: field?.name || "Unknown",
                operation_name: opMap.get(r.operation_id) || "Unknown",
                field_boundary: field?.boundary || null,
            }
        });

        return {
            loading: false,
            records: recordsWithFieldNames,
            fields: fields || [],
            operations: operations || [],
            operatorName: profile?.full_name || "",
            masterMapId,
        };
    } catch (error) {
        console.error("Error loading records page:", error);
        return { loading: false, error: error.message };
    }
};