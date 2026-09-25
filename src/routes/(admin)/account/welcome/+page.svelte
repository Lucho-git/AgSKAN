<!-- src/routes/(admin)/account/welcome/+page.svelte -->
<!-- Landing screen shown right after a guest upgrades to a permanent
     operator on someone's map (invite created with "Upgrade them to an
     operator after signup"). Welcomes them to the team and lets them
     confirm their name + machine before heading into the map. -->
<script lang="ts">
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"
  import { ArrowRight, Loader2, Smartphone } from "lucide-svelte"
  import { Capacitor } from "@capacitor/core"
  import Icon from "@iconify/svelte"
  import { supabase } from "$lib/stores/sessionStore"
  import SVGComponents from "$lib/vehicles/index.js"
  import { getVehicleDisplayName } from "$lib/utils/vehicleDisplayName"
  import {
    VEHICLE_COLORS,
    VEHICLE_COLOR_HEX,
    VEHICLE_TYPES,
    findVehicleType,
  } from "$lib/utils/vehicleTypes"

  let step: "loading" | "form" | "saving" | "app" | "error" = "loading"
  let errorMessage = ""

  // App download / hand-off step (skipped inside the native app itself).
  const APP_STORE_URL = "https://apps.apple.com/app/agskan/id6746783538"
  const PLAY_STORE_URL =
    "https://play.google.com/store/apps/details?id=com.skanfarming"
  const BASE_URL = "https://www.skanfarming.com.au"
  let isNative = false
  let isIOS = false
  let isAndroid = false
  let isMobile = false
  let qrCodeUrl = ""

  let mapName = "the map"
  let ownerName = ""
  let fullName = ""

  // Machine selection — seeded from their current marker (the guest pointer).
  let selectedType = "Pointer"
  let selectedColor = "Yellow"
  let currentMarker: {
    type?: string
    bodyColor?: string
    swath?: number
    size?: number
  } | null = null

  $: selectedTypeName = selectedType
    ? getVehicleDisplayName({ vehicle_marker: { type: selectedType } })
    : "No machine"

  onMount(async () => {
    isNative = Capacitor.isNativePlatform()
    const ua = navigator.userAgent
    isIOS = /iPad|iPhone|iPod/.test(ua)
    isAndroid = /Android/.test(ua)
    isMobile = isIOS || isAndroid

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
          (c) =>
            c.toLowerCase() === String(currentMarker?.bodyColor).toLowerCase(),
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
        const { error } = await supabase.from("vehicle_state").upsert(
          {
            vehicle_id: uid,
            master_map_id: mapId,
            vehicle_marker: marker,
          },
          { onConflict: "vehicle_id" },
        )
        if (error) throw error
      }

      // Native app: they're already in it — straight to the map.
      if (isNative) {
        goto("/account/mapviewer")
        return
      }

      // Web: offer the download / open-in-app hand-off before the map.
      await prepareAppStep()
      step = "app"
    } catch (e: any) {
      errorMessage = e?.message || "Could not save your setup."
      step = "form"
    }
  }

  // Desktop gets a QR that signs the app in as them (refresh-token hand-off).
  async function prepareAppStep() {
    if (isMobile) return
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.refresh_token) return
      const authLink = `${BASE_URL}/app-redirect?refresh_token=${encodeURIComponent(session.refresh_token)}&source=qr`
      qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&ecc=L&data=${encodeURIComponent(authLink)}`
    } catch (e) {
      console.warn("QR code generation skipped:", e)
    }
  }

  // Mobile browser: bounce through /app-redirect, which deep-links into the
  // app with the refresh token (they come out signed in on this map).
  async function openInApp() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.refresh_token) return
      window.location.href = `${BASE_URL}/app-redirect?refresh_token=${encodeURIComponent(session.refresh_token)}&source=mobile`
    } catch (e) {
      console.warn("Open-in-app hand-off failed:", e)
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
          class="group mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-base-content px-4 py-2.5 text-sm font-medium text-base-100 shadow-lg transition-all duration-300 hover:bg-base-content/90"
          on:click={() => goto("/account")}
        >
          Back to your dashboard
          <ArrowRight
            size={16}
            class="transition-transform group-hover:translate-x-1"
          />
        </button>
      </div>
    {:else if step === "app"}
      <div class="flex flex-col items-center gap-2 text-center">
        <p
          class="text-xs font-semibold uppercase tracking-wider text-amber-600"
        >
          One more thing
        </p>
        <h1 class="text-xl font-bold text-contrast-content">
          Take {mapName} with you
        </h1>
        <p class="mt-1 text-sm text-contrast-content/60">
          The app keeps trailing and tracking in the background — grab it, or
          continue in your browser.
        </p>

        <div class="mt-4 w-full space-y-2">
          {#if !isMobile || isIOS}
            <a href={APP_STORE_URL} class="block">
              <div
                class="flex items-center rounded-xl bg-black p-3 text-white transition-transform hover:scale-[1.02]"
              >
                <Icon
                  icon="simple-icons:apple"
                  width="30"
                  height="30"
                  class="mr-3 flex-shrink-0"
                />
                <div class="min-w-0 text-left">
                  <div class="text-xs opacity-90">Download on the</div>
                  <div class="text-base font-semibold">App Store</div>
                </div>
              </div>
            </a>
          {/if}
          {#if !isMobile || isAndroid}
            <a href={PLAY_STORE_URL} class="block">
              <div
                class="flex items-center rounded-xl bg-black p-3 text-white transition-transform hover:scale-[1.02]"
              >
                <Icon
                  icon="simple-icons:googleplay"
                  width="30"
                  height="30"
                  class="mr-3 flex-shrink-0"
                />
                <div class="min-w-0 text-left">
                  <div class="text-xs opacity-90">Get it on</div>
                  <div class="text-base font-semibold">Google Play</div>
                </div>
              </div>
            </a>
          {/if}

          {#if isMobile}
            <button
              class="flex w-full items-center justify-center gap-2 rounded-xl border border-base-300 px-4 py-2.5 text-sm font-medium text-contrast-content transition-colors hover:bg-base-200"
              on:click={openInApp}
            >
              <Smartphone size={16} />
              Open the app
            </button>
            <p class="text-xs text-contrast-content/50">
              Opens AgSKAN if it's already installed
            </p>
          {:else if qrCodeUrl}
            <div class="pt-1">
              <p class="mb-2 text-xs text-contrast-content/60">
                Or scan this with your phone to sign in there:
              </p>
              <img
                src={qrCodeUrl}
                alt="Scan to open AgSKAN on your phone"
                class="mx-auto h-36 w-36 rounded-lg bg-white p-1"
              />
            </div>
          {/if}
        </div>

        <button
          class="group mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-base-content px-4 py-2.5 text-sm font-medium text-base-100 shadow-lg transition-all duration-300 hover:bg-base-content/90"
          on:click={() => goto("/account/mapviewer")}
        >
          Continue to the map
          <ArrowRight
            size={16}
            class="transition-transform group-hover:translate-x-1"
          />
        </button>
      </div>
    {:else}
      <div class="flex flex-col items-center gap-2 text-center">
        <p
          class="text-xs font-semibold uppercase tracking-wider text-amber-600"
        >
          You're on the team
        </p>
        <h1 class="text-xl font-bold text-contrast-content">
          {ownerName
            ? `Congrats on joining ${ownerName}'s farm`
            : `Welcome to ${mapName}`}
        </h1>
        <p class="mt-1 text-sm text-contrast-content/60">
          You're now an operator on {mapName}. Set how you'll appear to the team
          — you can change this anytime.
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
            <div
              class="flex h-10 w-12 flex-shrink-0 items-center justify-center"
            >
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
          <div
            class="max-h-56 overflow-y-auto rounded-xl border border-base-300 p-2"
          >
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
          <div
            class="mt-3 flex flex-nowrap items-center justify-between gap-0.5 sm:gap-1"
          >
            {#each VEHICLE_COLORS as color (color)}
              <button
                class="h-6 w-6 flex-shrink-0 rounded-full border-2 transition-transform hover:scale-110 sm:h-7 sm:w-7 {selectedColor ===
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
          class="group mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-base-content px-4 py-2.5 text-sm font-medium text-base-100 shadow-lg transition-all duration-300 hover:bg-base-content/90 disabled:cursor-not-allowed disabled:opacity-60"
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
