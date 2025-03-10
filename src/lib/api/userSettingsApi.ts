// src/lib/api/userSettingsApi.ts
import { supabase } from '$lib/supabaseClient';
import { goto } from "$app/navigation";
import { toast } from "svelte-sonner";
import { profileStore } from "$lib/stores/profileStore";

export const userSettingsApi = {
    /**
     * Updates the user's email address
     */
    async updateEmail(email: string) {
        try {
            // Check if user is logged in
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                toast.error("You must be logged in to update your email");
                goto("/login");
                return {
                    success: false,
                    message: "Not logged in",
                    errorFields: []
                };
            }

            // Validate email
            if (!email || email === "") {
                return {
                    success: false,
                    message: "An email address is required",
                    errorFields: ["email"]
                };
            }

            if (!email.includes("@")) {
                return {
                    success: false,
                    message: "A valid email address is required",
                    errorFields: ["email"]
                };
            }

            // Update email via Supabase
            const { error } = await supabase.auth.updateUser({ email });

            if (error) {
                console.error("Error updating email:", error);
                return {
                    success: false,
                    message: error.message || "Unknown error 001. If this persists please contact us.",
                    errorFields: ["email"]
                };
            }

            toast.success("Email update initiated. Please check your inbox for verification.");
            return {
                success: true,
                message: "Email update initiated",
                email
            };
        } catch (error) {
            console.error("Error in updateEmail:", error);
            return {
                success: false,
                message: "Unknown error 001. If this persists please contact us.",
                errorFields: []
            };
        }
    },

    /**
     * Updates the user's password
     */
    async updatePassword(newPassword1: string, newPassword2: string, currentPassword: string) {
        try {
            // Check if user is logged in
            const { data: sessionData } = await supabase.auth.getSession();
            if (!sessionData?.session?.user) {
                toast.error("You must be logged in to update your password");
                goto("/login");
                return {
                    success: false,
                    message: "Not logged in",
                    errorFields: []
                };
            }

            // Check if this is a recovery session
            // @ts-expect-error: Supabase doesn't maintain AMR typedef
            const recoveryAmr = sessionData.session.user?.amr?.find(x => x.method === "recovery");
            const isRecoverySession = recoveryAmr && !currentPassword;

            // If recovery session, verify it's not expired (15 minutes)
            if (isRecoverySession) {
                const timeSinceLogin = Date.now() - recoveryAmr.timestamp * 1000;
                if (timeSinceLogin > 1000 * 60 * 15) {
                    return {
                        success: false,
                        message: 'Recovery code expired. Please log out, then use "Forgot Password" on the sign in page to reset your password. Codes are valid for 15 minutes.',
                        errorFields: []
                    };
                }
            }

            // Validate password inputs
            const errorFields = [];
            let validationError = null;

            if (!newPassword1) {
                validationError = "You must type a new password";
                errorFields.push("newPassword1");
            }
            if (!newPassword2) {
                validationError = "You must type the new password twice";
                errorFields.push("newPassword2");
            }
            if (newPassword1.length < 6) {
                validationError = "The new password must be at least 6 characters long";
                errorFields.push("newPassword1");
            }
            if (newPassword1.length > 72) {
                validationError = "The new password can be at most 72 characters long";
                errorFields.push("newPassword1");
            }
            if (newPassword1 != newPassword2) {
                validationError = "The passwords don't match";
                errorFields.push("newPassword1");
                errorFields.push("newPassword2");
            }
            if (!currentPassword && !isRecoverySession) {
                validationError =
                    "You must include your current password. If you forgot it, sign out then use 'forgot password' on the sign in page.";
                errorFields.push("currentPassword");
            }

            if (validationError) {
                return {
                    success: false,
                    message: validationError,
                    errorFields: [...new Set(errorFields)] // unique values
                };
            }

            // If not recovery session, verify current password
            if (!isRecoverySession) {
                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email: sessionData.session.user.email || "",
                    password: currentPassword
                });

                if (signInError) {
                    toast.error("Incorrect password. Please try again.");
                    goto("/login/current_password_error");
                    return {
                        success: false,
                        message: "Incorrect password",
                        errorFields: ["currentPassword"]
                    };
                }
            }

            // Update password
            const { error } = await supabase.auth.updateUser({
                password: newPassword1
            });

            if (error) {
                return {
                    success: false,
                    message: error.message || "Unknown error 004. If this persists please contact us.",
                    errorFields: []
                };
            }

            toast.success("Password updated successfully");
            return { success: true, message: "Password updated successfully" };
        } catch (error) {
            console.error("Error in updatePassword:", error);
            return {
                success: false,
                message: "Unknown error 004. If this persists please contact us.",
                errorFields: []
            };
        }
    },

    /**
     * Updates the user's profile
     */
    async updateProfile(fullName: string, companyName: string = "", website: string = "", surveyCompleted?: boolean) {
        try {
            console.log("Updating profile from client API");

            // Check if user is logged in
            const { data: sessionData } = await supabase.auth.getSession();
            if (!sessionData?.session?.user) {
                toast.error("You must be logged in to update your profile");
                goto("/login");
                return {
                    success: false,
                    message: "Not logged in",
                    errorFields: []
                };
            }

            // Validate fullName
            if (!fullName) {
                return {
                    success: false,
                    message: "Name is required",
                    errorFields: ["fullName"]
                };
            }

            const userId = sessionData.session.user.id;
            const userEmail = sessionData.session.user.email;

            // Build profile data
            const profileData: any = {
                id: userId,
                email: userEmail,
                full_name: fullName,
                updated_at: new Date()
            };

            if (companyName !== undefined) {
                profileData.company_name = companyName;
            }

            if (website !== undefined) {
                profileData.website = website;
            }

            if (surveyCompleted !== undefined) {
                profileData.survey_completed = surveyCompleted;
            }

            console.log("Profile data:", profileData);

            // Update profile in database
            const { error: profileError } = await supabase
                .from("profiles")
                .upsert(profileData);

            if (profileError) {
                console.error("Supabase profile error:", profileError);
                return {
                    success: false,
                    message: profileError.message || "Unknown error 005. If this persists please contact us.",
                    errorFields: []
                };
            }

            // Update user metadata
            if (profileData.full_name) {
                const { error: metadataError } = await supabase.auth.updateUser({
                    data: { name: fullName }
                });

                if (metadataError) {
                    console.error("Supabase metadata error:", metadataError);
                    // Continue anyway, as the profile was updated successfully
                }
            }

            // Refresh session
            await supabase.auth.refreshSession();

            // Update profile store
            if (profileStore && typeof profileStore.loadProfile === 'function') {
                await profileStore.loadProfile(userId);
            }

            toast.success("Profile updated successfully");
            return {
                success: true,
                message: "Profile updated successfully",
                profile: profileData
            };
        } catch (error) {
            console.error("Error in updateProfile:", error);
            return {
                success: false,
                message: "Unknown error 005. If this persists please contact us.",
                errorFields: []
            };
        }
    },


    /**
     * Deletes the user's account
     */
    async deleteAccount(currentPassword: string) {
        try {
            // Check if user is logged in
            const { data: sessionData } = await supabase.auth.getSession();
            if (!sessionData?.session?.user) {
                toast.error("You must be logged in to delete your account");
                goto("/login");
                return {
                    success: false,
                    message: "Not logged in",
                    errorFields: []
                };
            }

            if (!currentPassword) {
                return {
                    success: false,
                    message: "You must provide your current password to delete your account. If you forgot it, sign out then use 'forgot password' on the sign in page.",
                    errorFields: ["currentPassword"]
                };
            }

            // Verify password
            const { error: pwError } = await supabase.auth.signInWithPassword({
                email: sessionData.session.user.email || "",
                password: currentPassword
            });

            if (pwError) {
                toast.error("Incorrect password. Please try again.");
                goto("/login/current_password_error");
                return {
                    success: false,
                    message: "Incorrect password",
                    errorFields: ["currentPassword"]
                };
            }

            // Note: Regular client can't perform admin.deleteUser
            // Instead, we could call a server API endpoint that uses supabaseServiceRole

            toast.info("Account deletion requires admin privileges. Please contact support.");
            return {
                success: false,
                message: "Account deletion via client API is not supported. Please contact support.",
                errorFields: []
            };
        } catch (error) {
            console.error("Error in deleteAccount:", error);
            return {
                success: false,
                message: "Unknown error 002. If this persists please contact us.",
                errorFields: []
            };
        }
    },

};