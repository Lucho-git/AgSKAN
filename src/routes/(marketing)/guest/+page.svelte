<!-- src/routes/(marketing)/guest/+page.svelte -->
<script lang="ts">
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"
  import { Loader2, Users, ArrowRight } from "lucide-svelte"
  import { supabase } from "$lib/stores/sessionStore"
  import SVGComponents from "$lib/vehicles/index.js"

  const COLORS = [
    { key: "Red", value: "#ff0000" },
    { key: "Blue", value: "#0000ff" },
    { key: "Green", value: "#008000" },
    { key: "Yellow", value: "#ffff00" },
    { key: "Orange", value: "#ffa500" },
    { key: "Purple", value: "#800080" },
    { key: "SkyBlue", value: "#87ceeb" },
    { key: "LightGreen", value: "#90ee90" },
    { key: "HotPink", value: "#ff69b4" },
  ]

  const REASON_LABELS: Record<string, string> = {
    not_found: "This invite link isn't valid.",
    revoked: "This invite link has been switched off by the map owner.",
    expired: "This invite link has expired.",
    used_up: "This invite link has already been used.",
    missing: "This link is missing its invite code.",
  }

  let step:
    | "loading"
    | "invalid"
    | "ready"
    | "joining"
    | "rejoin"
    | "account"
    | "details"
    | "saving"
    | "done"
    | "error" = "loading"
  let token = ""
  let mapName = ""
  let mapId: string | null = null
  let reason = ""
  let errorMessage = ""
  let guestName = ""
  let guestColor = "Yellow"

  onMount(async () => {
    const params = new URLSearchParams(window.location.search)
    token = params.get("invite") || params.get("token") || ""
    if (!token) {
      reason = "missing"
      step = "invalid"
      return
    }

    try {
      const { data, error } = await supabase.rpc("get_map_invite_preview", {
        p_token: token,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      if (!row?.valid) {
        reason = row?.reason || "not_found"
        step = "invalid"
        return
      }
      mapName = row.map_name || "the map"
      mapId = row.map_id || null
      // Cache the map name for the guest home page.
      try {
        if (row.map_name) localStorage.setItem("guest_map_name", row.map_name)
      } catch {
        /* storage unavailable */
      }
      step = "ready"

      // Returning visitor? Anonymous sessions persist in this browser — if
      // this session already has access to THIS map, rejoin it directly
      // (same account, no repeat log entry, no extra use of the invite).
      await tryRejoin()
    } catch (e: any) {
      errorMessage = e?.message || "Could not check this invite."
      step = "error"
    }
  })

  async function tryRejoin() {
    if (!mapId) return
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) return

      const { data: profile } = await supabase
        .from("profiles")
        .select("map_role, master_map_id, full_name, access_expires_at, role")
        .eq("id", uid)
        .single()
      if (!profile || !profile.master_map_id || profile.master_map_id !== mapId)
        return

      // Full accounts always keep access — only anonymous viewers have a
      // guest window.
      const isAccount = !!profile.role && profile.role !== "viewer"
      const accessOk =
        !profile.access_expires_at ||
        new Date(profile.access_expires_at).getTime() > Date.now()
      const isMember = profile.map_role === "member" || isAccount
      const isActiveViewer =
        profile.map_role === "viewer" && !isAccount && accessOk
      if (!isMember && !isActiveViewer) return

      if (profile.full_name) {
        guestName = profile.full_name
        step = "rejoin"
        setTimeout(() => goto("/account/mapviewer"), 1200)
      } else {
        // Access is valid but they never picked a name — let them finish setup.
        step = "details"
      }
    } catch (e) {
      console.warn("Guest rejoin check skipped:", e)
    }
  }

  async function join() {
    step = "joining"
    errorMessage = ""
    try {
      // Instant access: anonymous session — no email, no password, no signup.
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        const { error } = await supabase.auth.signInAnonymously()
        if (error) throw error
      }

      const { data, error } = await supabase.rpc("redeem_map_invite", {
        p_token: token,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      if (!row) throw new Error("The invite could not be redeemed.")

      mapId = row.map_id
      mapName = row.map_name || mapName

      // Guest links never apply to signed-in accounts — the server left
      // their profile untouched (guest_applied = false). Show them a
      // "you're already signed in" step instead of the guest details form.
      if (row.guest_applied === false) {
        step = "account"
        return
      }

      // Members who happen to open a guest link skip the guest details step.
      const {
        data: { session: current },
      } = await supabase.auth.getSession()
      const uid = current?.user?.id
      if (uid) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("map_role, role")
          .eq("id", uid)
          .single()
        const isAccount = !!profile?.role && profile.role !== "viewer"
        if (isAccount || (profile?.map_role && profile.map_role !== "viewer")) {
          step = "done"
          goto("/account/mapviewer")
          return
        }
      }

      step = "details"
    } catch (e: any) {
      errorMessage = e?.message || "Something went wrong joining the map."
      step = "error"
    }
  }

  async function enterMap() {
    step = "saving"
    errorMessage = ""
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid)
        throw new Error("Your session was lost — please open the invite link again.")

      const fullName = guestName.trim() || "Visitor"

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          role: "viewer",
          onboarded: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", uid)
      if (profileError) throw profileError

      const { error: vehicleError } = await supabase
        .from("vehicle_state")
        .upsert(
          {
            vehicle_id: uid,
            master_map_id: mapId,
            vehicle_marker: {
              type: "Pointer",
              bodyColor: guestColor,
              swath: 4,
              size: 45,
            },
            last_update: new Date().toISOString(),
            is_trailing: false,
          },
          { onConflict: "vehicle_id" },
        )
      if (vehicleError) throw vehicleError

      // Give the join log entry their chosen name ("Visitor Kim joined the
      // map") — best effort, never block the join on logging.
      const { error: finalizeError } = await supabase.rpc(
        "finalize_guest_join",
        { p_display_name: fullName },
      )
      if (finalizeError) {
        console.warn("finalize_guest_join skipped:", finalizeError.message)
      }

      step = "done"
      setTimeout(() => goto("/account/mapviewer"), 800)
    } catch (e: any) {
      errorMessage = e?.message || "Could not finish setting up your access."
      step = "error"
    }
  }
