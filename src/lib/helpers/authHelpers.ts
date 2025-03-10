// $lib/helpers/authHelpers.ts
import { supabase } from "$lib/stores/sessionStore";
import type { Session } from "@supabase/supabase-js";
import { goto } from "$app/navigation";

// Set to track already processed sessions
const handledSessions = new Set<string>();

export async function updateOrCreateProfile(sessionData: Session) {
    if (!sessionData || !sessionData.user) {
        console.log("[Auth Helper] No valid session data provided");
        return false;
    }

    const userId = sessionData.user.id;

    // Check if we've already processed this session
    if (handledSessions.has(userId)) {
        console.log("[Auth Helper] Already processed user session:", userId);
        return true;
    }

    console.log("[Auth Helper] Checking profile for user:", userId);

    // Add the user to the handled sessions set
    handledSessions.add(userId);

    // First check if profile exists
    const { data: existingProfile, error: fetchError } = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url, created_at")
        .eq("id", userId)
        .single();

    // Extract user data for update or insert
    const userData = {
        id: userId,
        email: sessionData.user.email,
        full_name: sessionData.user.user_metadata?.full_name || null,
        avatar_url: sessionData.user.user_metadata?.avatar_url || null,
        updated_at: new Date().toISOString(),
        last_sign_in: sessionData.user.last_sign_in || new Date().toISOString(),
    };

    // If no profile exists at all, create a complete one
    if (fetchError && fetchError.code === "PGRST116") {
        console.log("[Auth Helper] No profile found, creating new profile");

        const { error: insertError } = await supabase.from("profiles").insert({
            ...userData,
            created_at: new Date().toISOString(),
            onboarded: false,
        });

        if (insertError && insertError.code !== "23505") {
            console.error("[Auth Helper] Error creating profile:", insertError);
            return false;
        }

        console.log("[Auth Helper] Profile created successfully");

        // Also create a free subscription
        await createSubscriptionIfNeeded(userId);

        return true;
    }

    // If profile exists but is missing data (like email)
    if (existingProfile) {
        console.log("[Auth Helper] Existing profile found:", existingProfile);

        // Check if any essential fields are missing and need to be updated
        const needsUpdate =
            !existingProfile.email ||
            (!existingProfile.full_name && userData.full_name) ||
            (!existingProfile.avatar_url && userData.avatar_url);

        if (needsUpdate) {
            console.log("[Auth Helper] Profile exists but needs updating with missing data");

            // Create update object with only the fields we need to update
            const updateData: any = {
                updated_at: userData.updated_at,
            };

            // Only add fields if they're needed
            if (!existingProfile.email) {
                updateData.email = userData.email;
            }

            if (!existingProfile.full_name && userData.full_name) {
                updateData.full_name = userData.full_name;
            }

            if (!existingProfile.avatar_url && userData.avatar_url) {
                updateData.avatar_url = userData.avatar_url;
            }

            const { error: updateError } = await supabase
                .from("profiles")
                .update(updateData)
                .eq("id", userId);

            if (updateError) {
                console.error("[Auth Helper] Error updating profile:", updateError);
                return false;
            }

            console.log("[Auth Helper] Profile updated successfully with data:", updateData);
        } else {
            console.log(
                "[Auth Helper] Profile exists and has all required data, just updating timestamps"
            );

            // Just update the timestamp
            const { error: updateError } = await supabase
                .from("profiles")
                .update({
                    last_sign_in: userData.last_sign_in,
                })
                .eq("id", userId);

            if (updateError) {
                console.error("[Auth Helper] Error updating profile timestamp:", updateError);
            } else {
                console.log("[Auth Helper] Profile timestamp updated successfully");
            }
        }

        // Check subscription
        await createSubscriptionIfNeeded(userId);

        return true;
    }

    // If we got here, something unexpected happened
    console.error("[Auth Helper] Unexpected state in profile check");
    return false;
}

