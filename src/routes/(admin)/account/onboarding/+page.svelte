<!-- src/routes/(admin)/account/onboarding/+page.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation"
  import {
    Tractor,
    Users,
    MapPin,
    ClipboardList,
    UserRound,
    Send,
    ArrowRight,
    Eye,
  } from "lucide-svelte"
  import { supabase } from "$lib/stores/sessionStore"
  import { profileStore } from "$lib/stores/profileStore"
  import { toast } from "svelte-sonner"

  let selectedRole: "manager" | "operator" | "viewer" | null = null
  let formError: string | null = null
  let loading = false

  const roles = [
    {
      id: "manager",
      title: "Manager",
      Icon: Users,
      description:
        "Oversee farm operations, manage teams, and track performance",
      mobileDescription: "Oversee operations and manage teams",
      accentColor: "#17a34a", // Green (emerald-500)
      hoverColor: "rgb(16 185 129)", // emerald-500
      gradientBg: "bg-gradient-to-br from-base-200 to-base-300/50",
      features: [
        { text: "Manage Maps", icon: MapPin },
        { text: "Team Control", icon: UserRound },
      ],
    },
    {
      id: "operator",
      title: "Operator",
      Icon: Tractor,
      description:
        "Run field operations, track progress, and submit reports",
      mobileDescription: "Execute operations and track progress",
      accentColor: "#3B82F6", // Blue (blue-500)
      hoverColor: "rgb(59 130 246)", // blue-500
      gradientBg: "bg-gradient-to-br to-base-100 from-base-300/50",
      features: [
        { text: "Track Progress", icon: Send },
      ],
    },
    {
      id: "viewer",
      title: "Viewer",
      Icon: Eye,
      description:
        "View farm maps and monitor operations without making changes",
      mobileDescription: "View maps and monitor operations",
      accentColor: "#8B5CF6", // Purple (violet-500)
      hoverColor: "rgb(139 92 246)", // violet-500
      gradientBg: "bg-gradient-to-br from-base-100 to-base-300/50",
      features: [
        { text: "View Maps", icon: MapPin },
      ],
    },
  ]

  async function handleSubmit() {
    if (!selectedRole) {
      formError = "Please select a role"
      return
    }

    loading = true
    formError = null

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ role: selectedRole })
        .eq("id", $profileStore.id)

      if (error) throw error

      profileStore.update((profile) => ({
        ...profile,
        user_type: selectedRole,
      }))

      if (selectedRole === "operator") {
        goto("/account/onboarding/operator/profile")
      } else if (selectedRole === "manager") {
        goto("/account/onboarding/manager/profile")
      } else if (selectedRole === "viewer") {
        goto("/account/onboarding/viewer/profile")
      }
    } catch (error) {
      console.error("Error:", error)
      formError = "Failed to update role"
      toast.error(formError)
    } finally {
      loading = false
    }
  }
</script>

<svelte:head>
  <title>Choose Your Role - AgSKAN</title>
  <meta name="description" content="Select your role to begin" />
</svelte:head>

<div
  class="relative min-h-screen overflow-hidden bg-gradient-to-b from-base-100 to-base-200"
