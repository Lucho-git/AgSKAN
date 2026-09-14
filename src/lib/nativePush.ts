// Native push (OneSignal) for the Capacitor apps.
//
// The web/PWA keeps its own web-push pipeline (`pushNotifications.ts` +
// `push_subscriptions` + VAPID). OneSignal is used *only* for the native app
// builds, where web push cannot deliver. Everything here is a no-op on the
// web, and the plugin is lazy-loaded so the browser bundle never touches it.

import { browser } from "$app/environment"
import { Capacitor } from "@capacitor/core"
import { PUBLIC_ONESIGNAL_APP_ID } from "$env/static/public"

type OneSignalModule = typeof import("@onesignal/capacitor-plugin")

let modulePromise: Promise<OneSignalModule | null> | null = null
let initPromise: Promise<boolean> | null = null
let clickListenerAttached = false
let currentExternalId: string | null = null

/** True only inside the packaged iOS/Android apps. */
export function isNativeApp(): boolean {
  if (!browser) return false
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/** Lazily import the OneSignal plugin — never on web, never on the server. */
async function loadOneSignal(): Promise<OneSignalModule | null> {
  if (!isNativeApp()) return null
  if (!modulePromise) {
    modulePromise = import("@onesignal/capacitor-plugin").catch((error) => {
      console.error("[nativePush] Could not load OneSignal plugin:", error)
      modulePromise = null
      return null
    })
  }
  return modulePromise
}

/**
 * Initialise OneSignal and register the notification-tap handler.
 * Idempotent — safe to call from multiple layouts.
 */
export function initNativePush(): Promise<boolean> {
  if (!isNativeApp()) return Promise.resolve(false)
  if (!initPromise) initPromise = doInitNativePush()
  return initPromise
}

async function doInitNativePush(): Promise<boolean> {
  const mod = await loadOneSignal()
  if (!mod) return false
  const OneSignal = mod.default
  try {
    if (import.meta.env.DEV) {
      OneSignal.Debug.setLogLevel(mod.LogLevel.Verbose)
    }
    await OneSignal.initialize(PUBLIC_ONESIGNAL_APP_ID)
    console.log("[nativePush] OneSignal initialised")

    if (!clickListenerAttached) {
      clickListenerAttached = true
      OneSignal.Notifications.addEventListener("click", (event) => {
        try {
          const data = (event?.notification?.additionalData ?? {}) as Record<
            string,
            unknown
          >
          const url =
            typeof data.url === "string" && data.url
              ? data.url
              : "/account/mapviewer"
          void import("$app/navigation")
            .then(({ goto }) => goto(url))
            .catch(() => {
              window.location.assign(url)
            })
        } catch (error) {
          console.warn("[nativePush] notification click handling failed:", error)
        }
      })
    }
    return true
  } catch (error) {
    console.error("[nativePush] OneSignal initialise failed:", error)
    initPromise = null // allow a retry on the next call
    return false
  }
}

/**
 * Keep the OneSignal user in sync with the Supabase session
 * (`external_id` = Supabase user id). Safe to call repeatedly.
 */
export async function syncNativePushUser(userId: string | null): Promise<void> {
  if (!isNativeApp()) return
  const ready = await initNativePush()
  if (!ready) return
  const mod = await loadOneSignal()
  if (!mod) return
  const OneSignal = mod.default

  if (userId) {
    if (currentExternalId === userId) return
    try {
      await OneSignal.login(userId)
      currentExternalId = userId
      console.log("[nativePush] linked device to user", userId)
    } catch (error) {
      console.error("[nativePush] login failed:", error)
    }
  } else {
    if (currentExternalId === null) return
    try {
      await OneSignal.logout()
      currentExternalId = null
    } catch (error) {
      console.error("[nativePush] logout failed:", error)
    }
  }
}

export interface NativePushState {
  available: boolean
  permission: boolean
  canRequest: boolean
  subscriptionId: string | null
  token: string | null
  optedIn: boolean
  externalId: string | null
}

const EMPTY_STATE: NativePushState = {
  available: false,
  permission: false,
  canRequest: false,
  subscriptionId: null,
  token: null,
  optedIn: false,
  externalId: null,
}

/** Read the current permission + subscription state (for the settings UI). */
export async function getNativePushState(): Promise<NativePushState> {
  if (!isNativeApp()) return EMPTY_STATE
  const mod = await loadOneSignal()
  if (!mod) return EMPTY_STATE
  const OneSignal = mod.default
  try {
    const [
      permission,
      canRequest,
      subscriptionId,
      token,
      optedIn,
      externalId,
    ] = await Promise.all([
      OneSignal.Notifications.hasPermission(),
      OneSignal.Notifications.canRequestPermission(),
      OneSignal.User.pushSubscription.getIdAsync(),
      OneSignal.User.pushSubscription.getTokenAsync(),
      OneSignal.User.pushSubscription.getOptedInAsync(),
      OneSignal.User.getExternalId(),
    ])
    return {
      available: true,
      permission,
      canRequest,
      subscriptionId,
      token,
      optedIn,
      externalId,
    }
  } catch (error) {
    console.error("[nativePush] could not read push state:", error)
    return { ...EMPTY_STATE, available: true }
  }
}

/** Prompt for the OS notification permission (Android 13+ / iOS dialog). */
export async function requestNativePushPermission(
  fallbackToSettings = true,
): Promise<boolean> {
  if (!isNativeApp()) return false
  const ready = await initNativePush()
  if (!ready) return false
  const mod = await loadOneSignal()
  if (!mod) return false
  try {
    return await mod.default.Notifications.requestPermission(
      fallbackToSettings,
    )
  } catch (error) {
    console.error("[nativePush] permission request failed:", error)
    return false
  }
}
