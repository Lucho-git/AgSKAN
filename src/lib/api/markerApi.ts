// src/lib/api/markerApi.ts
import { supabase } from '$lib/supabaseClient';

type MarkerVisibility = 'always' | 'selected' | 'hidden';

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

    async updateMarkerNoteVisibility(markerId: string, visible: boolean) {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            const { data: marker, error: loadError } = await supabase
                .from("map_markers")
                .select("marker_data")
                .eq("id", markerId)
                .single();

            if (loadError) {
                throw new Error(`Failed to load marker settings: ${loadError.message}`);
            }

            const existingData = marker?.marker_data || {};
            const existingProperties = existingData.properties || {};

            const { data, error } = await supabase
                .from("map_markers")
                .update({
                    marker_data: {
                        ...existingData,
                        properties: {
                            ...existingProperties,
                            note_label_visible: visible,
                        },
                    },
                    updated_at: new Date().toISOString(),
                    update_user_id: session.session.user.id,
                })
                .eq("id", markerId)
                .select("*")
                .single();

            if (error) {
                throw new Error(`Failed to update note label visibility: ${error.message}`);
            }

            return {
                success: true,
                message: "Note label visibility updated successfully",
                marker: data,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to update note label visibility";
            console.error("Error updating note label visibility:", error);
            return {
                success: false,
                error: message,
                message,
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

    async updateMarkerVisibilitySettings(visibilitySettings: Record<string, MarkerVisibility>) {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            const markerIds = Object.keys(visibilitySettings || {});
            if (markerIds.length === 0) {
                return {
                    success: true,
                    message: "No marker visibility settings to save"
                };
            }

            const { data: markers, error: loadError } = await supabase
                .from("map_markers")
                .select("id, marker_data")
                .in("id", markerIds);

            if (loadError) {
                throw new Error(`Failed to load marker visibility settings: ${loadError.message}`);
            }

            const updates = (markers || []).map((marker) => {
                const existingData = marker.marker_data || {};
                const existingProperties = existingData.properties || {};
                const visibility = visibilitySettings[marker.id] || "always";

                return supabase
                    .from("map_markers")
                    .update({
                        marker_data: {
                            ...existingData,
                            properties: {
                                ...existingProperties,
                                drawings_visibility: visibility,
                            },
                        },
                        updated_at: new Date().toISOString(),
                        update_user_id: session.session.user.id,
                    })
                    .eq("id", marker.id);
            });

            const results = await Promise.all(updates);
            const failedUpdate = results.find((result) => result.error);

            if (failedUpdate?.error) {
                throw new Error(`Failed to save marker visibility settings: ${failedUpdate.error.message}`);
            }

            return {
                success: true,
                message: "Marker visibility settings saved successfully"
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to save marker visibility settings";
            console.error("Error updating marker visibility settings:", error);
            return {
                success: false,
                error: message,
                message
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