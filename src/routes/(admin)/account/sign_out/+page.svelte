<script lang="ts">
  import { invalidateAll } from "$app/navigation"
  import { supabase } from "$lib/supabaseClient"
  import { onMount } from "svelte"
  import { fade } from "svelte/transition"
  import { browser } from "$app/environment"

  let message = "Preparing to sign out..."
  let subMessage = "Initializing..."
  let progress = 0
  let isSigningOut = false
  const REDIRECT_DELAY = 3000

  // Set this to true to directly redirect without auth state changes
  let forceRedirect = false

  const updateStatus = (
    mainMsg: string,
    subMsg: string,
    progressValue: number,
  ) => {
    message = mainMsg
    subMessage = subMsg
    progress = progressValue
  }

  const clearBrowserStorage = () => {
    console.group("Storage Cleanup")
    let clearedItems = 0
    let totalItems = 0

    try {
      // Count total items first
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.includes("supabase") || key?.includes("sb-")) totalItems++
      }
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (key?.includes("supabase") || key?.includes("sb-")) totalItems++
      }
      document.cookie.split(";").forEach((cookie) => {
        const name = cookie.split("=")[0].trim()
        if (name.includes("supabase") || name.includes("sb-")) totalItems++
      })

      // Clear localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.includes("supabase") || key?.includes("sb-")) {
          localStorage.removeItem(key)
          clearedItems++
          console.log(`Cleared localStorage: ${key}`)
        }
      }

      // Clear sessionStorage
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (key?.includes("supabase") || key?.includes("sb-")) {
          sessionStorage.removeItem(key)
          clearedItems++
          console.log(`Cleared sessionStorage: ${key}`)
        }
      }

      // Clear cookies
      const domains = [
        window.location.hostname,
        `.${window.location.hostname}`,
        window.location.hostname.split(".").slice(1).join("."),
        "",
      ]
      const paths = ["/", ""]

      document.cookie.split(";").forEach((cookie) => {
        const name = cookie.split("=")[0].trim()
        if (name.includes("supabase") || name.includes("sb-")) {
          domains.forEach((domain) => {
            paths.forEach((path) => {
              document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}${domain ? `; domain=${domain}` : ""}`
            })
          })
          clearedItems++
          console.log(`Cleared cookie: ${name}`)
        }
      })

      return { success: true, clearedItems, totalItems }
    } catch (error) {
      console.error("Error clearing storage:", error)
      return { success: false, error }
    } finally {
      console.groupEnd()
    }
  }

  // This function will handle direct navigation to avoid session expiry page
  const redirectToLogin = () => {
    // Set a flag to avoid any auth state change processing
    if (browser) {
      // Use window.location.replace to avoid adding to browser history
      window.location.replace("/login")
    }
  }

  const handleSignOut = async () => {
    if (isSigningOut) return

    isSigningOut = true
    console.group("Sign-out Process")
    console.time("Total Sign-out Duration")

    try {
      // 1. Clear cached data
      updateStatus("Signing out...", "Clearing cached data...", 20)
      await new Promise((resolve) => setTimeout(resolve, 400)) // Small delay

      try {
        // Call invalidateAll to clear any cached data
        await invalidateAll()
      } catch (e) {
        console.log("Cache invalidation skipped:", e)
      }

      // 2. Client-side signout preparation
      updateStatus("Signing out...", "Clearing authentication...", 40)
      await new Promise((resolve) => setTimeout(resolve, 400)) // Small delay

      // 3. Clear browser storage
      updateStatus("Cleaning up...", "Removing stored data...", 60)
      await new Promise((resolve) => setTimeout(resolve, 400)) // Small delay

      const clearResult = clearBrowserStorage()
      if (!clearResult.success) {
        console.warn("Storage cleanup had issues")
      }

      updateStatus("Verifying...", "Making sure everything is cleared...", 80)
      await new Promise((resolve) => setTimeout(resolve, 400)) // Small delay

      // Second cleanup pass
      clearBrowserStorage()

      // Show success message right before redirecting
      updateStatus("Success!", "Taking you to login...", 100)
      await new Promise((resolve) => setTimeout(resolve, 400)) // Small delay

      // Complete the signout and redirect directly
      // IMPORTANT: Set forceRedirect before signing out
      forceRedirect = true

      // Do the actual sign-out as the final step
      await supabase.auth.signOut({ scope: "global" })

      // After a very brief delay to allow sign-out to process,
      // redirect directly to login to avoid showing session expiry
      setTimeout(() => {
        redirectToLogin()
      }, 100)
    } catch (error) {
      console.error("Sign-out failed:", error)
      updateStatus(
        "Error during sign-out",
        "Attempting emergency cleanup...",
        100,
      )

      // Recovery attempt
      try {
        clearBrowserStorage()
        forceRedirect = true
        await supabase.auth.signOut({ scope: "global" })
      } catch (recoveryError) {
        console.error("Recovery attempt failed:", recoveryError)
      }

      // Always redirect regardless of errors
      setTimeout(() => {
        redirectToLogin()
      }, 500)
    } finally {
      console.timeEnd("Total Sign-out Duration")
      console.groupEnd()
    }
  }

  onMount(() => {
    // Add a direct navigation handler to prevent showing session expiry
    if (browser) {
      // Set up a listener that triggers before any auth state processing
      window.addEventListener("beforeunload", () => {
        if (forceRedirect) {
          redirectToLogin()
          return null
        }
      })
    }

    // Start the sign-out process
    handleSignOut()
  })
</script>

<div class="flex min-h-screen items-center justify-center">
  <div class="w-full max-w-md p-8 text-center">
    <div class="rounded-lg p-8 shadow-lg" transition:fade>
      <h1 class="mb-2 text-2xl font-bold">{message}</h1>
      <p class="mb-6 text-sm">{subMessage}</p>

      {#if isSigningOut}
        <div class="mb-4">
          <div class="h-2 w-full rounded-full bg-gray-200">
            <div
              class="h-2 rounded-full bg-blue-600 transition-all duration-500"
              style="width: {progress}%"
            />
          </div>
        </div>
        <div class="loading loading-spinner loading-md text-blue-600" />
      {/if}
    </div>
  </div>
</div>
