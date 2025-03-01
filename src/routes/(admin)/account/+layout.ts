// routes/(admin)/account/+layout.ts
import { browser } from "$app/environment";
import { session, initializeSession } from "$lib/stores/sessionStore";
import { redirect } from "@sveltejs/kit";
import { get } from "svelte/store";

export const load = async () => {
    // Skip on server
    if (!browser) return { sessionStatus: "loading" };

    try {
        // Start session initialization
        const initPromise = initializeSession();

        // Return immediately with loading status to show loading UI
        return {
            sessionStatus: "initializing",
            // This allows the component to await the promise
            sessionPromise: initPromise.then(() => {
                const currentSession = get(session);
                return {
                    isAuthenticated: !!currentSession?.user?.id,
                    userId: currentSession?.user?.id
                };
            })
        };
    } catch (error) {
        console.error("Error in layout load:", error);
        return { sessionStatus: "error", error: error.message };
    }
};

export const ssr = false;