// src/routes/(admin)/account/billing/+page.ts
import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { subscriptionApi } from "$lib/api/subscriptionApi";

export const load = async ({ parent }) => {
    // Skip SSR - only run in browser
    if (!browser) return { loading: true };

    // Wait for parent layout data
    await parent();

    // Default data
    const defaultData = {
        loading: true,
        isActiveCustomer: false,
        hasEverHadSubscription: false,
        currentPlanId: "free",
        subscriptionData: null,
        error: null
    };

    try {
        // Load subscription data
        const result = await subscriptionApi.getSubscriptionData();

        if (!result.success) {
            throw new Error(result.message || "Failed to fetch subscription data");
        }

        return {
            loading: false,
            isActiveCustomer: result.isActiveCustomer,
            hasEverHadSubscription: result.hasEverHadSubscription,
            currentPlanId: result.currentPlanId,
            subscriptionData: result.subscriptionData,
            error: null
        };
    } catch (error) {
        console.error("Error loading billing data:", error);

        // If the error is an auth error, redirect to login
        if (error.message?.includes("Not authenticated")) {
            goto("/login");
        }

        return {
            ...defaultData,
            loading: false,
            error: error.message
        };
    }
};

export const ssr = false;