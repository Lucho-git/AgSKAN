// src/routes/static_auth/+layout.ts
import { browser } from '$app/environment';
import { supabase } from '$lib/stores/sessionStore';

export const load = async () => {
    // For client-side only, all session management happens in the component itself
    // This load function is minimal as we're getting session from the store

    // If we wanted to preload additional user data, we could do it here
    if (browser) {
        // You could preload additional profile info here if needed
        // const { data: profile } = await supabase
        //   .from('profiles')
        //   .select('*')
        //   .single();

        // return { profile };
    }

    return {};
};