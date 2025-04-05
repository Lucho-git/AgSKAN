// src/routes/(admin)/account/billing/manage/+page.ts
import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { session } from "$lib/stores/sessionStore";
import { get } from "svelte/store";
import { toast } from "svelte-sonner";

export const load = async () => {
    // Skip SSR - only run in browser
    if (!browser) return { loading: true };

    try {
        // Check for authentication
        const currentSession = get(session);
        if (!currentSession?.access_token) {
            console.error("No valid session for billing management");
            goto("/login");
            return { loading: true };
        }

        console.log("Making request to /api/subscription/manage");

        // Fetch subscription data from our API
        const response = await fetch("/api/subscription/manage", {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${currentSession.access_token}`
            }
        });

        console.log("Response status:", response.status);

        if (!response.ok) {
            const responseText = await response.text();
            console.error("API error response:", responseText);
            try {
                const errorData = JSON.parse(responseText);
                throw new Error(errorData.error || "Failed to fetch subscription details");
            } catch (e) {
                throw new Error(`Failed to fetch subscription details (${response.status})`);
            }
        }

        const data = await response.json();
        console.log("Response data structure:", Object.keys(data));
        console.log("Has subscriptionData:", data.subscriptionData ? "Yes" : "No");
        console.log("Has primarySubscription:", data.subscriptionData?.primarySubscription ? "Yes" : "No");

        if (!data.subscriptionData?.primarySubscription) {
            console.log("No primary subscription found in data");
            goto("/account/billing");
            return { loading: true };
        }

        return {
            loading: false,
            subscriptionData: data.subscriptionData.primarySubscription,
            seatManagementInfo: data.seatManagementInfo,
            error: null
        };
    } catch (error) {
        console.error("Error loading subscription management data:", error);
        toast.error("Failed to load subscription details");

        // Redirect back to billing page after error
        setTimeout(() => goto("/account/billing"), 2000);

        return {
            loading: false,
            error: error.message,
            subscriptionData: null,
            seatManagementInfo: null
        };
    }
};

export const ssr = false;