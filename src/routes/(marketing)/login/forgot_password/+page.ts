import { browser } from '$app/environment';
import { session } from '$lib/stores/sessionStore';
import { get } from 'svelte/store';
import { redirect } from '@sveltejs/kit';

export function load() {
    // If the user is already logged in, redirect them away from the forgot password page
    if (browser && get(session)) {
        throw redirect(303, '/static_auth');
    }

    return {};
}