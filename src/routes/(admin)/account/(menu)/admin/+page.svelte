<script lang="ts">
  import { onMount } from "svelte"
  import Icon from "@iconify/svelte"
  import { toast } from "svelte-sonner"
  import { adminApi, type AdminMapEntry } from "$lib/api/adminApi"
  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { goto } from "$app/navigation"

  let loading = false
  let entries: AdminMapEntry[] = []
  let errorMessage = ""
  let expandedMapId: string | null = null
  let searchQuery = ""
  let filterStatus: "all" | "exceeding" | "at_limit" | "ok" = "all"
  let filterPlan: "all" | "paid" | "free" = "all"
  let lastRefreshed: Date | null = null

  // Guard: redirect if not dev mode
  $: if (!$userSettingsStore.devToolsEnabled) {
    goto("/account")
  }

  // Filtered & searched entries
  $: filteredEntries = entries
    .filter((e) => {
      if (filterStatus === "exceeding") return e.seat_status === "EXCEEDING"
      if (filterStatus === "at_limit") return e.seat_status === "AT_LIMIT"
      if (filterStatus === "ok") return e.seat_status === "OK"
      return true
    })
    .filter((e) => {
      if (filterPlan === "free") return e.subscription === "FREE" || e.subscription_status === "free"
      if (filterPlan === "paid") return e.subscription !== "FREE" && e.subscription_status !== "free"
      return true
    })
    .filter((e) => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return (
        (e.owner_name || "").toLowerCase().includes(q) ||
        (e.owner_email || "").toLowerCase().includes(q) ||
        (e.company_name || "").toLowerCase().includes(q) ||
        (e.map_name || "").toLowerCase().includes(q)
      )
    })

  // Stats
  $: totalMaps = entries.length
  $: totalUsers = entries.reduce((sum, e) => sum + e.total_members, 0)
  $: exceedingCount = entries.filter(
    (e) => e.seat_status === "EXCEEDING",
  ).length
  $: activeToday = entries.filter((e) => e.vehicles_active_24h > 0).length
  $: proCount = entries.filter(
    (e) => e.subscription !== "FREE" && e.subscription_status !== "free",
  ).length
  $: freeCount = entries.filter(
    (e) => e.subscription === "FREE" || e.subscription_status === "free",
  ).length
  $: paidSeats = entries
    .filter((e) => e.subscription !== "FREE" && e.subscription_status !== "free")
    .reduce((sum, e) => sum + e.allowed_seats, 0)
  $: headlessCount = entries.filter((e) => !e.owner_connected).length

  async function loadData() {
    loading = true
    errorMessage = ""
    const result = await adminApi.fetchDashboardData()
    if (result.success) {
      entries = result.data
      lastRefreshed = new Date()
    } else {
      errorMessage = result.error || "Failed to load data"
      toast.error(errorMessage)
    }
    loading = false
  }

  function toggleExpand(mapId: string) {
    expandedMapId = expandedMapId === mapId ? null : mapId
  }

  function timeAgo(dateStr: string | null): string {
    if (!dateStr) return "Never"
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "Just now"
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 30) return `${days}d ago`
    const months = Math.floor(days / 30)
    return `${months}mo ago`
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "—"
    return new Date(dateStr).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }

  function seatStatusBadge(status: string): string {
    if (status === "EXCEEDING") return "badge-error"
    if (status === "AT_LIMIT") return "badge-warning"
    return "badge-success"
  }

  function seatStatusLabel(status: string): string {
    if (status === "EXCEEDING") return "Exceeding"
    if (status === "AT_LIMIT") return "At Limit"
    return "OK"
  }

  function subBadge(sub: string): string {
    if (sub === "FREE") return "badge-ghost"
    return "badge-primary"
  }

  // Load on mount
  onMount(() => {
    loadData()
  })

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      toast.success("Copied to clipboard")
    }).catch(() => {
      toast.error("Failed to copy")
    })
  }
</script>

<svelte:head>
  <title>Admin Dashboard</title>
</svelte:head>

<!-- Header -->
<div
  class="flex items-center justify-between border-b border-base-300 bg-base-100 p-5"
