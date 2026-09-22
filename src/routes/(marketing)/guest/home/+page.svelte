<!-- src/routes/(marketing)/guest/home/+page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte"
  import { goto } from "$app/navigation"
  import {
    ArrowRight,
    Clock,
    Loader2,
    Sparkles,
    UserPlus,
  } from "lucide-svelte"
  import { supabase } from "$lib/stores/sessionStore"
  import { goToGuestSignup } from "$lib/utils/guestUpgrade"

  let loading = true
  let guestName = ""
  let mapName = ""
  let accessExpiresAt: string | null = null
  let hasMap = false
  // Invite flag: does creating an account keep this map's access?
  let keepAccess = false
  // Real account (email / upgraded guest) — guest options don't apply.
  let isAccount = false

  let now = Date.now()
  let tickTimer: ReturnType<typeof setInterval> | null = null

  $: remainingMs = accessExpiresAt
    ? new Date(accessExpiresAt).getTime() - now
    : null
  $: expired = remainingMs !== null && remainingMs <= 0
  $: remainingText = remainingMs !== null ? formatRemaining(remainingMs) : null

  function formatRemaining(ms: number) {
    const mins = Math.max(0, Math.floor(ms / 60000))
    const days = Math.floor(mins / 1440)
    const hours = Math.floor((mins % 1440) / 60)
    const m = mins % 60
    if (days > 0)
      return `${days} day${days === 1 ? "" : "s"} ${hours} hour${hours === 1 ? "" : "s"}`
    if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"} ${m} min`
    return `${Math.max(m, 1)} min`
  }

  function formatEndDate(iso: string) {
    try {
      return new Date(iso).toLocaleString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    } catch {
      return ""
    }
  }

  onMount(async () => {
    tickTimer = setInterval(() => (now = Date.now()), 30000)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) {
        goto("/")
        return
      }

      // A real account (email set, or an anonymous session already upgraded /
      // with a pending confirmation) — the guest options don't apply to them.
      const su = session.user
      isAccount =
        su.is_anonymous === false || !!su.email || !!su.new_email

      const { data: profile } = await supabase
        .from("profiles")
        .select(
          "full_name, master_map_id, access_expires_at, map_role, retain_after_signup",
        )
        .eq("id", uid)
        .single()

      guestName = profile?.full_name || ""
      accessExpiresAt = profile?.access_expires_at || null
      hasMap = !!profile?.master_map_id
      // Inherited from the invite's "Keep their access after signup" box.
      keepAccess = !!profile?.retain_after_signup

      // Map name: direct read if allowed, otherwise the name cached by /guest.
      let name = ""
      if (profile?.master_map_id) {
        const { data: map } = await supabase
          .from("master_maps")
          .select("map_name")
          .eq("id", profile.master_map_id)
          .maybeSingle()
        name = map?.map_name || ""
      }
      if (!name) {
        try {
          name = localStorage.getItem("guest_map_name") || ""
        } catch {
          /* storage unavailable */
        }
      }
      mapName = name || "the map"
    } catch (e) {
      console.warn("Guest home load failed:", e)
    } finally {
      loading = false
    }
  })

  onDestroy(() => {
    if (tickTimer) clearInterval(tickTimer)
  })
</script>

<svelte:head>
  <title>Guest access — AgSKAN</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="flex min-h-[70vh] items-center justify-center px-4 py-10">
  <div
    class="w-full max-w-md rounded-2xl border border-base-300 bg-base-100 p-6 shadow-xl sm:p-8"
  >
    {#if loading}
      <div class="flex flex-col items-center gap-3 py-8 text-contrast-content/60">
        <Loader2 size={24} class="animate-spin" />
        <p class="text-sm">Loading your guest access…</p>
      </div>
    {:else}
      <div class="flex flex-col items-center gap-2 text-center">
        <p class="text-xs font-semibold uppercase tracking-wider text-amber-600">
          {isAccount ? "Signed in" : "Guest access"}
        </p>
        <h1 class="text-xl font-bold text-contrast-content">{mapName}</h1>
        {#if guestName}
          <p class="text-sm text-contrast-content/60">Joined as {guestName}</p>
        {/if}

        <div
          class="mt-4 w-full rounded-xl border border-base-300 bg-base-200 p-4 text-left"
        >
          <div class="flex items-center gap-2 text-sm font-medium text-contrast-content">
            <Clock size={15} class="flex-shrink-0 text-contrast-content/60" />
            <span>
              {#if !hasMap}
                Your access to this map has ended.
              {:else if expired}
                Your access has expired.
              {:else if accessExpiresAt}
                Access ends in <strong>{remainingText}</strong>
              {:else}
                Access is open-ended
              {/if}
            </span>
          </div>
          {#if hasMap && accessExpiresAt && !expired}
            <p class="mt-1.5 pl-6 text-xs text-contrast-content/50">
              Ends {formatEndDate(accessExpiresAt)}
            </p>
          {/if}
        </div>

        {#if hasMap && !expired}
          <button
            class="btn btn-primary mt-4 w-full"
            on:click={() => goto("/account/mapviewer")}
          >
            Open the map <ArrowRight size={16} />
          </button>
        {/if}

        {#if isAccount}
          <div
            class="mt-5 w-full rounded-xl border border-dashed border-base-300 p-4 text-left"
          >
            <p class="flex items-center gap-2 text-sm font-semibold text-contrast-content">
              <Sparkles size={15} class="text-amber-500" /> You're signed in
            </p>
            <p class="mt-1 text-xs text-contrast-content/60">
              {guestName ? `Signed in as ${guestName}. ` : ""}The guest options
              don't apply to your account — you can open your map or dashboard
              any time.
            </p>
            {#if !hasMap}
              <button
                class="group mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-base-content px-4 py-2.5 text-sm font-medium text-base-100 shadow-lg transition-all duration-300 hover:bg-base-content/90"
                on:click={() => goto("/account")}
              >
                Open your dashboard
                <ArrowRight
                  size={16}
                  class="transition-transform group-hover:translate-x-1"
                />
              </button>
            {/if}
          </div>
        {:else}
          <div
            class="mt-5 w-full rounded-xl border border-dashed border-base-300 p-4 text-left"
          >
            <p class="flex items-center gap-2 text-sm font-semibold text-contrast-content">
              <Sparkles size={15} class="text-amber-500" />
              {keepAccess ? "Become an operator" : "Create your own account"}
            </p>
            <p class="mt-1 text-xs text-contrast-content/60">
              {#if keepAccess}
                Create an account to join {mapName} as a full operator —
                you'll keep your name and machine, with no guest time limit.
              {:else}
                This guest invite doesn't carry over after signup. Creating an
                account takes you off {mapName} and sets you up with your own
                AgSKAN account.
              {/if}
            </p>
            <button
              class="group mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-base-content px-4 py-2.5 text-sm font-medium text-base-100 shadow-lg transition-all duration-300 hover:bg-base-content/90"
              on:click={goToGuestSignup}
            >
              <UserPlus size={15} />
              Create an account
              <ArrowRight
                size={16}
                class="transition-transform group-hover:translate-x-1"
              />
            </button>
          </div>
        {/if}

        {#if !hasMap || expired}
          <p class="mt-3 text-xs text-contrast-content/50">
            Ask the person who invited you for a fresh invite link to rejoin.
          </p>
        {/if}
      </div>
    {/if}
  </div>
</div>
