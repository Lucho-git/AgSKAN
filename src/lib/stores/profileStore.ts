// stores/profileStore.ts
import { writable } from "svelte/store"

export const profileStore = writable<{
    id: string | null
    full_name: string | null
    email: string | null
    company_name: string | null
    website: string | null
    survey_completed: boolean
    master_map_id: string | null
    /** profiles.role — 'manager' | 'operator' | 'viewer' (set by the account layout). */
    user_type?: string | null
    recent_maps?: string[] | null
    selected_operation_id?: string | null
    mobile?: string | null
}>({
    id: null,
    full_name: null,
    email: null,
    company_name: null,
    website: null,
    survey_completed: false,
    master_map_id: null,
})
