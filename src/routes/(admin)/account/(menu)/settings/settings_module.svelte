<script lang="ts">
  import { enhance, applyAction } from "$app/forms"
  import { page } from "$app/stores"
  import type { SubmitFunction } from "@sveltejs/kit"
  import { toast } from "svelte-sonner"

  const fieldError = (liveForm: FormAccountUpdateResult, name: string) => {
    let errors = liveForm?.errorFields ?? []
    return errors.includes(name)
  }

  // Page state
  let loading = false
  let showSuccess = false

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
  export let fields: Field[]
  export let formTarget: string = ""
  export let successTitle = "Success"
  export let successBody = ""
  export let editButtonTitle: string = ""
  export let editLink: string = ""
  export let saveButtonTitle: string = "Save"

  const handleSubmit: SubmitFunction = () => {
    console.log("deephandlesubmit")
    loading = true
    return async ({ update, result }) => {
      await update({ reset: false })
      await applyAction(result)
      loading = false
      if (result.type === "success") {
        showSuccess = true
        toast.success(successTitle, {
          description: successBody || "Your changes have been saved.",
        })
      } else if (result.type === "failure") {
        toast.error("Error", {
          description:
            result.data?.message ||
            "An error occurred while saving your changes.",
        })
      }
    }
  }
</script>

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
      <form
        class="form-widget flex flex-col"
        method="POST"
        action={formTarget}
        use:enhance={handleSubmit}
      >
        {#each fields as field}
          {#if field.label}
            <label for={field.id}>
              <span class="text-sm text-gray-500">{field.label}</span>
            </label>
          {/if}
          {#if editable}
            <input
              id={field.id}
              name={field.id}
              type={field.inputType ?? "text"}
              disabled={!editable}
              placeholder={field.placeholder ?? field.label ?? ""}
              class="{fieldError($page?.form, field.id)
                ? 'input-error'
                : ''} input input-bordered input-sm mb-3 mt-1 w-full max-w-xs py-4 text-base"
              value={$page.form ? $page.form[field.id] : field.initialValue}
            />
          {:else}
            <div class="mb-3 text-lg">{field.initialValue}</div>
          {/if}
        {/each}

        {#if $page?.form?.errorMessage}
          <p class="mt-1 text-sm font-bold text-red-700">
            {$page?.form?.errorMessage}
          </p>
        {/if}

        {#if editable}
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
        {:else if $$slots.buttons}
          <slot name="buttons" />
        {:else}
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
      </form>
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
