<!-- src/routes/login/+layout.svelte -->
<script>
  import { onMount } from "svelte"
  import { session } from "$lib/stores/sessionStore"
  import { goto } from "$app/navigation"
  import { browser } from "$app/environment"
  import DeviceMap from "../landing/DeviceMap.svelte"

  // Flag to track initial session check
  let initialCheckComplete = false

  // Only redirect if user is already logged in when they visit the page
  onMount(() => {
    // A fresh sign-out hard-reloads here; clear the coordination flag.
    if (browser) sessionStorage.removeItem("signout_in_progress")

    if (browser && $session) {
      console.log("User already logged in, redirecting away from login page")
      goto("/account")
    }
    initialCheckComplete = true
  })

  // Redirect to /account once a genuine session is established (sign-in)
  $: if (browser && initialCheckComplete && $session) {
    goto("/account")
  }
</script>

<!-- Mobile first: one padded column. From 1024px a map panel sits beside it. -->
<div class="auth-shell">
  <main class="auth-main">
    <div class="auth-column">
      <slot />
    </div>
  </main>

  <aside class="auth-side lp-band" aria-hidden="true">
    <p class="lp-eyebrow">Live farm map</p>
    <p class="auth-side-title">One live map for the whole crew.</p>
    <div class="auth-device">
      <DeviceMap device="phone" scene="seeding" />
    </div>
  </aside>
</div>

<style>
  .auth-shell {
    display: grid;
    flex: 1;
    background: var(--lp-paper);
  }
  .auth-main {
    display: flex;
    justify-content: center;
    padding: 1.75rem 1.25rem max(2.5rem, env(safe-area-inset-bottom));
  }
  .auth-column {
    width: 100%;
    max-width: 25rem;
  }
  .auth-side {
    display: none;
  }

  @media (min-width: 640px) {
    .auth-main {
      padding-top: 3.5rem;
    }
  }
  @media (min-width: 1024px) {
    .auth-shell {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
    .auth-main {
      align-items: center;
      padding-block: 3rem;
    }
    .auth-side {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.9rem;
      overflow: hidden;
      padding: 3rem 2rem;
      text-align: center;
    }
    .auth-side-title {
      max-width: 12ch;
      font-family: var(--lp-display);
      font-size: clamp(2rem, 3.2vw, 3rem);
      font-weight: 800;
      letter-spacing: -0.025em;
      line-height: 1;
    }
    .auth-device {
      width: min(100%, 250px);
      margin-top: 1.5rem;
    }
  }
</style>
