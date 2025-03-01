// src/routes/(admin)/account/billing/+page.ts
import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { session } from "$lib/stores/sessionStore";
import { get } from "svelte/store";

export const load = async ({ parent }) => {
    // Skip SSR - only run in browser
    if (!browser) return { loading: true };

    // Wait for parent layout data - this ensures session is initialized
    const layoutData = await parent();

    // Default data structure
    const defaultData = {
        loading: true,
        isActiveCustomer: false,
        hasEverHadSubscription: false,
        currentPlanId: "free",
        subscriptionData: null,
        error: null
    };

    try {
        // Check for authentication
        const currentSession = get(session);
        if (!currentSession?.access_token) {
            console.error("No valid session for billing page");
            goto("/login");
            return defaultData;
        }

        // Fetch subscription data from our API
        const response = await fetch("/api/customer/subscription", {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${currentSession.access_token}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to fetch subscription data");
        }

        const data = await response.json();

        return {
            loading: false,
            isActiveCustomer: !!data.primarySubscription,
            hasEverHadSubscription: data.hasEverHadSubscription,
            currentPlanId: data.primarySubscription?.appSubscription?.id || "free",
            subscriptionData: data.primarySubscription,
            error: null
        };
    } catch (error) {
        console.error("Error loading billing data:", error);
        return {
            ...defaultData,
            loading: false,
            error: error.message
        };
    }
};

export const ssr = false;