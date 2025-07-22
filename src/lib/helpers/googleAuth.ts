import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { supabase } from '$lib/stores/sessionStore';

export async function signInWithGoogle() {
    try {
        if (Capacitor.isNativePlatform()) {
            console.log('Using native Google login');

            // Initialize the plugin with explicit configuration
            try {
                await SocialLogin.initialize({
                    google: {
                        webClientId: '838630639549-vabhickg9ad67hffa0ftb2uil9fr94fd.apps.googleusercontent.com',
                        androidClientId: '838630639549-v71401637scd3tiqehv14dbth6812qdb.apps.googleusercontent.com',
                    }
                });
                console.log('SocialLogin plugin initialized successfully');
            } catch (initError) {
                console.error('Failed to initialize SocialLogin plugin:', initError);
                throw new Error('Failed to initialize Google authentication');
            }

            // Attempt login
            const result = await SocialLogin.login({
                provider: 'google'
            });

            console.log('Native Google login result:', result);

            // Use the ID token with Supabase
            const { data, error } = await supabase.auth.signInWithIdToken({
                provider: 'google',
                token: result.result.idToken,
            });

            if (error) {
                console.error('Supabase auth error:', error);
                throw error;
            }

            return data;
        } else {
            // Web login
            console.log('Using web Google login');
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/auth/callback?next=/account`
                }
            });

            if (error) throw error;
            return data;
        }
    } catch (error) {
        console.error('Google sign in error:', error);
        throw error;
    }
}