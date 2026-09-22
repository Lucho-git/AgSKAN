<!-- src/routes/(admin)/account/welcome/+page.svelte -->
<!-- Landing screen shown right after a guest upgrades to a permanent
     operator on someone's map (invite created with "Upgrade them to an
     operator after signup"). Welcomes them to the team and lets them
     confirm their name + machine before heading into the map. -->
<script lang="ts">
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"
  import { ArrowRight, Loader2, Sparkles } from "lucide-svelte"
  import { supabase } from "$lib/stores/sessionStore"
  import SVGComponents from "$lib/vehicles/index.js"
  import { getVehicleDisplayName } from "$lib/utils/vehicleDisplayName"
  import {
    VEHICLE_COLORS,
    VEHICLE_COLOR_HEX,
    VEHICLE_TYPES,
    findVehicleType,
  } from "$lib/utils/vehicleTypes"

  let step: "loading" | "form" | "saving" | "error" = "loading"
  let errorMessage = ""

  let mapName = "the map"
  let ownerName = ""
  let fullName = ""

  // Machine selection — seeded from their current marker (the guest pointer).
  let selectedType = "Pointer"
  let selectedColor = "Yellow"
  let currentMarker: { type?: string; bodyColor?: string; swath?: number; size?: number } | null =
    null

  $: selectedTypeName = selectedType
    ? getVehicleDisplayName({ vehicle_marker: { type: selectedType } })
    : "No machine"

  onMount(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) {
        goto("/guest/home")
        return
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, master_map_id")
        .eq("id", uid)
        .maybeSingle()

      // No map to welcome them to — nothing to set up here.
      if (!profile?.master_map_id) {
        goto("/account")
        return
      }

      fullName =
        profile.full_name && profile.full_name !== "Visitor"
          ? profile.full_name
          : ""

      // Map + owner for the congratulations heading.
      const { data: map } = await supabase
        .from("master_maps")
        .select("map_name, master_user_id")
        .eq("id", profile.master_map_id)
        .maybeSingle()
      if (map?.map_name) mapName = map.map_name
      if (map?.master_user_id && map.master_user_id !== uid) {
        const { data: owner } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", map.master_user_id)
          .maybeSingle()
        ownerName = owner?.full_name || ""
      }

      // Their current machine (from the guest join / expiry-proof marker).
      const { data: vehicle } = await supabase
        .from("vehicle_state")
        .select("vehicle_marker")
        .eq("vehicle_id", uid)
        .maybeSingle()
      currentMarker = vehicle?.vehicle_marker || null
      if (currentMarker?.type) selectedType = currentMarker.type
      if (currentMarker?.bodyColor) {
        // Presets can store lowercase colours — normalise to the swatch key.
        const canonical = VEHICLE_COLORS.find(
          (c) => c.toLowerCase() === String(currentMarker?.bodyColor).toLowerCase(),
        )
        selectedColor = canonical || selectedColor
      }

      step = "form"
    } catch (e) {
      console.error("Welcome screen load failed:", e)
      errorMessage = "Could not load your map details."
      step = "error"
    }
  })

  async function handleContinue() {
    step = "saving"
    errorMessage = ""
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) {
        throw new Error("Your session was lost — sign in again to continue.")
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("master_map_id")
        .eq("id", uid)
        .maybeSingle()
      const mapId = profile?.master_map_id
      if (!mapId) {
        goto("/account")
        return
      }

      // Name — only write when they actually gave one.
      const name = fullName.trim()
      if (name) {
        const { error } = await supabase
          .from("profiles")
          .update({ full_name: name, updated_at: new Date().toISOString() })
          .eq("id", uid)
        if (error) throw error
      }

      // Machine — write only when something changed (keeps existing
      // swath/size unless they picked a different machine).
      const preset = findVehicleType(selectedType)
      const typeChanged = selectedType !== (currentMarker?.type || null)
      const colorChanged = selectedColor !== (currentMarker?.bodyColor || null)
      if (!currentMarker || typeChanged || colorChanged) {
        const marker = {
          type: selectedType || "Pointer",
          bodyColor: selectedColor || "Yellow",
          swath:
            typeChanged && preset
              ? preset.swath
              : (currentMarker?.swath ?? preset?.swath ?? 4),
          size:
            typeChanged && preset
              ? preset.size
              : (currentMarker?.size ?? preset?.size ?? 45),
        }
        const { error } = await supabase
          .from("vehicle_state")
          .upsert(
            {
              vehicle_id: uid,
              master_map_id: mapId,
              vehicle_marker: marker,
            },
            { onConflict: "vehicle_id" },
          )
        if (error) throw error
      }

      goto("/account/mapviewer")
    } catch (e: any) {
      errorMessage = e?.message || "Could not save your setup."
      step = "form"
    }
  }
</script>

