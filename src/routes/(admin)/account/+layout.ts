// routes/(admin)/account/+layout.ts
import { browser } from "$app/environment"
import { session, supabase } from "$lib/stores/sessionStore"
import { get } from "svelte/store"

// This is a simple pass-through loader for static generation
export const load = async () => {
    // Return empty object - all data loading will happen client-side
    return {}
}