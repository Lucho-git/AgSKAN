<script>
  import { supabase } from "$lib/supabaseClient"
  import { toast } from "svelte-sonner"

  let formData = {
    fullName: "",
    registeredEmail: "",
    contactEmail: "",
    description: "",
  }

  let submitted = false
  let submitting = false
  let debugInfo = "" // For displaying debug info if needed

  async function handleSubmit() {
    submitting = true
    debugInfo = ""

    console.log("Submitting form data:", formData)

    try {
      // Direct Supabase insert to avoid any potential issues with the API layer
      const { data, error } = await supabase
        .from("deletion_requests")
        .insert({
          full_name: formData.fullName.trim(),
          registered_email: formData.registeredEmail?.trim() || null,
          contact_email: formData.contactEmail?.trim() || null,
          description: formData.description?.trim() || null,
        })
        .select()

      console.log("Supabase response:", { data, error })

      if (error) {
        console.error("Error submitting deletion request:", error)
        debugInfo = `Error: ${error.message} (Code: ${error.code})`
        toast.error("Failed to submit request: " + error.message)
      } else {
        submitted = true
        toast.success("Your data deletion request has been submitted")
      }
    } catch (error) {
      console.error("Exception in handleSubmit:", error)
      debugInfo = `Exception: ${error.message}`
      toast.error("An unexpected error occurred")
    } finally {
      submitting = false
    }
  }

  function resetForm() {
    submitted = false
    formData = {
      fullName: "",
      registeredEmail: "",
      contactEmail: "",
      description: "",
    }
    debugInfo = ""
  }
</script>

<div
  class="flex min-h-screen flex-col items-center justify-center bg-base-100 p-4"
>
  <div class="w-full max-w-xl rounded-lg bg-base-200 p-6 shadow-lg">
    {#if !submitted}
      <h1 class="mb-6 text-2xl font-bold text-primary">
        Request Data Deletion
      </h1>

      <p class="mb-4 text-base-content">
        You can request the deletion of all your personal data associated with
        our service. Please provide your name and any other information that
        might help us process your request.
      </p>

      <form on:submit|preventDefault={handleSubmit} class="space-y-4">
        <!-- Form fields remain the same -->
        <!-- Full name (required) -->
        <div class="form-control">
          <label for="fullName" class="label">
            <span class="label-text">Full Name *</span>
          </label>
          <input
            type="text"
            id="fullName"
            bind:value={formData.fullName}
            placeholder="John Doe"
            class="input input-bordered w-full"
            required
          />
          <label class="label">
            <span class="label-text-alt">Your full name</span>
          </label>
        </div>

        <!-- Email used for registration (optional) -->
        <div class="form-control">
          <label for="registeredEmail" class="label">
            <span class="label-text">Email Address Used for Registration</span>
          </label>
          <input
            type="email"
            id="registeredEmail"
            bind:value={formData.registeredEmail}
            placeholder="email@example.com"
            class="input input-bordered w-full"
          />
          <label class="label">
            <span class="label-text-alt"
              >The email you used when creating your account</span
            >
          </label>
        </div>

        <!-- Contact email (optional) -->
        <div class="form-control">
          <label for="contactEmail" class="label">
            <span class="label-text">Preferred Contact Email</span>
          </label>
          <input
            type="email"
            id="contactEmail"
            bind:value={formData.contactEmail}
            placeholder="contact@example.com"
            class="input input-bordered w-full"
          />
          <label class="label">
            <span class="label-text-alt"
              >Where we should send updates about your request</span
            >
          </label>
        </div>

        <!-- Additional information (optional) -->
        <div class="form-control">
          <label for="description" class="label">
            <span class="label-text">Additional Information</span>
          </label>
          <textarea
            id="description"
            bind:value={formData.description}
            placeholder="Please provide any additional details that might help us process your request..."
            class="textarea textarea-bordered h-32 w-full"
          ></textarea>
          <label class="label">
            <span class="label-text-alt"
              >Any specific details about your account, when you created it,
              etc.</span
            >
          </label>
        </div>

        <!-- Privacy policy acknowledgment -->
        <div class="form-control">
          <label class="label cursor-pointer justify-start gap-2">
            <input type="checkbox" class="checkbox-primary checkbox" required />
            <span class="label-text"
              >I understand that this action will permanently delete my data and
              cannot be undone</span
            >
          </label>
        </div>

        {#if debugInfo}
          <div class="alert alert-error">
            <span>{debugInfo}</span>
          </div>
        {/if}

        <div class="form-control mt-6">
          <button
            type="submit"
            class="btn btn-primary w-full"
            disabled={submitting}
          >
            {#if submitting}
              <span class="loading loading-spinner loading-sm"></span>
              Processing...
            {:else}
              Request Data Deletion
            {/if}
          </button>
        </div>
      </form>
    {:else}
      <div class="py-4 text-center">
        <div class="mb-2 text-4xl text-success">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="inline-block h-12 w-12"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h2 class="mb-3 text-xl font-bold text-primary">Request Received</h2>

        <p class="mb-3 text-base-content">
          Thank you, <strong>{formData.fullName}</strong>, for your request.
          We've received your data deletion request
          {#if formData.contactEmail}
            and will follow up with you at <strong
              >{formData.contactEmail}</strong
            >.
          {:else if formData.registeredEmail}
            and will follow up with you at <strong
              >{formData.registeredEmail}</strong
            >.
          {:else}
            and will process it according to our privacy policy.
          {/if}
        </p>

        <p class="mb-4 text-sm text-base-content opacity-75">
          We'll process your request as soon as possible. You may receive a
          confirmation email with additional information about the deletion
          process.
        </p>

        <button class="btn btn-outline btn-sm" on:click={resetForm}>
          Submit Another Request
        </button>
      </div>
    {/if}
  </div>
</div>
