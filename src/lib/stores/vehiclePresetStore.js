// src/lib/stores/vehiclePresetStore.js
import { writable, get } from 'svelte/store'
import { supabase } from '../supabaseClient'

function createVehiclePresetStore() {
  const { subscribe, set, update } = writable([])
  
  return {
    subscribe,
    
    // Load all presets for a master map
    loadPresetsForMap: async (masterMapId) => {
      try {
        const { data, error } = await supabase
          .from('vehicle_presets')
          .select('*')
          .eq('master_map_id', masterMapId)
          .order('created_at', { ascending: false })

        if (error) throw error

        console.log('✅ Loaded vehicle presets from database:', data)
        set(data || [])
        return data
      } catch (error) {
        console.error('Error loading vehicle presets:', error)
        set([])
        return []
      }
    },

    // Add a new preset
    addPreset: async (masterMapId, userId, preset) => {
      try {
        const newPreset = {
          master_map_id: masterMapId,
          created_by: userId,
          name: preset.name,
          type: preset.type,
          body_color: preset.bodyColor,
          swath: preset.swath,
          size: preset.size,
        }

        const { data, error } = await supabase
          .from('vehicle_presets')
          .insert(newPreset)
          .select()
          .single()

        if (error) {
          if (error.code === '23505') {
            throw new Error(`A preset named "${preset.name}" already exists`)
          }
          throw error
        }

        console.log('✅ Added preset to database:', data)
        
        // Add to local store
        update(presets => [...presets, data])
        
        return data
      } catch (error) {
        console.error('Error adding preset:', error)
        throw error
      }
    },

    // Delete a preset
    deletePreset: async (id) => {
      try {
        const { error } = await supabase
          .from('vehicle_presets')
          .delete()
          .eq('id', id)

        if (error) throw error

        console.log('✅ Deleted preset from database:', id)

        // Remove from local store
        update(presets => presets.filter(p => p.id !== id))
      } catch (error) {
        console.error('Error deleting preset:', error)
        throw error
      }
    },

    // Get all presets
    getAll: () => {
      return get({ subscribe })
    },
  }
}

export const vehiclePresetStore = createVehiclePresetStore()