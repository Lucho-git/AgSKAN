// src/lib/api/deletionRequestApi.ts
import { supabase } from '$lib/supabaseClient';
import { toast } from "svelte-sonner";

export const deletionRequestApi = {
    async submitDeletionRequest(requestData: {
        fullName: string;
        registeredEmail?: string;
        contactEmail?: string;
        description?: string;
    }) {
        try {
            // Prepare the data for insertion
            const insertData = {
                full_name: requestData.fullName.trim(),
                registered_email: requestData.registeredEmail?.trim() || null,
                contact_email: requestData.contactEmail?.trim() || null,
                description: requestData.description?.trim() || null
            };

            // Submit the request to the database
            const { error } = await supabase
                .from('deletion_requests')
                .insert(insertData);

            if (error) {
                console.error("Error submitting deletion request:", error);
                return { success: false, message: "Failed to submit request" };
            }

            return { success: true };
        } catch (error) {
            console.error("Error in submitDeletionRequest:", error);
            return { success: false, message: "An error occurred" };
        }
    }
};