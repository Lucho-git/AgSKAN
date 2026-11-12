import { writable } from "svelte/store"

export type Device = "phone" | "tablet"

/**
 * Which device the landing page's map illustrations are framed in. Shared so
 * the hero and the feature section switch together. Tablet is the default:
 * it's what we recommend mounting in the cab.
 */
export const device = writable<Device>("tablet")
