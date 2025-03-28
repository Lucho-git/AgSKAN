import { fail, redirect } from "@sveltejs/kit"
import { toast } from "svelte-sonner"

export const actions = {
  updateEmail: async ({ request, locals: { supabase, getSession } }) => {
    const session = await getSession()
    if (!session) {
      toast.error("No session found at updateEmail")
      console.log("No session found at updateEmail")
      throw redirect(303, "/login")
    }

    const formData = await request.formData()
    const email = formData.get("email") as string

    let validationError
    if (!email || email === "") {
      validationError = "An email address is required"
    }
    // Dead simple check -- there's no standard here (which is followed),
    // and lots of errors will be missed until we actually email to verify, so
    // just do that
    else if (!email.includes("@")) {
      validationError = "A valid email address is required"
    }
    if (validationError) {
      return fail(400, {
        errorMessage: validationError,
        errorFields: ["email"],
        email,
      })
    }

    // Supabase does not change the email until the user verifies both
    // if 'Secure email change' is enabled in the Supabase dashboard
    const { error } = await supabase.auth.updateUser({ email: email })

    if (error) {
      return fail(500, {
        errorMessage: "Unknown error 001. If this persists please contact us.",
        email,
      })
    }

    return {
      email,
    }
  },
  updatePassword: async ({ request, locals: { supabase, getSession } }) => {
    const session = await getSession()
    if (!session) {
      toast.error("No session found at updatePassword")
      console.log("No session found at updatePassword")
      throw redirect(303, "/login")
    }

    const formData = await request.formData()
    const newPassword1 = formData.get("newPassword1") as string
    const newPassword2 = formData.get("newPassword2") as string
    const currentPassword = formData.get("currentPassword") as string

    // Can check if we're a "password recovery" session by checking session amr
    // let currentPassword take priority if provided (user can use either form)
    // @ts-expect-error: we ignore because Supabase does not maintain an AMR typedef
    const recoveryAmr = session.user?.amr?.find((x) => x.method === "recovery")
    const isRecoverySession = recoveryAmr && !currentPassword

    // if this is password recovery session, check timestamp of recovery session
    if (isRecoverySession) {
      const timeSinceLogin = Date.now() - recoveryAmr.timestamp * 1000
      if (timeSinceLogin > 1000 * 60 * 15) {
        // 15 mins in milliseconds
        return fail(400, {
          errorMessage:
            'Recovery code expired. Please log out, then use "Forgot Password" on the sign in page to reset your password. Codes are valid for 15 minutes.',
          errorFields: [],
          newPassword1,
          newPassword2,
          currentPassword: "",
        })
      }
    }

    let validationError
    const errorFields = []
    if (!newPassword1) {
      validationError = "You must type a new password"
      errorFields.push("newPassword1")
    }
    if (!newPassword2) {
      validationError = "You must type the new password twice"
      errorFields.push("newPassword2")
    }
    if (newPassword1.length < 6) {
      validationError = "The new password must be at least 6 charaters long"
      errorFields.push("newPassword1")
    }
    if (newPassword1.length > 72) {
      validationError = "The new password can be at most 72 charaters long"
      errorFields.push("newPassword1")
    }
    if (newPassword1 != newPassword2) {
      validationError = "The passwords don't match"
      errorFields.push("newPassword1")
      errorFields.push("newPassword2")
    }
    if (!currentPassword && !isRecoverySession) {
      validationError =
        "You must include your current password. If you forgot it, sign out then use 'forgot password' on the sign in page."
      errorFields.push("currentPassword")
    }
    if (validationError) {
      return fail(400, {
        errorMessage: validationError,
        errorFields: [...new Set(errorFields)], // unique values
        newPassword1,
        newPassword2,
        currentPassword,
      })
    }

    // Check current password is correct before updating, but only if they didn't log in with "recover" link
    // Note: to make this truely enforced you need to contact supabase. See: https://www.reddit.com/r/Supabase/comments/12iw7o1/updating_password_in_supabase_seems_insecure/
    // However, having the UI accessible route still verify password is still helpful, and needed once you get the setting above enabled
    if (!isRecoverySession) {
      const { error } = await supabase.auth.signInWithPassword({
        email: session?.user.email || "",
        password: currentPassword,
      })
      if (error) {
        // The user was logged out because of bad password. Redirect to error page explaining.
        toast.error("Incorrect password. Please try again.")
        console.log("Incorrect password. Please try again.")
        throw redirect(303, "/login/current_password_error")
      }
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword1,
    })
    if (error) {
      return fail(500, {
        errorMessage: "Unknown error 004. If this persists please contact us.",
        newPassword1,
        newPassword2,
        currentPassword,
      })
    }

    return {
      newPassword1,
      newPassword2,
      currentPassword,
    }
  },
  deleteAccount: async ({
    request,
    locals: { supabase, supabaseServiceRole, getSession },
  }) => {
    const session = await getSession()
    if (!session) {
      toast.error("No session found at deleteAccount")
      console.log("No session found at deleteAccount")
      throw redirect(303, "/login")
    }

    const formData = await request.formData()
    const currentPassword = formData.get("currentPassword") as string

    if (!currentPassword) {
      return fail(400, {
        errorMessage:
          "You must provide your current password to delete your account. If you forgot it, sign out then use 'forgot password' on the sign in page.",
        errorFields: ["currentPassword"],
        currentPassword,
      })
    }

    // Check current password is correct before deleting account
    const { error: pwError } = await supabase.auth.signInWithPassword({
      email: session?.user.email || "",
      password: currentPassword,
    })
    if (pwError) {
      // The user was logged out because of bad password. Redirect to error page explaining.
      toast.error("Incorrect password. Please try again.")
      console.log("Incorrect password. Please try again.")
      throw redirect(303, "/login/current_password_error")
    }

    const { error } = await supabaseServiceRole.auth.admin.deleteUser(
      session.user.id,
      true,
    )
    if (error) {
      return fail(500, {
        errorMessage: "Unknown error 002. If this persists please contact us.",
        currentPassword,
      })
    }

    await supabase.auth.signOut()
    throw redirect(303, "/")
  },

  //Original creation of the entry in profiles with validation for fullname
  createProfile: async ({ request, locals: { supabase, getSession } }) => {
    console.log("Creating profilefrom page.server.ts")
    const session = await getSession()
    if (!session) {
      toast.error("No session found at updateProfile")
      console.log("No session found at updateProfile")
      throw redirect(303, "/login")
    }

    const formData = await request.formData()
    const fullName = formData.get("fullName") as string
    const companyName = formData.get("companyName") as string
    const website = formData.get("website") as string
    const surveyCompleted = formData.get("surveyCompleted") as string

    console.log("Form data:", { fullName, companyName, website })

    let validationError
    const errorFields = []
    if (!fullName) {
      validationError = "Name is required"
      errorFields.push("fullName")
    }

    if (validationError) {
      console.log("Validation error:", validationError)
      return fail(400, {
        errorMessage: validationError,
        errorFields,
        fullName,
        companyName,
        website,
      })
    }

    const profileData = {
      id: session?.user.id,
      full_name: fullName,
      updated_at: new Date(),
    }

    if (companyName) {
      profileData.company_name = companyName
    }

    if (website) {
      profileData.website = website
    }

    if (surveyCompleted !== undefined) {
      profileData.survey_completed = surveyCompleted === "true"
    }

    console.log("Profile data:", profileData)

    // Update the user's profile in your database
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(profileData)

    if (profileError) {
      console.error("Supabase profile error:", profileError)
      console.log("Supabase profile error:", profileError)
      return fail(500, {
        errorMessage: "Unknown error 005. If this persists please contact us.",
        fullName,
        companyName,
        website,
        surveyCompleted,
      })
    }

    // Update the user's metadata in Supabase
    const { data: userData, error: metadataError } =
      await supabase.auth.updateUser({
        data: { name: fullName },
      })

    if (metadataError) {
      console.error("Supabase metadata error:", metadataError)
      return fail(500, {
        errorMessage: "Unknown error 003. If this persists please contact us.",
        fullName,
        companyName,
        website,
        surveyCompleted,
      })
    }

    console.log("User metadata updated successfully:", userData)
    // Refresh the session to reflect the updated metadata
    const { data: sessionData, error: sessionError } =
      await supabase.auth.refreshSession()

    const successResponse = {
      success: true,
      fullName,
      companyName: companyName || "",
      website: website || "",
      surveyCompleted: profileData.survey_completed,
    }

    console.log("Success response:", successResponse)
    return successResponse
  },

  updateProfile: async ({ request, locals: { supabase, getSession } }) => {
    console.log("Updating profile from page.server.ts")
    const session = await getSession()
    if (!session) {
      console.log("No session found at updateProfile")
      throw redirect(303, "/login")
    }

    const formData = await request.formData()
    const profileData = {
      id: session?.user.id,
      updated_at: new Date(),
    }

    const fullName = formData.get("fullName")
    if (fullName) {
      profileData.full_name = fullName
    }

    const companyName = formData.get("companyName")
    if (companyName) {
      profileData.company_name = companyName
    }

    const website = formData.get("website")
    if (website) {
      profileData.website = website
    }

    const surveyCompleted = formData.get("surveyCompleted")
    if (surveyCompleted !== null) {
      profileData.survey_completed = surveyCompleted === "true"
    }

    console.log("Profile data:", profileData)

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(profileData)

    if (profileError) {
      console.error("Supabase profile error:", profileError)
      return fail(500, {
        errorMessage: "Unknown error 005. If this persists please contact us.",
        ...profileData,
      })
    }

    if (profileData.full_name) {
      const { error: metadataError } = await supabase.auth.updateUser({
        data: { name: profileData.full_name },
      })

      if (metadataError) {
        console.error("Supabase metadata error:", metadataError)
        return fail(500, {
          errorMessage:
            "Unknown error 003. If this persists please contact us.",
          ...profileData,
        })
      }
    }

    console.log("User profile updated successfully")
    await supabase.auth.refreshSession()

    return {
      success: true,
      ...profileData,
    }
  },

  signout: async ({ locals: { supabase, getSession } }) => {
    const session = await getSession()
    if (session) {
      await supabase.auth.signOut()
      throw redirect(303, "/")
    } else {
      throw redirect(303, "/")
    }
  },
}
