// src/lib/stores/sessionStore.ts
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import {
    PUBLIC_SUPABASE_ANON_KEY,
    PUBLIC_SUPABASE_URL
} from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

// Initialize supabase client
export const supabase = createClient(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY,
    {
        auth: {
            persistSession: true,  // Ensure session is stored in localStorage
            autoRefreshToken: true,
            detectSessionInUrl: true,
        }
    }
);

// Create a writable store for the session
export const session = writable(null);

let initialized = false;

// Function to initialize and refresh the session
export async function initializeSession() {
    if (!browser || initialized) return;

    console.log("Initializing session store...");

    try {
        // Get the current session
        const { data, error } = await supabase.auth.getSession();

        if (error) {
            console.error("Error getting session:", error);
            return;
        }

        console.log("Session initialization result:", data.session ? "Found session" : "No session");

        if (data.session) {
            session.set(data.session);
        }

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
            console.log("Auth state changed:", event);

            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                console.log("Setting session in store due to auth event");
                session.set(newSession);
            } else if (event === 'SIGNED_OUT') {
                console.log("Clearing session in store due to sign out");
                session.set(null);
            }
        });

        initialized = true;
        return () => {
            console.log("Cleaning up session subscription");
            subscription.unsubscribe();
        };
    } catch (e) {
        console.error("Error in session initialization:", e);
    }
}

// Helper for local storage (replacing HTTP cookies)
export function setPendingMapId(mapId) {
    if (browser) {
        localStorage.setItem('pending_map_id', mapId);
    }
}

export function getPendingMapId() {
    if (browser) {
        return localStorage.getItem('pending_map_id');
    }
    return null;
}

export function clearPendingMapId() {
    if (browser) {
        localStorage.removeItem('pending_map_id');
    }
}