// src/lib/api/farmApi.ts
import { supabase } from '$lib/supabaseClient';
import type { Farm } from '$lib/stores/farmsStore';

export const farmApi = {

    /**
     * Load all farms for a given map.
     */
    async loadFarms(mapId: string): Promise<{ farms: Farm[]; error?: string }> {
        try {
            const { data, error } = await supabase
                .from('farms')
                .select('*')
                .eq('map_id', mapId)
                .order('created_at', { ascending: true });

            if (error) throw error;
            return { farms: data || [] };
        } catch (error: any) {
            console.error('Error loading farms:', error);
            return { farms: [], error: error.message };
        }
    },

    /**
     * Create a new farm on a map. Returns the created row.
     */
    async createFarm(mapId: string, name: string): Promise<{ success: boolean; farm?: Farm; message?: string }> {
        try {
            const { data, error } = await supabase
                .from('farms')
                .insert([{ map_id: mapId, name: name.trim() }])
                .select('*')
                .single();

            if (error) {
                if (error.code === '23505') {
                    return { success: false, message: `Farm "${name}" already exists on this map` };
                }
                throw error;
            }

            return { success: true, farm: data };
        } catch (error: any) {
            console.error('Error creating farm:', error);
            return { success: false, message: error.message };
        }
    },

    /**
     * Rename a farm.
     */
    async renameFarm(farmId: string, newName: string): Promise<{ success: boolean; message?: string }> {
        try {
            const { error } = await supabase
                .from('farms')
                .update({ name: newName.trim() })
                .eq('id', farmId);

            if (error) {
                if (error.code === '23505') {
                    return { success: false, message: `Farm "${newName}" already exists on this map` };
                }
                throw error;
            }

            return { success: true };
        } catch (error: any) {
            console.error('Error renaming farm:', error);
            return { success: false, message: error.message };
        }
    },

    /**
     * Delete a farm by ID. Fields with this farm_id get SET NULL (per FK).
     */
    async deleteFarm(farmId: string): Promise<{ success: boolean; message?: string }> {
        try {
            const { error } = await supabase
                .from('farms')
                .delete()
                .eq('id', farmId);

            if (error) throw error;
            return { success: true };
        } catch (error: any) {
            console.error('Error deleting farm:', error);
            return { success: false, message: error.message };
        }
    },

    /**
     * Find an existing farm by name on a map, or create it if it doesn't exist.
     * Used during field upload to resolve a farm name string into a farm_id.
     */
    async getOrCreateFarm(mapId: string, name: string): Promise<{ farmId: string | null; error?: string }> {
        try {
            const trimmed = name.trim();
            if (!trimmed) return { farmId: null, error: 'Farm name is empty' };

            // Try to find existing
            const { data: existing, error: findError } = await supabase
                .from('farms')
                .select('id')
                .eq('map_id', mapId)
                .eq('name', trimmed)
                .maybeSingle();

            if (findError) throw findError;

            if (existing) {
                return { farmId: existing.id };
            }

            // Create new
            const { data: created, error: createError } = await supabase
                .from('farms')
                .insert([{ map_id: mapId, name: trimmed }])
                .select('id')
                .single();

            if (createError) throw createError;

            return { farmId: created.id };
        } catch (error: any) {
            console.error('Error in getOrCreateFarm:', error);
            return { farmId: null, error: error.message };
        }
    },
};