>
  <!-- Decorative Elements - hidden on mobile for cleaner look -->
  <div
    class="pointer-events-none absolute -right-20 top-20 hidden h-64 w-64 rounded-full bg-base-content/5 blur-3xl sm:block"
  ></div>
  <div
    class="pointer-events-none absolute -left-20 bottom-20 hidden h-80 w-80 rounded-full bg-base-content/5 blur-3xl sm:block"
  ></div>

  <!-- Main content -->
  <main
    class="container relative z-10 mx-auto flex flex-col items-center px-4 py-4 lg:px-6 lg:py-10"
  >
    <div class="mb-4 w-full max-w-5xl lg:mb-8">
      <!-- Compact header for mobile -->
      <div class="mb-4 text-center lg:mb-8">
        <h2
          class="relative mb-2 inline-block text-2xl font-bold text-contrast-content lg:mb-4 lg:text-4xl lg:text-5xl"
        >
          Welcome to
          <span class="ml-2 text-base-content"> AgSKAN </span>
        </h2>
        <p
          class="mx-auto max-w-2xl text-base text-contrast-content/60 lg:text-lg"
        >
          Select your role to begin
        </p>
      </div>

      <!-- Error Alert -->
      {#if formError}
        <div class="alert alert-error mb-4 lg:mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 shrink-0 stroke-current"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{formError}</span>
        </div>
      {/if}

      <!-- Role selection cards - more compact on mobile -->
      <div
        class="perspective-[1000px] relative mb-4 grid grid-cols-1 gap-3 lg:mb-6 lg:grid-cols-3 lg:gap-5"
      >
        {#each roles as role}
          <div
            class="role-card group relative cursor-pointer overflow-hidden rounded-xl transition-shadow duration-200
              {role.gradientBg}
              {selectedRole === role.id
              ? 'border-2 shadow-[0_0_15px_rgba(0,0,0,0.15)]'
              : 'border border-base-300 hover:shadow-md'}"
            style="--hover-color: {role.hoverColor}; {selectedRole === role.id
              ? `border-color: ${role.accentColor};`
              : ''}"
            on:click={() => (selectedRole = role.id)}
            on:keydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                selectedRole = role.id
              }
            }}
            role="button"
            tabindex="0"
          >
            <!-- Top border -->
            <div
              class="top-border h-0 w-full
                     {selectedRole === role.id
                ? ''
                : 'border-t border-base-300'}"
              style={selectedRole === null || selectedRole === role.id
                ? `border-top: 4px solid ${role.accentColor};`
                : ""}
            ></div>

            <div
              class="absolute inset-0 bg-gradient-to-b from-transparent to-base-200/40 opacity-0 transition-opacity group-hover:opacity-100"
            ></div>
            <div class="relative z-10 p-3 lg:p-5">
              <div class="mb-3 flex items-start justify-between lg:mb-4">
                <!-- Icon container -->
                <div
                  class="rounded-lg p-2 transition-colors duration-200 lg:rounded-xl lg:p-4"
                  style={selectedRole === role.id
                    ? `background-color: ${role.accentColor}20; color: ${role.accentColor};`
                    : ""}
                  class:bg-base-200={selectedRole !== role.id}
                  class:text-contrast-content={selectedRole !== role.id}
                  class:group-hover:text-emerald-500={selectedRole !==
                    role.id && role.id === "manager"}
                  class:group-hover:text-blue-500={selectedRole !== role.id &&
                    role.id === "operator"}
                  class:group-hover:text-violet-500={selectedRole !== role.id &&
                    role.id === "viewer"}
                >
                  <svelte:component
                    this={role.Icon}
                    size={24}
                    class="transition-transform group-hover:scale-110 lg:h-8 lg:w-8"
                  />
                </div>

                <!-- Checkmark circle -->
                <div
                  class="flex h-5 w-5 items-center justify-center rounded-full lg:h-6 lg:w-6"
                  style={selectedRole === role.id
                    ? `background-color: ${role.accentColor}; color: #ffffff;`
                    : ""}
                  class:border={selectedRole !== role.id}
                  class:border-base-300={selectedRole !== role.id}
                  class:group-hover:border-emerald-500={selectedRole !==
                    role.id && role.id === "manager"}
                  class:group-hover:border-blue-500={selectedRole !== role.id &&
                    role.id === "operator"}
                  class:group-hover:border-violet-500={selectedRole !== role.id &&
                    role.id === "viewer"}
                >
                  {#if selectedRole === role.id}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      class="lg:h-3.5 lg:w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  {/if}
                </div>
              </div>

              <!-- Title -->
              <h3
                class="mb-2 text-lg font-bold lg:mb-3 lg:text-2xl"
                style={selectedRole === role.id
                  ? `color: ${role.accentColor};`
                  : ""}
                class:text-contrast-content={selectedRole !== role.id}
                class:group-hover:text-emerald-500={selectedRole !== role.id &&
                  role.id === "manager"}
                class:group-hover:text-blue-500={selectedRole !== role.id &&
                  role.id === "operator"}
                class:group-hover:text-violet-500={selectedRole !== role.id &&
                  role.id === "viewer"}
                class:origin-left={selectedRole === role.id}
                class:scale-105={selectedRole === role.id}
                class:transform={selectedRole === role.id}
              >
                {role.title}
              </h3>

              <!-- Description - shorter on mobile -->
              <p
                class="mb-3 text-xs text-contrast-content/60 lg:mb-5 sm:text-sm min-h-[2.5rem]"
              >
                <span class="lg:hidden">{role.mobileDescription}</span>
                <span class="hidden lg:block">{role.description}</span>
              </p>

              <!-- Features - only show on larger screens -->
              <div class="hidden grid-cols-2 gap-4 lg:grid">
                {#each role.features as feature}
                  <div class="flex items-center gap-2">
                    <div
                      style={selectedRole === role.id
                        ? `color: ${role.accentColor};`
                        : ""}
                      class:text-contrast-content={selectedRole !== role.id}
                      class:group-hover:text-emerald-500={selectedRole !==
                        role.id && role.id === "manager"}
                      class:group-hover:text-blue-500={selectedRole !==
                        role.id && role.id === "operator"}
                      class:group-hover:text-violet-500={selectedRole !==
                        role.id && role.id === "viewer"}
                    >
                      <svelte:component this={feature.icon} size={16} />
                    </div>
                    <span
                      class="text-sm
                      {selectedRole === role.id
                        ? 'text-contrast-content'
                        : 'text-contrast-content/80'}"
                    >
                      {feature.text}
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/each}
      </div>

      <!-- Continue Button - more compact on mobile -->
      <div class="flex flex-col items-center">
        <button
          class="group flex w-full max-w-xs items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition-all duration-200 lg:w-auto lg:max-w-none lg:px-8 lg:py-4 lg:text-base
            {selectedRole
            ? 'transform bg-base-content text-base-100 shadow-lg shadow-base-content/20 hover:scale-105 hover:bg-base-content/90 hover:shadow-xl hover:shadow-base-content/30'
            : 'cursor-not-allowed bg-base-300 text-contrast-content/40'}"
          disabled={!selectedRole || loading}
          on:click={handleSubmit}
        >
          <span
            >Continue as {selectedRole === "manager"
              ? "Manager"
              : selectedRole === "operator"
                ? "Operator"
                : selectedRole === "viewer"
                  ? "Viewer"
                  : "..."}</span
          >
          <ArrowRight
            size={16}
            class="transition-transform duration-200 {selectedRole
              ? 'group-hover:translate-x-1'
              : ''}"
          />
        </button>

        <p
          class="mt-2 px-4 text-center text-xs text-contrast-content/40 lg:mt-4"
        >
          If you're unsure, select Manager — you can change your role later in settings.
        </p>
      </div>
    </div>
  </main>
</div>

<style>
  .role-card:not(.border-2):hover {
    border-color: var(--hover-color);
  }

  .role-card:not(.border-2):hover .top-border {
    border-top-color: var(--hover-color);
  }
</style>