// Separate function to create subscription if needed
export async function createSubscriptionIfNeeded(userId: string) {
    try {
        console.log("[Auth Helper] Checking for existing subscription for user:", userId);

        // Try to fetch subscriptions without using .single()
        const { data: existingSubscriptions, error: subCheckError } = await supabase
            .from("user_subscriptions")
            .select("user_id")
            .eq("user_id", userId);

        // If there was an error fetching subscriptions
        if (subCheckError) {
            console.log(
                "[Auth Helper] Error checking subscriptions (will try to create):",
                subCheckError.code
            );
            // Continue to creation attempt
        }
        // If we successfully found subscriptions
        else if (existingSubscriptions && existingSubscriptions.length > 0) {
            console.log(
                `[Auth Helper] Found ${existingSubscriptions.length} existing subscription(s)`
            );
            return true;
        }

        // No valid subscriptions found or error occurred, try to create one
        console.log("[Auth Helper] No valid subscription found, creating one");

        // Try to create a subscription
        const { error: subscriptionError } = await supabase
            .from("user_subscriptions")
            .insert({
                user_id: userId,
                subscription: "FREE",
                marker_limit: 100,
                trail_limit: 100000,
                current_seats: 1,
                updated_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
            });

        // Handle creation result
        if (subscriptionError) {
            // If duplicate key error, subscription already exists
            if (subscriptionError.code === "23505") {
                console.log("[Auth Helper] Subscription already exists (unique constraint)");
                return true;
            } else {
                console.log(
                    "[Auth Helper] Non-critical error creating subscription:",
                    subscriptionError.code
                );
                return false;
            }
        }

        console.log("[Auth Helper] Free subscription created successfully");
        return true;
    } catch (error) {
        // Catch any unexpected errors
        console.log("[Auth Helper] Unexpected error in subscription management:", error);
        return false;
    }
}

// Helper function to set up the auth listener in a consistent way
export function setupAuthListener(redirectPath = "/account") {
    console.log("[Auth Helper] Setting up auth listener with redirect to:", redirectPath);

    let isProcessingAuth = false;

    // Check current session first - this handles the case where the user is already logged in
    const handleExistingSession = async () => {
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
            console.log("[Auth Helper] Found existing session on page load, processing...");
            await handleAuthChange("EXISTING_SESSION", session);
        } else {
            console.log("[Auth Helper] No existing session found");
        }
    };

    // Process authentication changes
    const handleAuthChange = async (event: string, session: Session | null) => {
        console.log("[Auth Helper] Auth event:", event, "User:", session?.user?.id);

        if (!session) {
            console.log("[Auth Helper] No session in auth event");
            return;
        }

        // Skip INITIAL_SESSION events (already handled by explicit check above)
        if (event === "INITIAL_SESSION") {
            console.log("[Auth Helper] Ignoring INITIAL_SESSION event");
            return;
        }

        // Process relevant auth events
        if ((event === "SIGNED_IN" || event === "USER_UPDATED" || event === "EXISTING_SESSION") && !isProcessingAuth) {
            console.log("[Auth Helper] Processing auth event:", event);
            isProcessingAuth = true;

            try {
                // Update or create profile as needed
                const profileResult = await updateOrCreateProfile(session);
                console.log("[Auth Helper] Profile update/creation result:", profileResult);

                // If we're not already on the target page, redirect
                if (window.location.pathname !== redirectPath) {
                    console.log(`[Auth Helper] Auth processing complete, redirecting to ${redirectPath}`);
                    goto(redirectPath);
                } else {
                    console.log(`[Auth Helper] Already on ${redirectPath}, no redirect needed`);
                }
            } catch (error) {
                console.error("[Auth Helper] Error processing authentication:", error);
            } finally {
                isProcessingAuth = false;
            }
        }
    };

    // Check for existing session immediately
    setTimeout(handleExistingSession, 0);

    // Set up the auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthChange);

    return {
        data: { subscription },
        checkNow: handleExistingSession // Export function to check session on demand
    };
}