</script>

<svelte:head>
  <title>Join map — AgSKAN</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div
  class="flex min-h-[70vh] items-center justify-center px-4 py-10"
>
  <div
    class="w-full max-w-md rounded-2xl border border-base-300 bg-base-100 p-6 shadow-xl sm:p-8"
  >
    {#if step === "loading"}
      <div class="flex flex-col items-center gap-3 py-8 text-base-content/60">
        <Loader2 size={24} class="animate-spin" />
        <p class="text-sm">Checking your invite…</p>
      </div>
    {:else if step === "invalid"}
      <div class="flex flex-col items-center gap-2 py-6 text-center">
        <div
          class="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-error/10"
        >
          <Users size={22} class="text-error" />
        </div>
        <h1 class="text-lg font-semibold text-base-content">Invite unavailable</h1>
        <p class="text-sm text-base-content/60">
          {REASON_LABELS[reason] || "This invite link can't be used."}
        </p>
        <p class="mt-1 text-xs text-base-content/50">
          Ask the person who invited you for a fresh link.
        </p>
      </div>
    {:else if step === "ready" || step === "joining"}
      <div class="flex flex-col items-center gap-2 text-center">
        <div
          class="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10"
        >
          <Users size={26} class="text-primary" />
        </div>
        <h1 class="text-xl font-bold text-base-content">
          You're invited to<br />{mapName}
        </h1>
        <p class="mt-1 text-sm text-base-content/60">
          Take a look at the map — no account needed. Guest access is
          view-only and lasts a limited time.
        </p>
        <button
          class="btn btn-primary mt-5 w-full"
          on:click={join}
          disabled={step === "joining"}
        >
          {#if step === "joining"}
            <Loader2 size={16} class="animate-spin" /> Joining…
          {:else}
            Join the map <ArrowRight size={16} />
          {/if}
        </button>
      </div>
    {:else if step === "rejoin"}
      <div class="flex flex-col items-center gap-3 py-2 text-center">
        <div
          class="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10"
        >
          <Users size={26} class="text-primary" />
        </div>
        <h1 class="text-xl font-bold text-base-content">
          Welcome back{guestName ? `, ${guestName}` : ""}
        </h1>
        <p class="text-sm text-base-content/60">
          Rejoining {mapName} with your guest access…
        </p>
        <Loader2 size={18} class="animate-spin text-base-content/50" />
        <button
          class="btn btn-primary mt-3 w-full"
          on:click={() => goto("/account/mapviewer")}
        >
          Go to the map <ArrowRight size={16} />
        </button>
      </div>
    {:else if step === "account"}
      <div class="flex flex-col items-center gap-2 text-center">
        <div
          class="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15"
        >
          <Users size={26} class="text-amber-500" />
        </div>
        <h1 class="text-xl font-bold text-base-content">
          You're already signed in
        </h1>
        <p class="mt-1 text-sm text-base-content/60">
          This invite is a guest link — it doesn't change your account or your
          map. Open your app to keep working.
        </p>
        <button
          class="btn btn-primary mt-5 w-full"
          on:click={() => goto("/account")}
        >
          Open the app <ArrowRight size={16} />
        </button>
      </div>
    {:else if step === "details" || step === "saving" || step === "done"}
      <div class="flex flex-col items-center gap-2 text-center">
        <h1 class="text-xl font-bold text-base-content">You're in</h1>
        <p class="text-sm text-base-content/60">
          How should you appear on {mapName}?
        </p>

        <div class="mt-4 w-full text-left">
          <label
            class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-base-content/50"
            for="guest-name">Your name</label
          >
          <input
            id="guest-name"
            type="text"
            bind:value={guestName}
            placeholder="Visitor"
            maxlength="30"
            class="input input-bordered w-full"
          />
        </div>

        <div class="mt-4 w-full text-left">
          <span
            class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-base-content/50"
            >Icon colour</span
          >
          <div class="flex flex-wrap items-center gap-2">
            <div
              class="mr-1 flex h-10 w-10 items-center justify-center rounded-lg bg-base-200"
            >
              {#if SVGComponents.Pointer}
                <svelte:component
                  this={SVGComponents.Pointer}
                  bodyColor={guestColor}
                  size="28px"
                />
              {/if}
            </div>
            {#each COLORS as color (color.key)}
              <button
                class="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 {guestColor ===
                color.key
                  ? 'border-base-content'
                  : 'border-transparent'}"
                style="background-color: {color.value};"
                title={color.key}
                aria-label="Use {color.key}"
                on:click={() => (guestColor = color.key)}
              ></button>
            {/each}
          </div>
        </div>

        <button
          class="btn btn-primary mt-5 w-full"
          on:click={enterMap}
          disabled={step === "saving" || step === "done"}
        >
          {#if step === "saving" || step === "done"}
            <Loader2 size={16} class="animate-spin" />
            Taking you to the map…
          {:else}
            View the map <ArrowRight size={16} />
          {/if}
        </button>
      </div>
    {:else if step === "error"}
      <div class="flex flex-col items-center gap-2 py-6 text-center">
        <h1 class="text-lg font-semibold text-base-content">Something went wrong</h1>
        <p class="text-sm text-base-content/60">{errorMessage}</p>
        {#if token}
          <button class="btn btn-outline mt-4" on:click={join}>Try again</button>
        {/if}
      </div>
    {/if}
  </div>
</div>
