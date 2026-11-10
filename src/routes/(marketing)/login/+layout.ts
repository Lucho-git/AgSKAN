// +layout.ts
import { supabase } from "$lib/stores/sessionStore";

export const load = async ({ depends, url }) => {
    depends("supabase:auth");

    // Use the shared client. Creating an extra supabase-js client on every
    // navigation makes several clients share one storage key, and they then race
    // each other over refresh-token rotation (which logs people out at random).
    const { data: { session } } = await supabase.auth.getSession();

    return {
        session,
        url: url.origin
    };
};