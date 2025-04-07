<script lang="ts">
  import { createEventDispatcher } from "svelte"
  import { toast } from "svelte-sonner"
  import { goto } from "$app/navigation"

  const dispatch = createEventDispatcher()

  // Page state
  let loading = false
  let showSuccess = false
  let errors = []
  let errorMessage = ""
  let formValues = {}

  type Field = {
    inputType?: string // default is "text"
    id: string
    label?: string
    initialValue: string | boolean
    placeholder?: string
  }

  // Module context
  export let editable = false
  export let dangerous = false
  export let title: string = ""
  export let message: string = ""
  export let fields: Field[] = []
  export let successTitle = "Success"
  export let successBody = ""
  export let editButtonTitle: string = ""
  export let editLink: string = ""
  export let saveButtonTitle: string = "Save"
  export let apiHandler = null
  export let showBackButton: boolean = false
  export let backUrl: string = "/account/settings"
  export let backText: string = "Back to Settings"

  // Initialize form values when fields change
  $: {
    fields.forEach((field) => {
      if (!(field.id in formValues)) {
        formValues[field.id] = field.initialValue
      }
    })
  }

  function fieldError(name: string) {
    return errors.includes(name)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    loading = true
    errors = []
    errorMessage = ""

    try {
      // Call the provided API handler with form values
      const response = await apiHandler(formValues)

      if (response.success) {
        showSuccess = true
        toast.success(successTitle, {
          description: successBody || "Your changes have been saved.",
        })
        dispatch("success", { ...response, formData: formValues })
      } else {
        errors = response.errorFields || []
        errorMessage = response.message || "An error occurred"
        toast.error("Error", { description: errorMessage })
        dispatch("error", { message: errorMessage, errorFields: errors })
      }
    } catch (error) {
      console.error("Error in form submission:", error)
      errorMessage = error.message || "An unexpected error occurred"
      toast.error("Error", { description: errorMessage })
      dispatch("error", { message: errorMessage })
    } finally {
      loading = false
    }
  }

  function handleInputChange(event, fieldId) {
    formValues[fieldId] = event.target.value
  }
</script>

{#if showBackButton}
  <button
    class="btn btn-ghost btn-sm mb-4 gap-1"
    on:click={() => goto(backUrl)}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      class="h-4 w-4"
    >
      <path
        fill-rule="evenodd"
        d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
        clip-rule="evenodd"
      />
    </svg>
    {backText}
  </button>
{/if}

<div class="card mt-8 flex max-w-xl flex-col p-6 pb-7 shadow md:flex-row">
  {#if title}
    <div class="mb-3 w-48 flex-none text-xl font-bold">{title}</div>
  {/if}

  <div class="w-full min-w-48">
    {#if !showSuccess}
      {#if message}
        <div class="mb-6 {dangerous ? 'alert alert-warning' : ''}">
          {#if dangerous}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6 shrink-0 stroke-current"
              fill="none"
              viewBox="0 0 24 24"
              ><path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              /></svg
            >
          {/if}
          <span>{message}</span>
        </div>
      {/if}

      {#if editable && apiHandler}
        <!-- Editable form with API handler -->
        <form class="form-widget flex flex-col" on:submit={handleSubmit}>
          {#each fields as field}
            {#if field.label}
              <label for={field.id}>
                <span class="text-sm text-gray-500">{field.label}</span>
              </label>
            {/if}
            <input
              id={field.id}
              name={field.id}
              type={field.inputType ?? "text"}
              disabled={loading}
              placeholder={field.placeholder ?? field.label ?? ""}
              class="{fieldError(field.id)
                ? 'input-error'
                : ''} input input-sm input-bordered mb-3 mt-1 w-full max-w-xs py-4 text-base"
              value={formValues[field.id]}
              on:input={(e) => handleInputChange(e, field.id)}
            />
          {/each}

          {#if errorMessage}
            <p class="mt-1 text-sm font-bold text-red-700">
              {errorMessage}
            </p>
          {/if}

          <div>
            <button
              type="submit"
              class="btn btn-sm ml-auto mt-3 min-w-[145px] {dangerous
                ? 'btn-error'
                : 'btn-success'}"
              disabled={loading}
            >
              {#if loading}
                <span
                  class="loading loading-spinner loading-md mx-3 align-middle"
                ></span>
              {:else}
                {saveButtonTitle}
              {/if}
            </button>
          </div>
        </form>
      {:else}
        <!-- View-only display -->
        <div class="form-widget flex flex-col">
          {#each fields as field}
            {#if field.label}
              <label for={field.id}>
                <span class="text-sm text-gray-500">{field.label}</span>
              </label>
            {/if}
            <div class="mb-3 text-lg">{field.initialValue}</div>
          {/each}

          {#if $$slots.buttons}
            <slot name="buttons" />
          {:else if editLink}
            <a href={editLink} class="mt-1">
              <button
                class="btn btn-outline btn-sm {dangerous
                  ? 'btn-error'
                  : ''} min-w-[145px]"
              >
                {editButtonTitle}
              </button>
            </a>
          {/if}
        </div>
      {/if}
    {:else}
      <div>
        <div class="text-l font-bold">{successTitle}</div>
        <div class="text-base">{successBody}</div>
      </div>
      <a href="/account/settings">
        <button class="btn btn-outline btn-sm mt-3 min-w-[145px]">
          Return to Settings
        </button>
      </a>
    {/if}
  </div>
</div>
