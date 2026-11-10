// stores/subscriptionStore.ts
import { writable } from "svelte/store"

export interface SubscriptionState {
    subscription: string | null
    subscription_status: string | null
    stripe_subscription_id: string | null
    marker_limit: number | null
    trail_limit: number | null
    lingering_seats: number | null
    current_seats: number | null
    next_billing_date: string | null
}

export const subscriptionStore = writable<SubscriptionState>({
    subscription: null,
    subscription_status: null,
    stripe_subscription_id: null,
    marker_limit: null,
    trail_limit: null,
    lingering_seats: null,
    current_seats: null,
    next_billing_date: null,
})
