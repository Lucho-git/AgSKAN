import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { supabase } from '$lib/stores/sessionStore';

export async function signInWithGoogle() {
    return signInWithProvider('google');
}

export async function signInWithApple() {
    return signInWithProvider('apple');
}

// Get the appropriate provider for the current platform
export function getNativeProvider(): 'google' | 'apple' | null {
    if (!Capacitor.isNativePlatform()) return null;

    const platform = Capacitor.getPlatform();
    if (platform === 'android') return 'google';
    if (platform === 'ios') return 'apple';

    return null;
}

async function signInWithProvider(provider: 'google' | 'apple') {
    try {
        if (Capacitor.isNativePlatform()) {
            console.log(`Using native ${provider} login`);

            // Initialize the plugin with platform-specific configuration
            try {
                const config: any = {};

                if (provider === 'google') {
                    config.google = {
                        webClientId: '838630639549-vabhickg9ad67hffa0ftb2uil9fr94fd.apps.googleusercontent.com',
                        androidClientId: '838630639549-v71401637scd3tiqehv14dbth6812qdb.apps.googleusercontent.com',
                    };
                } else if (provider === 'apple') {
                    config.apple = {
                        // Apple doesn't need additional config for iOS
                    };
                }

                await SocialLogin.initialize(config);
                console.log('SocialLogin plugin initialized successfully');
            } catch (initError) {
                console.error('Failed to initialize SocialLogin plugin:', initError);
                throw new Error(`Failed to initialize ${provider} authentication`);
            }

            // Attempt login
            const result = await SocialLogin.login({
                provider: provider
            });

            console.log(`Native ${provider} login result:`, result);

            // Use the ID token with Supabase
            const { data, error } = await supabase.auth.signInWithIdToken({
                provider: provider,
                token: result.result.idToken,
            });

            if (error) {
                console.error('Supabase auth error:', error);
                throw error;
            }

            return data;
        } else {
            // Web login
            console.log(`Using web ${provider} login`);
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: provider,
                options: {
                    redirectTo: `${window.location.origin}/auth/callback?next=/account`
                }
            });

            if (error) throw error;
            return data;
        }
    } catch (error) {
        console.error(`${provider} sign in error:`, error);
        throw error;
    }
}