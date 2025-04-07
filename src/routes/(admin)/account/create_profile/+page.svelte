<script lang="ts">
  import "../../../../app.css"
  import { goto } from "$app/navigation"
  import { updateOrCreateProfile } from "$lib/helpers/authHelpers"
  import { toast } from "svelte-sonner"
  import { supabase } from "$lib/supabaseClient"

  export let data
  export let form: FormAccountUpdateResult

  let { session, profile } = data

  let loading = false
  let fullName: string = profile?.full_name ?? ""
  let companyName: string = profile?.company_name ?? ""
  let website: string = profile?.website ?? ""
  let error = null

  const fieldError = (liveForm: FormAccountUpdateResult, name: string) => {
    let errors = liveForm?.errorFields ?? []
    return errors.includes(name)
  }

  // Handle form submission
  const handleSubmit = async (event) => {
    event.preventDefault()
    loading = true

    try {
      // Validate fullName
      if (!fullName) {
        error = "Name is required"
        form = {
          errorMessage: "Name is required",
          errorFields: ["fullName"],
        }
        loading = false
        return
      }

      // First, update the session with the full name in user metadata
      const { error: metadataError } = await supabase.auth.updateUser({
        data: { full_name: fullName },
      })

      if (metadataError) {
        console.error("Error updating user metadata:", metadataError)
        error = metadataError.message || "Failed to update user data"
        loading = false
        return
      }

      // Get the updated session
      const { data: sessionData } = await supabase.auth.getSession()

      if (!sessionData.session) {
        error = "Session not found"
        loading = false
        return
      }

      // Use the existing updateOrCreateProfile function with the updated session
      const profileCreated = await updateOrCreateProfile(sessionData.session)

      if (!profileCreated) {
        error = "Failed to create profile"
        loading = false
        return
      }

      // Now update the additional profile fields (company, website)
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          company_name: companyName,
          website: website,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionData.session.user.id)

      if (updateError) {
        console.error("Error updating additional profile fields:", updateError)
        error = updateError.message || "Failed to update profile details"
        loading = false
        return
      }

      // All done successfully
      toast.success("Profile created successfully")
      console.log("Profile created successfully")

      // Navigate to the survey page
      goto("/account/user_survey")
    } catch (err) {
      console.error("Error in profile creation:", err)
      error = "An unexpected error occurred. Please try again."
      form = {
        errorMessage: "An unexpected error occurred. Please try again.",
        errorFields: [],
      }
    } finally {
      loading = false
    }
  }

  $: {
    if (form) {
      console.log("Form result:", form)
    }
  }
</script>

<svelte:head>
  <title>Create Profile</title>
</svelte:head>

<div
  class="mx-auto mb-12 flex min-h-[100vh] max-w-lg place-content-center content-center items-center text-center"
>
  <div class="flex w-64 flex-col lg:w-80">
    <div>
      <h1 class="mb-6 text-2xl font-bold">Create Profile</h1>
      <form class="form-widget" on:submit={handleSubmit}>
        <div class="mt-4">
          <label for="fullName" class="label">
            <span class="label-text">Name</span>
          </label>
          <input
            id="fullName"
            bind:value={fullName}
            type="text"
            placeholder="Your full name"
            class="{fieldError(form, 'fullName')
              ? 'input-error'
              : ''} input input-bordered mt-1 w-full max-w-xs border-2 border-primary"
            required
          />
        </div>

        <div class="mt-4">
          <label for="companyName" class="label">
            <span class="label-text">Company Name</span>
          </label>
          <input
            id="companyName"
            bind:value={companyName}
            type="text"
            placeholder="Homewood Farms"
            class="{fieldError(form, 'companyName')
              ? 'input-error'
              : ''} input input-bordered mt-1 w-full max-w-xs"
          />
        </div>

        <div class="mt-4">
          <label for="website" class="label">
            <span class="label-text">Company Website</span>
          </label>
          <input
            id="website"
            bind:value={website}
            type="text"
            placeholder="Company.com"
            class="{fieldError(form, 'website')
              ? 'input-error'
              : ''} input input-bordered mt-1 w-full max-w-xs"
          />
        </div>

        {#if form?.errorMessage || error}
          <div class="mt-4"></div>
          <p class="mt-3 text-center text-sm font-bold text-red-700">
            {form?.errorMessage || error}
          </p>
        {/if}
        <div class="mt-4">
          <button
            type="submit"
            class="btn btn-primary btn-wide mt-3"
            disabled={loading}
          >
            {loading ? "..." : "Create Profile"}
          </button>
        </div>
      </form>

      <div class="mt-14 text-sm text-slate-800">
        You are logged in as {session?.user?.email}.
        <br />
        <a class="underline" href="/features/"> Sign out </a>
      </div>
    </div>
  </div>
</div>
