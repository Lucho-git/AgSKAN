// src/routes/+page.ts
export const prerender = true;
import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { Capacitor } from '@capacitor/core';

export const load = async () => {
    if (browser) {
        if (Capacitor.isNativePlatform()) {
            // No need to check url.pathname here, as this load function
            // only runs for the '/' route.
            console.log("Capacitor native platform detected on root page. Redirecting to /account...");
            throw redirect(307, '/account');
        }
    }
    return {}; // Or any props for your actual homepage if it's sometimes shown
};