<script lang="ts">
  import { onMount, onDestroy } from "svelte"
  import Icon from "@iconify/svelte"
  import { toast } from "svelte-sonner"
  import { browser } from "$app/environment"
  import { Capacitor } from "@capacitor/core"
  import { App } from "@capacitor/app"
  import { Geolocation } from "@capacitor/geolocation"
  import BackgroundGeolocation from "@transistorsoft/capacitor-background-geolocation"
  import RawGps from "$lib/plugins/rawGps"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { userSettingsApi } from "$lib/api/userSettingsApi"

  // Check if running on native platform
  const isNativePlatform = Capacitor.isNativePlatform()

  // Permission states
  let locationPermissionStatus = "Unknown"
  let backgroundLocationStatus = "Unknown"

  // Web geolocation state
  let webLocationSupported = false
  let webLocationStatus = "Unknown"

  // Check if web geolocation is supported
  function checkWebGeolocationSupport() {
    if (browser && "geolocation" in navigator) {
      webLocationSupported = true
      webLocationStatus = "Available"
    } else {
      webLocationSupported = false
      webLocationStatus = "Not supported"
    }
  }

  // Check location permissions for native
  async function checkLocationPermissions() {
    if (!isNativePlatform) return

    try {
      // Check foreground location permission
      const permStatus = await Geolocation.checkPermissions()
      locationPermissionStatus = permStatus.location

      // Check background location status using the status code
      try {
        const providerState = await BackgroundGeolocation.getProviderState()
        // Status code 3 = AUTHORIZATION_STATUS_ALWAYS
        backgroundLocationStatus =
          providerState.status === 3 ? "granted" : "denied"
      } catch (err) {
        console.error("Error checking background permissions:", err)
        backgroundLocationStatus = "Error checking"
      }
    } catch (err) {
      console.error("Error checking location permissions:", err)
      locationPermissionStatus = "Error checking"
      backgroundLocationStatus = "Error checking"
    }
  }

  // Open the native app settings (iOS Settings / Android App Info)
  async function openAppSettings() {
    try {
      if (Capacitor.getPlatform() === 'ios') {
        // Use our native RawGps plugin which calls UIApplication.openSettingsURLString
        await RawGps.openSettings()
      } else {
        // Android: open app detail settings
        await App.openUrl({ url: 'android.settings.APPLICATION_DETAILS_SETTINGS' })
      }
      toast.info('Change permissions in Settings, then return here', { duration: 4000 })
    } catch (err) {
      console.error('Error opening app settings:', err)
      toast.error('Could not open Settings')
    }
  }

  // Request location permission
  async function requestLocationPermission() {
    if (!isNativePlatform) {
      toast.error("Location permissions can only be requested on mobile apps")
      return
    }

    try {
      const permStatus = await Geolocation.requestPermissions()
      toast.success("Location permission updated")
      locationPermissionStatus = permStatus.location
      await checkLocationPermissions()
    } catch (err) {
      console.error("Error requesting location permission:", err)
      toast.error("Failed to update location permission")
    }
  }

  // Disable location permission (opens Settings)
  async function disableLocationPermission() {
    await openAppSettings()
  }

  // Disable background location permission (opens Settings)
  async function disableBackgroundLocationPermission() {
    await openAppSettings()
  }

  // Request background location permission
  async function requestBackgroundLocationPermission() {
    if (!isNativePlatform) {
      toast.error(
        "Background location permissions can only be requested on mobile apps",
      )
      return
    }

    if (locationPermissionStatus !== "granted") {
      toast.error("Please enable location permission first")
      return
    }

    try {
      // Show explanation
      toast.info(
        "Background location is needed to track field operations while the app is in the background",
        { duration: 5000 },
      )

      // Request the permission — temporarily switch to 'Always' so the iOS
      // "Always Allow" dialog is presented, then revert to 'WhenInUse' so the
      // plugin doesn't auto-prompt on every map open.
      setTimeout(async () => {
        try {
          await BackgroundGeolocation.setConfig({ locationAuthorizationRequest: 'Always' })
          await BackgroundGeolocation.requestPermission()
          // Revert to WhenInUse so map opens don't auto-prompt
          await BackgroundGeolocation.setConfig({ locationAuthorizationRequest: 'WhenInUse' })

          // Check the state after the request
          const afterState = await BackgroundGeolocation.getProviderState()
          const wasGranted = afterState.status === 3

          if (wasGranted) {
            toast.success("Background location enabled")
          } else {
            toast.warning("Background location not enabled — you may need to select 'Always Allow' in Settings")
          }

          // Update UI to reflect new status
          await checkLocationPermissions()
        } catch (err) {
          console.error("Error requesting background location:", err)
          // Ensure we revert config even on error
          try { await BackgroundGeolocation.setConfig({ locationAuthorizationRequest: 'WhenInUse' }) } catch (_) {}
          toast.error("Failed to update background location permission")
        }
      }, 2500)
    } catch (err) {
      console.error("Error in background location flow:", err)
      toast.error("An error occurred")
    }
  }

  // Test web geolocation
  async function testWebLocation() {
    if (!webLocationSupported) {
      toast.error("Geolocation is not supported by this browser")
      return
    }

    toast.promise(
      new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            })
          },
          (error) => {
            reject(new Error(error.message))
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000,
          },
        )
      }),
      {
        loading: "Getting your location...",
        success: (position) =>
          `Location: ${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)} (±${Math.round(position.accuracy)}m)`,
        error: (err) => `Failed to get location: ${err.message}`,
      },
    )
  }

  let resumeListener = null

  onMount(() => {
    if (isNativePlatform) {
      checkLocationPermissions()
      // Re-check permissions when user returns from Settings app
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) checkLocationPermissions()
      }).then(listener => { resumeListener = listener })
    } else {
      checkWebGeolocationSupport()
    }
    // Initialize settings defaults from store
    if ($userSettingsStore) {
      // noop here — UI binds directly where needed
    }
  })

  onDestroy(() => {
    if (resumeListener) {
      resumeListener.remove()
    }
  })
