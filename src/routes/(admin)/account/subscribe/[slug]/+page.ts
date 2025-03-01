// src/routes/(admin)/account/subscribe/[slug]/+page.ts
import { browser } from "$app/environment";

export const load = ({ params }) => {
    if (!browser) return {};

    // Just return the slug - most logic moved to onMount in the svelte component
    return { slug: params.slug };
};