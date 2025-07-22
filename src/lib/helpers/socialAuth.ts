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

            // Initialize first
            try {
                if (provider === 'google') {
                    await SocialLogin.initialize({
                        google: {
                            webClientId: '838630639549-vabhickg9ad67hffa0ftb2uil9fr94fd.apps.googleusercontent.com',
                            androidClientId: '838630639549-v71401637scd3tiqehv14dbth6812qdb.apps.googleusercontent.com',
                        }
                    });
                } else if (provider === 'apple') {
                    await SocialLogin.initialize({
                        apple: {
                            scopes: ['email', 'name']
                        }
                    });
                }
                console.log('SocialLogin plugin initialized successfully');
            } catch (initError) {
                console.error('Failed to initialize SocialLogin plugin:', initError);
                throw new Error(`Failed to initialize ${provider} authentication`);
            }

            // Attempt login
            console.log('Attempting login with options:', { provider, options: {} });
            const result = await SocialLogin.login({
                provider: provider,
                options: {}
            });

            console.log(`Native ${provider} login result:`, result);

            // Check if we got a valid result
            if (!result || !result.result) {
                console.error('Invalid login result:', result);
                throw new Error(`Invalid ${provider} login result`);
            }

            // Extract the correct token based on provider
            let idToken;

            if (provider === 'apple') {
                // For Apple, use the accessToken.token which contains the proper JWT
                idToken = result.result.accessToken?.token;
                console.log('Using Apple accessToken as idToken:', idToken ? 'found' : 'not found');
            } else {
                // For Google, use the standard idToken
                idToken = result.result.idToken;
            }

            if (!idToken) {
                console.error('No ID token found in result:', result);
                throw new Error(`No authentication token received from ${provider}`);
            }

            console.log('Sending token to Supabase:', idToken.substring(0, 50) + '...');

            // Use the ID token with Supabase
            const { data, error } = await supabase.auth.signInWithIdToken({
                provider: provider,
                token: idToken,
            });

            if (error) {
                console.error('Supabase auth error:', error);
                throw error;
            }

            console.log('Supabase auth success:', data);
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

        // Provide more helpful error messages
        if (provider === 'apple' && error.errorMessage) {
            if (error.errorMessage.includes('1000')) {
                throw new Error('Apple Sign-In was canceled or failed. Please try again.');
            } else if (error.errorMessage.includes('1001')) {
                throw new Error('Apple Sign-In is not available. Please check your device settings.');
            }
        }

        if (error.code === 'validation_failed') {
            throw new Error(`${provider} authentication token validation failed. Please try again.`);
        }

        throw error;
    }
}