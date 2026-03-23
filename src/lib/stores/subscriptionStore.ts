// stores/subscriptionStore.ts
import { writable } from "svelte/store"

export const subscriptionStore = writable({
    subscription: null,
    subscription_status: null,
    stripe_subscription_id: null,
    marker_limit: null,
    trail_limit: null,
    lingering_seats: null,
    current_seats: null,
    next_billing_date: null,
})