>
  <h2
    class="flex items-center gap-2 text-xl font-semibold text-contrast-content"
  >
    <div class="rounded-lg bg-warning/20 p-1.5">
      <Icon
        icon="solar:shield-keyhole-bold-duotone"
        width="18"
        height="18"
        class="text-warning"
      />
    </div>
    Admin Dashboard
  </h2>
  <button
    class="btn btn-sm btn-outline gap-1"
    on:click={loadData}
    disabled={loading}
  >
    <Icon
      icon="solar:refresh-bold-duotone"
      width="16"
      height="16"
      class={loading ? "animate-spin" : ""}
    />
    Refresh
  </button>
</div>

<div class="space-y-6 p-6">
  {#if loading && entries.length === 0}
    <!-- Loading skeleton -->
    <div class="flex items-center justify-center py-20">
      <div class="text-center">
        <span class="loading loading-spinner loading-lg text-warning"></span>
        <p class="mt-3 text-sm text-contrast-content/60">
          Loading admin data...
        </p>
      </div>
    </div>
  {:else if errorMessage && entries.length === 0}
    <!-- Error state -->
    <div class="rounded-lg border border-error/20 bg-error/5 p-8 text-center">
      <Icon
        icon="solar:danger-triangle-bold-duotone"
        width="40"
        height="40"
        class="mx-auto text-error"
      />
      <p class="mt-3 font-medium text-error">{errorMessage}</p>
      <button class="btn btn-outline btn-sm mt-4" on:click={loadData}>
        Try Again
      </button>
    </div>
  {:else}
    <!-- Summary Stats -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-3">
        <p class="text-xs text-contrast-content/60">Total Maps</p>
        <p class="text-2xl font-bold text-contrast-content">{totalMaps}</p>
      </div>
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-3">
        <p class="text-xs text-contrast-content/60">Total Users</p>
        <p class="text-2xl font-bold text-contrast-content">{totalUsers}</p>
      </div>
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-3">
        <p class="text-xs text-contrast-content/60">Active Today</p>
        <p class="text-2xl font-bold text-success">{activeToday}</p>
      </div>
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-3">
        <p class="text-xs text-contrast-content/60">Exceeding</p>
        <p class="text-2xl font-bold text-error">{exceedingCount}</p>
      </div>
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-3">
        <p class="text-xs text-contrast-content/60">Pro Plans</p>
        <p class="text-2xl font-bold text-primary">{proCount}</p>
      </div>
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-3">
        <p class="text-xs text-contrast-content/60">Paid Seats</p>
        <p class="text-2xl font-bold text-primary">{paidSeats}</p>
      </div>
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-3">
        <p class="text-xs text-contrast-content/60">Free Plans</p>
        <p class="text-2xl font-bold text-contrast-content/60">{freeCount}</p>
      </div>
      <div class="rounded-lg border border-base-300 bg-base-200/30 p-3">
        <p class="text-xs text-contrast-content/60">Headless</p>
        <p class="text-2xl font-bold text-info">{headlessCount}</p>
      </div>
    </div>

    <!-- Search & Filter Bar -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div class="relative flex-1">
        <Icon
          icon="solar:magnifer-bold-duotone"
          width="16"
          height="16"
          class="absolute left-3 top-1/2 -translate-y-1/2 text-contrast-content/40"
        />
        <input
          type="text"
          placeholder="Search by name, email, company, or map..."
          class="input input-bordered input-sm w-full pl-9"
          bind:value={searchQuery}
        />
      </div>
      <div class="flex items-center gap-2">
        <!-- Plan filter -->
        <div class="flex gap-0.5 rounded-lg bg-base-200/50 p-0.5">
          <button
            class="btn btn-xs {filterPlan === 'all' ? 'btn-neutral' : 'btn-ghost'}"
            on:click={() => (filterPlan = "all")}
          >All</button>
          <button
            class="btn btn-xs {filterPlan === 'paid' ? 'btn-neutral' : 'btn-ghost'}"
            on:click={() => (filterPlan = "paid")}
          >Paid</button>
          <button
            class="btn btn-xs {filterPlan === 'free' ? 'btn-neutral' : 'btn-ghost'}"
            on:click={() => (filterPlan = "free")}
          >Free</button>
        </div>
        <div class="h-4 w-px bg-base-300"></div>
        <!-- Status filter -->
        <div class="flex gap-1">
          <button
            class="btn btn-xs {filterStatus === 'all' ? 'btn-neutral' : 'btn-ghost'}"
            on:click={() => (filterStatus = "all")}
          >
            All
          </button>
          <button
            class="btn btn-xs {filterStatus === 'exceeding' ? 'btn-error' : 'btn-ghost'}"
            on:click={() => (filterStatus = "exceeding")}
          >
            Exceeding
          </button>
          <button
            class="btn btn-xs {filterStatus === 'at_limit' ? 'btn-warning' : 'btn-ghost'}"
            on:click={() => (filterStatus = "at_limit")}
          >
            At Limit
          </button>
          <button
            class="btn btn-xs {filterStatus === 'ok' ? 'btn-success' : 'btn-ghost'}"
            on:click={() => (filterStatus = "ok")}
          >
            OK
          </button>
        </div>
      </div>
    </div>

    <!-- Results count -->
    <div class="flex items-center justify-between text-xs text-contrast-content/50">
      <span>{filteredEntries.length} of {totalMaps} maps</span>
      {#if lastRefreshed}
        <span>Last refreshed: {lastRefreshed.toLocaleTimeString()}</span>
      {/if}
    </div>

    <!-- Table -->
    <div class="overflow-x-auto rounded-lg border border-base-300">
      <table class="table w-full text-xs">
        <thead>
          <tr class="border-b-2 border-base-300 bg-base-200/60 text-contrast-content/60">
            <th class="w-8 border-r border-base-300"></th>
            <th class="border-r border-base-300">Owner</th>
            <th class="border-r border-base-300">Map</th>
            <th class="border-r border-base-300">Plan</th>
            <th class="text-center border-r border-base-300">Users</th>
            <th class="text-center border-r border-base-300">Active 24h</th>
            <th class="border-r border-base-300">Last GPS</th>
            <th class="border-r border-base-300">Last Sign-In</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredEntries as entry, i (entry.master_map_id)}
            <tr
              class="cursor-pointer transition-colors hover:bg-base-content/5 border-b border-base-300
                {entry.seat_status === 'EXCEEDING' ? 'bg-error/5' : ''}
                {entry.seat_status === 'AT_LIMIT' ? 'bg-warning/5' : ''}"
              on:click={() => toggleExpand(entry.master_map_id)}
            >
              <td class="w-8 border-r border-base-300">
                <Icon
                  icon={expandedMapId === entry.master_map_id
                    ? "solar:alt-arrow-down-bold"
                    : "solar:alt-arrow-right-bold"}
                  width="12"
                  height="12"
                  class="text-contrast-content/40"
                />
              </td>
              <td class="border-r border-base-300">
                <div class="font-medium text-contrast-content">
                  {entry.owner_name || "Unknown"}
                </div>
                <div class="text-contrast-content/50">
                  {entry.owner_email || "—"}
                </div>
                {#if entry.owner_phone}
                  <div class="text-contrast-content/40">{entry.owner_phone}</div>
                {/if}
              </td>
              <td class="border-r border-base-300">
                <div class="text-contrast-content">{entry.map_name || "Unnamed"}</div>
                {#if entry.company_name}
                  <div class="text-contrast-content/50">{entry.company_name}</div>
                {/if}
              </td>
              <td class="border-r border-base-300">
                <span class="badge badge-xs {subBadge(entry.subscription)}">
                  {entry.subscription}
                </span>
                {#if entry.founder}
                  <span class="badge badge-xs badge-secondary ml-0.5">F</span>
                {/if}
                {#if !entry.owner_connected}
                  <span class="badge badge-xs badge-info ml-0.5">Headless</span>
                {/if}
              </td>
              <td class="text-center border-r border-base-300">
                <span
                  class="font-semibold"
                  class:text-error={entry.seat_status === "EXCEEDING"}
                  class:text-warning={entry.seat_status === "AT_LIMIT"}
                >
                  {entry.connected_vehicles}/{entry.allowed_seats}
                </span>
              </td>
              <td class="text-center border-r border-base-300">
                <span class="text-contrast-content/70">
                  {entry.vehicles_active_24h}
                </span>
              </td>
              <td class="border-r border-base-300">
                <span class="text-contrast-content/70">
                  {timeAgo(entry.latest_vehicle_update)}
                </span>
              </td>
              <td class="border-r border-base-300">
                <span class="text-contrast-content/70">
                  {timeAgo(entry.latest_member_sign_in)}
                </span>
              </td>
              <td>
                <span class="badge badge-xs {seatStatusBadge(entry.seat_status)}">
                  {seatStatusLabel(entry.seat_status)}
                </span>
              </td>
            </tr>

            <!-- Expanded detail row -->
            {#if expandedMapId === entry.master_map_id}
              <tr>
                <td colspan="9" class="bg-base-200/10 p-0">
                  <div class="px-4 pb-4 pt-3">
                    <!-- Map ID row -->
                    <div class="mb-3 flex items-center gap-2 rounded bg-base-200/40 px-3 py-1.5">
                      <span class="text-xs font-medium text-contrast-content/50">Map ID:</span>
                      <code class="flex-1 select-all truncate font-mono text-xs text-contrast-content/70">
                        {entry.master_map_id}
                      </code>
                      <button
                        class="btn btn-ghost btn-xs"
                        on:click|stopPropagation={() => copyToClipboard(entry.master_map_id)}
                        title="Copy Map ID"
                      >
                        <Icon icon="solar:copy-bold-duotone" width="14" height="14" />
                      </button>
                    </div>

                    <!-- Detail grid -->
                    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <!-- Owner Card -->
                      <div class="rounded-lg bg-base-200/30 p-3">
                        <h4 class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-contrast-content/50">
                          <Icon icon="solar:user-bold-duotone" width="12" height="12" />
                          Owner
                        </h4>
                        <p class="text-sm font-medium text-contrast-content">{entry.owner_name || "—"}</p>
                        <p class="text-xs text-contrast-content/60">{entry.owner_email || "—"}</p>
                        {#if entry.owner_phone}
                          <p class="text-xs text-contrast-content/50">{entry.owner_phone}</p>
                        {/if}
                        {#if entry.company_name}
                          <p class="text-xs text-contrast-content/50">{entry.company_name}</p>
                        {/if}
                        <div class="mt-2 space-y-0.5 text-xs text-contrast-content/50">
                          <p>Last sign-in: {timeAgo(entry.owner_last_sign_in)}</p>
                          <p>Joined: {formatDate(entry.owner_created_at)}</p>
                        </div>
                      </div>

                      <!-- Map & Subscription Card -->
                      <div class="rounded-lg bg-base-200/30 p-3">
                        <h4 class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-contrast-content/50">
                          <Icon icon="solar:map-bold-duotone" width="12" height="12" />
                          Map & Plan
                        </h4>
                        <p class="text-sm font-medium text-contrast-content">{entry.map_name || "Unnamed"}</p>
                        <p class="text-xs text-contrast-content/50">Created: {formatDate(entry.map_created_at)}</p>
                        <div class="mt-2 flex flex-wrap items-center gap-1">
                          <span class="badge badge-sm {subBadge(entry.subscription)}">{entry.subscription}</span>
                          <span class="badge badge-outline badge-sm">{entry.subscription_status}</span>
                          {#if entry.payment_interval}
                            <span class="badge badge-ghost badge-sm">{entry.payment_interval}</span>
                          {/if}
                          {#if entry.founder}
                            <span class="badge badge-secondary badge-sm">Founder</span>
                          {/if}
                        </div>
                        {#if entry.next_billing_date}
                          <p class="mt-1 text-xs text-contrast-content/50">Next billing: {formatDate(entry.next_billing_date)}</p>
                        {/if}
                      </div>

                      <!-- Activity Card -->
                      <div class="rounded-lg bg-base-200/30 p-3">
                        <h4 class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-contrast-content/50">
                          <Icon icon="solar:chart-bold-duotone" width="12" height="12" />
                          Activity
                        </h4>
                        <div class="space-y-1 text-xs">
                          <div class="flex justify-between">
                            <span class="text-contrast-content/60">Vehicles (24h / 7d / 30d)</span>
                            <span class="font-medium text-contrast-content">
                              {entry.vehicles_active_24h} / {entry.vehicles_active_7d} / {entry.vehicles_active_30d}
                            </span>
                          </div>
                          <div class="flex justify-between">
                            <span class="text-contrast-content/60">Members (7d / 30d)</span>
                            <span class="font-medium text-contrast-content">
                              {entry.members_active_7d} / {entry.members_active_30d}
                            </span>
                          </div>
                          <div class="flex justify-between">
                            <span class="text-contrast-content/60">Last GPS update</span>
                            <span class="text-contrast-content">{timeAgo(entry.latest_vehicle_update)}</span>
                          </div>
                          <div class="flex justify-between">
                            <span class="text-contrast-content/60">Last sign-in</span>
                            <span class="text-contrast-content">{timeAgo(entry.latest_member_sign_in)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Seat usage bar -->
                    <div class="mt-3">
                      <div class="mb-1 flex items-center justify-between text-xs">
                        <span class="text-contrast-content/60">
                          Seat Usage: {entry.connected_vehicles} / {entry.allowed_seats}
                          {#if entry.seats_over_limit > 0}
                            <span class="text-error">(+{entry.seats_over_limit} over)</span>
                          {/if}
                        </span>
                        <span class="badge badge-xs {seatStatusBadge(entry.seat_status)}">
                          {seatStatusLabel(entry.seat_status)}
                        </span>
                      </div>
                      <div class="h-2 w-full overflow-hidden rounded-full bg-base-300">
                        <div
                          class="h-full rounded-full transition-all {entry.seat_status === 'EXCEEDING'
                            ? 'bg-error'
                            : entry.seat_status === 'AT_LIMIT'
                              ? 'bg-warning'
                              : 'bg-success'}"
                          style="width: {Math.min(
                            (entry.connected_vehicles / Math.max(entry.allowed_seats, 1)) * 100,
                            100,
                          )}%"
                        ></div>
                      </div>
                    </div>

                    <!-- Members list -->
                    {#if entry.members && entry.members.length > 0}
                      <div class="mt-4">
                        <h4 class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-contrast-content/50">
                          <Icon icon="solar:users-group-rounded-bold-duotone" width="12" height="12" />
                          Connected Members ({entry.members.length})
                        </h4>
                        <div class="overflow-x-auto rounded border border-base-300">
                          <table class="table-compact table w-full text-xs">
                            <thead>
                              <tr class="bg-base-200/30 text-contrast-content/50">
                                <th>Name</th>
                                <th>Email</th>
                                <th>Last Sign-In</th>
                                <th>Last Location</th>
                                <th>Role</th>
                              </tr>
                            </thead>
                            <tbody>
                              {#each entry.members as member}
                                <tr>
                                  <td class="text-contrast-content">{member.full_name || "—"}</td>
                                  <td class="text-contrast-content/60">{member.email || "—"}</td>
                                  <td class="text-contrast-content/60">{timeAgo(member.last_sign_in)}</td>
                                  <td class="text-contrast-content/60">{timeAgo(member.last_location_update)}</td>
                                  <td>
                                    {#if member.is_owner}
                                      <span class="badge badge-primary badge-xs">Owner</span>
                                    {:else}
                                      <span class="badge badge-ghost badge-xs">Member</span>
                                    {/if}
                                  </td>
                                </tr>
                              {/each}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    {:else}
                      <p class="mt-3 text-xs text-contrast-content/40">
                        No members connected to this map.
                      </p>
                    {/if}
                  </div>
                </td>
              </tr>
            {/if}
          {:else}
            <tr>
              <td colspan="9" class="py-8 text-center text-sm text-contrast-content/50">
                No maps match your search criteria.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
