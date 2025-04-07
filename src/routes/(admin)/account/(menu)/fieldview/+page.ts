// src/routes/admin/fieldview/+page.ts
import type { PageLoad } from "./$types";
import { userFilesStore } from "./userFilesStore";
import { fieldStore } from "../../../../../stores/fieldStore";
import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { session, initializeSession } from "$lib/stores/sessionStore";
import { get } from "svelte/store";
import { fileApi } from "$lib/api/fileApi";

// Set export const ssr = false to disable SSR for this route
export const ssr = false;

export const load: PageLoad = async () => {
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

        // Fetch files using fileApi
        try {
            filesData = await fileApi.getUserFiles();
            userFilesStore.set(filesData);
        } catch (fileError) {
            console.error("Error fetching files:", fileError);
            error = "Failed to fetch files.";
        }

        // Attempt to fetch fields
        if (!error) {
            try {
                const fieldsResult = await fileApi.loadFields();
                if (fieldsResult.fields) {
                    fieldsData = fieldsResult.fields;
                    fieldStore.set(fieldsData);
                }
            } catch (fieldError) {
                console.error("Error fetching fields:", fieldError);
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
        console.error("Load error:", error);
        return {
            files: [],
            fields: [],
            error: "Failed to fetch data: " + (error.message || "Unknown error"),
            loading: false
        };
    }
};