</script>

<svelte:head>
  <title>Location Permissions</title>
</svelte:head>

<!-- Header -->
<div
  class="flex items-center justify-between border-b border-base-300 bg-base-100 p-5"
>
  <h2
    class="flex items-center gap-2 text-xl font-semibold text-contrast-content"
  >
    <div class="rounded-lg bg-base-content/10 p-1.5">
      <Icon
        icon="solar:gps-bold-duotone"
        width="18"
        height="18"
        class="text-base-content"
      />
    </div>
    Location Permissions
  </h2>
</div>

<!-- Content -->
<div class="space-y-6 p-6">
  <!-- Platform Information -->
  <div>
    <h3 class="mb-3 flex items-center gap-2 font-medium text-contrast-content">
      <div class="rounded-lg bg-base-content/10 p-1.5">
        <Icon
          icon="solar:smartphone-bold-duotone"
          width="16"
          height="16"
          class="text-base-content"
        />
      </div>
      Platform
    </h3>

    <div class="rounded-lg border border-base-300 bg-base-200/30 p-4">
      <div class="flex items-center gap-3">
        <div
          class="rounded-full {isNativePlatform ? 'bg-success' : 'bg-info'} p-2"
        >
          <Icon
            icon={isNativePlatform
              ? "solar:smartphone-bold"
              : "solar:global-bold"}
            width="16"
            height="16"
            class="text-white"
          />
        </div>
        <div>
          <p class="font-medium text-contrast-content">
            {isNativePlatform ? "Mobile App" : "Web Browser"}
          </p>
          <p class="text-sm text-contrast-content/60">
            {isNativePlatform
              ? `Running on ${Capacitor.getPlatform()}`
              : "Running in web browser"}
          </p>
        </div>
      </div>
    </div>
  </div>

  {#if isNativePlatform}
    <!-- Native Platform Permissions -->
    <div>
      <h3
        class="mb-3 flex items-center gap-2 font-medium text-contrast-content"
      >
        <div class="rounded-lg bg-base-content/10 p-1.5">
          <Icon
            icon="solar:shield-check-bold-duotone"
            width="16"
            height="16"
            class="text-base-content"
          />
        </div>
        App Permissions
      </h3>

      <div class="space-y-3">
        <!-- Location Permission -->
        <div
          class="flex items-center justify-between rounded-lg border border-base-300 bg-base-200/30 p-4"
        >
          <div class="flex items-center gap-3">
            <div class="rounded-lg bg-base-content/10 p-2">
              <Icon
                icon="solar:gps-bold-duotone"
                width="18"
                height="18"
                class="text-base-content"
              />
            </div>
            <div>
              <p class="font-medium text-contrast-content">Location Access</p>
              <p class="text-sm text-contrast-content/60">
                Required for tracking your position
              </p>
              <p class="text-xs text-contrast-content/40">
                Status: {locationPermissionStatus}
              </p>
            </div>
          </div>
          {#if locationPermissionStatus === "granted"}
            <button
              class="btn btn-outline btn-error btn-sm gap-2"
              on:click={disableLocationPermission}
            >
              <Icon icon="solar:close-circle-bold-duotone" width="16" height="16" />
              Disable
            </button>
          {:else}
            <button
              class="btn btn-outline btn-sm gap-2"
              on:click={requestLocationPermission}
            >
              <Icon icon="solar:settings-bold-duotone" width="16" height="16" />
              Enable
            </button>
          {/if}
        </div>

        <!-- Background Location Permission -->
        <div
          class="flex items-center justify-between rounded-lg border border-base-300 bg-base-200/30 p-4"
        >
          <div class="flex items-center gap-3">
            <div class="rounded-lg bg-base-content/10 p-2">
              <Icon
                icon="solar:clock-circle-bold-duotone"
                width="18"
                height="18"
                class="text-base-content"
              />
            </div>
            <div>
              <p class="font-medium text-contrast-content">
                Background Location
              </p>
              <p class="text-sm text-contrast-content/60">
                Track location when app is closed
              </p>
              <p class="text-xs text-contrast-content/40">
                Status: {backgroundLocationStatus}
              </p>
            </div>
          </div>
          {#if backgroundLocationStatus === "granted"}
            <button
              class="btn btn-outline btn-error btn-sm gap-2"
              on:click={disableBackgroundLocationPermission}
            >
              <Icon icon="solar:close-circle-bold-duotone" width="16" height="16" />
              Disable
            </button>
          {:else}
            <button
              class="btn btn-outline btn-sm gap-2"
              disabled={locationPermissionStatus !== "granted"}
              on:click={requestBackgroundLocationPermission}
            >
              <Icon icon="solar:settings-bold-duotone" width="16" height="16" />
              Enable
            </button>
          {/if}
        </div>
      </div>
    </div>
    <!-- GPS Frequency Setting -->
    <div class="mt-4">
      <h3 class="mb-3 flex items-center gap-2 font-medium text-contrast-content">
        <div class="rounded-lg bg-base-content/10 p-1.5">
          <Icon
            icon="solar:settings-bold-duotone"
            width="16"
            height="16"
            class="text-base-content"
          />
        </div>
        GPS Frequency
      </h3>

      <div class="rounded-lg border border-base-300 bg-base-200/30 p-4 space-y-3">
        <div>
          <div class="flex items-center justify-between mb-2">
            <div>
              <p class="text-sm font-medium text-contrast-content">Location ping interval</p>
              <p class="text-xs text-contrast-content/60">How many seconds between each GPS location ping.</p>
            </div>
            <span class="text-sm font-semibold text-primary tabular-nums">
              {$userSettingsStore?.gpsIntervalSeconds ?? 2}s
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            class="range range-primary range-sm w-full"
            value={$userSettingsStore?.gpsIntervalSeconds ?? 2}
            on:change={async (e) => {
              const newVal = parseInt(e.currentTarget.value)
              const oldVal = $userSettingsStore?.gpsIntervalSeconds ?? 2
              userSettingsStore.update(s => ({ ...s, gpsIntervalSeconds: newVal }))
              try {
                const res = await userSettingsApi.updateGpsIntervalSeconds(newVal)
                if (!res?.success) throw new Error('save failed')
                toast.success(`GPS interval set to ${newVal}s`)
              } catch (err) {
                userSettingsStore.update(s => ({ ...s, gpsIntervalSeconds: oldVal }))
                toast.error('Failed to save GPS interval')
              }
            }}
            on:input={(e) => {
              const newVal = parseInt(e.currentTarget.value)
              userSettingsStore.update(s => ({ ...s, gpsIntervalSeconds: newVal }))
            }}
          />
          <div class="flex justify-between text-xs text-contrast-content/40 mt-1">
            <span>1s</span>
            <span>5s</span>
            <span>10s</span>
          </div>
        </div>
      </div>
    </div>
  {:else}
    <!-- Web Platform -->
    <div>
      <h3
        class="mb-3 flex items-center gap-2 font-medium text-contrast-content"
      >
        <div class="rounded-lg bg-base-content/10 p-1.5">
          <Icon
            icon="solar:global-bold-duotone"
            width="16"
            height="16"
            class="text-base-content"
          />
        </div>
        Web Location
      </h3>

      <div class="space-y-3">
        <!-- Web Geolocation -->
        <div
          class="flex items-center justify-between rounded-lg border border-base-300 bg-base-200/30 p-4"
        >
          <div class="flex items-center gap-3">
            <div class="rounded-lg bg-base-content/10 p-2">
              <Icon
                icon="solar:global-bold-duotone"
                width="18"
                height="18"
                class="text-base-content"
              />
            </div>
            <div>
              <p class="font-medium text-contrast-content">
                Browser Geolocation
              </p>
              <p class="text-sm text-contrast-content/60">
                Get location from browser
              </p>
              <p class="text-xs text-contrast-content/40">
                Status: {webLocationStatus}
              </p>
            </div>
          </div>
          <button
            class="btn btn-outline btn-sm gap-2"
            disabled={!webLocationSupported}
            on:click={testWebLocation}
          >
            <Icon icon="solar:map-point-bold-duotone" width="16" height="16" />
            Test Location
          </button>
        </div>

        <!-- Web Limitations Info -->
        <div class="rounded-lg border border-warning/20 bg-warning/5 p-4">
          <div class="flex items-start gap-3">
            <Icon
              icon="solar:danger-triangle-bold-duotone"
              width="20"
              height="20"
              class="mt-0.5 text-warning"
            />
            <div>
              <p class="text-sm font-medium text-contrast-content">
                Web Browser Limitations
              </p>
              <ul class="mt-1 space-y-1 text-xs text-contrast-content/60">
                <li>• Location only available when page is active</li>
                <li>• No background tracking capability</li>
                <li>• Requires user permission for each session</li>
                <li>• Less accurate than native GPS</li>
                <li>• For best tracking, use the mobile app</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Information Section -->
  <div class="rounded-lg border border-base-300 bg-base-200/10 p-4">
    <div class="flex items-start gap-3">
      <Icon
        icon="solar:info-circle-bold-duotone"
        width="20"
        height="20"
        class="mt-0.5 text-info"
      />
      <div>
        <p class="text-sm font-medium text-contrast-content">
          About Location Permissions
        </p>
        <p class="mt-1 text-xs text-contrast-content/60">
          Location permissions are required to track your position during field
          operations.
          {#if isNativePlatform}
            Background location allows tracking even when the app is closed,
            providing more accurate field coverage data.
          {/if}
        </p>
      </div>
    </div>
  </div>
</div>