<svelte:head>
  <title>Welcome — AgSKAN</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="flex min-h-[70vh] items-center justify-center px-4 py-10">
  <div
    class="w-full max-w-lg rounded-2xl border border-base-300 bg-base-100 p-6 shadow-xl sm:p-8"
  >
    {#if step === "loading"}
      <div
        class="flex flex-col items-center gap-3 py-8 text-contrast-content/60"
      >
        <Loader2 size={24} class="animate-spin" />
        <p class="text-sm">Getting your welcome ready…</p>
      </div>
    {:else if step === "error"}
      <div class="flex flex-col items-center gap-3 py-2 text-center">
        <h1 class="text-lg font-semibold text-contrast-content">
          Something went wrong
        </h1>
        <p class="text-sm text-contrast-content/60">{errorMessage}</p>
        <button
          class="group mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-hover px-4 py-2.5 text-sm font-medium text-hover-content shadow-lg transition-all duration-300 hover:bg-hover/90"
          on:click={() => goto("/account")}
        >
          Back to your dashboard
          <ArrowRight
            size={16}
            class="transition-transform group-hover:translate-x-1"
          />
        </button>
      </div>
    {:else}
      <div class="flex flex-col items-center gap-2 text-center">
        <div
          class="mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15"
        >
          <Sparkles size={26} class="text-amber-500" />
        </div>
        <p class="text-xs font-semibold uppercase tracking-wider text-amber-600">
          You're on the team
        </p>
        <h1 class="text-xl font-bold text-contrast-content">
          {ownerName
            ? `Congrats on joining ${ownerName}'s farm`
            : `Welcome to ${mapName}`}
        </h1>
        <p class="mt-1 text-sm text-contrast-content/60">
          You're now an operator on {mapName}. Set how you'll appear to the
          team — you can change this anytime.
        </p>

        <div class="mt-4 w-full text-left">
          <label
            class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-contrast-content/50"
            for="welcome-name">Your name</label
          >
          <input
            id="welcome-name"
            type="text"
            bind:value={fullName}
            placeholder="Your name"
            maxlength="60"
            class="input input-bordered w-full text-contrast-content placeholder:text-contrast-content/40"
          />
        </div>

        <div class="mt-5 w-full text-left">
          <span
            class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-contrast-content/50"
            >Your machine</span
          >

          <!-- Current selection preview -->
          <div
            class="mb-2 flex items-center gap-3 rounded-xl border border-base-300 bg-base-200 px-3 py-2.5"
          >
            <div class="flex h-10 w-12 flex-shrink-0 items-center justify-center">
              {#if SVGComponents[selectedType]}
                <svelte:component
                  this={SVGComponents[selectedType]}
                  bodyColor={selectedColor}
                  size="38px"
                />
              {/if}
            </div>
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-contrast-content">
                {selectedTypeName}
              </p>
              <p class="text-xs text-contrast-content/50">{selectedColor}</p>
            </div>
          </div>

          <!-- Machine picker -->
          <div class="max-h-56 overflow-y-auto rounded-xl border border-base-300 p-2">
            <div class="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
              {#each VEHICLE_TYPES as vehicle (vehicle.type)}
                <button
                  class="flex flex-col items-center gap-1 rounded-lg border p-1.5 transition-colors {selectedType ===
                  vehicle.type
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-transparent hover:bg-base-200'}"
                  on:click={() => (selectedType = vehicle.type)}
                  title={getVehicleDisplayName({
                    vehicle_marker: { type: vehicle.type },
                  })}
                  aria-label={getVehicleDisplayName({
                    vehicle_marker: { type: vehicle.type },
                  })}
                >
                  <span class="flex h-8 items-center justify-center">
                    <svelte:component
                      this={SVGComponents[vehicle.type]}
                      bodyColor={selectedColor}
                      size="26px"
                    />
                  </span>
                  <span
                    class="w-full truncate text-center text-[9px] leading-tight text-contrast-content/60"
                  >
                    {getVehicleDisplayName({
                      vehicle_marker: { type: vehicle.type },
                    })}
                  </span>
                </button>
              {/each}
            </div>
          </div>

          <!-- Colour picker -->
          <div class="mt-3 flex flex-wrap items-center gap-2">
            {#each VEHICLE_COLORS as color (color)}
              <button
                class="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 {selectedColor ===
                color
                  ? 'border-contrast-content'
                  : 'border-transparent'}"
                style="background-color: {VEHICLE_COLOR_HEX[color]};"
                title={color}
                aria-label="Use {color}"
                on:click={() => (selectedColor = color)}
              ></button>
            {/each}
          </div>
        </div>

        {#if errorMessage}
          <p class="mt-3 w-full text-left text-xs font-medium text-error">
            {errorMessage}
          </p>
        {/if}

        <button
          class="group mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-hover px-4 py-2.5 text-sm font-medium text-hover-content shadow-lg transition-all duration-300 hover:bg-hover/90 disabled:cursor-not-allowed disabled:opacity-60"
          on:click={handleContinue}
          disabled={step === "saving"}
        >
          {#if step === "saving"}
            <Loader2 size={16} class="animate-spin" /> Saving…
          {:else}
            Take me to the map
            <ArrowRight
              size={16}
              class="transition-transform group-hover:translate-x-1"
            />
          {/if}
        </button>

        <p class="mt-3 text-xs text-contrast-content/50">
          You can change your name and machine anytime.
        </p>
      </div>
    {/if}
  </div>
</div>
