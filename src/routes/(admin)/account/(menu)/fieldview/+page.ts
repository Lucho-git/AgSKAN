// src/routes/admin/fieldview/+page.ts
import type { PageLoad } from "./$types";
import { userFilesStore } from "./userFilesStore";
import { fieldStore } from "../../../../../stores/fieldStore";
import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { session, initializeSession } from "$lib/stores/sessionStore";
import { get } from "svelte/store";

// Set export const ssr = false to disable SSR for this route
export const ssr = false;

export const load: PageLoad = async ({ fetch, url }) => {
    // Skip on server
    if (!browser) {
        return { loading: true };
    }

    try {
        // Initialize session
        await initializeSession();

        // Get the session after initialization
        const currentSession = get(session);

        if (!currentSession?.user?.id) {
            goto("/login");
            return { files: [], fields: [], loading: true };
        }

        let filesData = [];
        let fieldsData = [];
        let error = null;

        // Fetch files with Authorization header
        try {
            const filesResponse = await fetch("/api/files", {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${currentSession.access_token}`
                },
            });

            if (!filesResponse.ok) {
                throw new Error(
                    `Failed to fetch files: ${filesResponse.status} ${filesResponse.statusText}`
                );
            }

            filesData = await filesResponse.json();
            userFilesStore.set(filesData);
        } catch (fileError) {
            error = "Failed to fetch files.";
        }

        // Attempt to fetch fields
        if (!error) {
            try {
                const fieldsResponse = await fetch("/api/files/load_fields", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${currentSession.access_token}`
                    },
                });

                if (fieldsResponse.ok) {
                    const fieldsResult = await fieldsResponse.json();
                    fieldsData = fieldsResult.fields || [];
                    fieldStore.set(fieldsData);
                }
            } catch (fieldError) {
                // We don't set error here as it's not critical
            }
        }

        return {
            files: filesData,
            fields: fieldsData,
            error,
            loading: false
        };
    } catch (error) {
        return {
            files: [],
            fields: [],
            error: "Failed to fetch data: " + (error.message || "Unknown error"),
            loading: false
        };
    }
};