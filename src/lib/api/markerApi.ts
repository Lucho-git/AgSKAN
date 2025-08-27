// src/lib/api/markerApi.ts
import { supabase } from '$lib/supabaseClient';

export const markerApi = {
    // Update the notes for a marker
    async updateMarkerNotes(markerId: string, notes: string) {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            const { data, error } = await supabase
                .from("map_markers")
                .update({
                    notes: notes.trim(),
                    updated_at: new Date().toISOString(),
                    update_user_id: session.session.user.id
                })
                .eq("id", markerId)
                .select("*")
                .single();

            if (error) {
                throw new Error(`Failed to update marker notes: ${error.message}`);
            }

            if (!data) {
                throw new Error("Marker not found");
            }

            return {
                success: true,
                message: "Notes updated successfully",
                marker: data
            };
        } catch (error) {
            console.error("Error updating marker notes:", error);
            return {
                success: false,
                message: error.message
            };
        }
    },

    // Update marker icon/iconClass
    async updateMarkerIcon(markerId: string, iconClass: string) {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            // Update the marker_data.iconClass field in the JSONB column
            const { data, error } = await supabase
                .from("map_markers")
                .update({
                    marker_data: supabase.rpc('jsonb_set', {
                        target: supabase.raw('marker_data'),
                        path: '{iconClass}',
                        new_value: JSON.stringify(iconClass)
                    }),
                    updated_at: new Date().toISOString(),
                    update_user_id: session.session.user.id
                })
                .eq("id", markerId)
                .select("*")
                .single();

            if (error) {
                throw new Error(`Failed to update marker icon: ${error.message}`);
            }

            if (!data) {
                throw new Error("Marker not found");
            }

            return {
                success: true,
                message: "Marker icon updated successfully",
                marker: data
            };
        } catch (error) {
            console.error("Error updating marker icon:", error);
            return {
                success: false,
                message: error.message
            };
        }
    },

    // Delete a marker (soft delete)
    async deleteMarker(markerId: string) {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            const { data, error } = await supabase
                .from("map_markers")
                .update({
                    deleted: true,
                    deleted_at: new Date().toISOString(),
                    update_user_id: session.session.user.id
                })
                .eq("id", markerId)
                .select("*")
                .single();

            if (error) {
                throw new Error(`Failed to delete marker: ${error.message}`);
            }

            return {
                success: true,
                message: "Marker deleted successfully",
                marker: data
            };
        } catch (error) {
            console.error("Error deleting marker:", error);
            return {
                success: false,
                message: error.message
            };
        }
    }
};