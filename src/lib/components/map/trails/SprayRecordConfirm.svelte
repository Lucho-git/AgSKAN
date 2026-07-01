<!-- src/lib/components/map/trails/SprayRecordConfirm.svelte -->
<!--
  Confirmation popup shown after a trail is closed.
  Displays the auto-generated spray records (one per field visited),
  with the operator prefilled from the logged-in user.
  User can change the operator or confirm as-is.
-->
<script>
  import { createEventDispatcher } from "svelte"
  import { trailsApi } from "$lib/api/trailsApi"
  import { toast } from "svelte-sonner"
  import { X, Check, User, Tractor, MapPin, Clock, Ruler, Loader2, ChevronDown, ChevronRight } from "lucide-svelte"

  export let sprayRecords = []
  export let trailId = ""
  export let defaultOperatorName = ""
  export let defaultOperatorId = ""

  const dispatch = createEventDispatcher()

  // Track which field cards are expanded (to show intervals)
  let expandedFields = new Set()

  let selectedOperatorId = defaultOperatorId
  let selectedOperatorName = defaultOperatorName
  let isConfirming = false

  // Format duration seconds → "1h 23m" or "5m 30s"
  function formatDuration(seconds) {
    if (!seconds) return "0s"
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  // Format timestamp → "2:15 PM"
  function formatTime(ts) {
    if (!ts) return ""
    return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  }

  // Format hectares → "6.03 ha"
  function formatHa(ha) {
    if (!ha) return "0 ha"
    return `${parseFloat(ha).toFixed(2)} ha`
  }

  // Format km → "1.89 km"
  function formatKm(km) {
    if (!km) return "0 km"
    return `${parseFloat(km).toFixed(2)} km`
  }

  // Toggle field card expansion
  function toggleFieldExpand(fieldId) {
    if (expandedFields.has(fieldId)) {
      expandedFields.delete(fieldId)
    } else {
      expandedFields.add(fieldId)
    }
    expandedFields = new Set(expandedFields) // trigger reactivity
  }

  // Check if a field has multiple intervals (re-entries)
  function hasMultipleIntervals(record) {
    return (record.intervals?.length || 0) > 1
  }

  // Total area across all fields
  $: totalArea = sprayRecords.reduce(
    (sum, r) => sum + parseFloat(r.area_hectares || 0), 0
  )
  $: totalDistance = sprayRecords.reduce(
    (sum, r) => sum + parseFloat(r.distance_km || 0), 0
  )
  $: vehicleType = sprayRecords[0]?.vehicle_type || "Unknown"

  async function handleConfirm() {
    if (isConfirming) return
    isConfirming = true

    try {
      const result = await trailsApi.confirmSprayRecords(
        trailId,
        selectedOperatorId || undefined,
        selectedOperatorName || undefined,
      )

      if (result.error) {
        throw new Error(result.message || "Failed to confirm")
      }

      toast.success("Spray records confirmed", {
        description: `${sprayRecords.length} field record(s) saved`,
        duration: 3000,
      })

      dispatch("confirmed", { trailId })
    } catch (error) {
      console.error("Error confirming spray records:", error)
      toast.error(`Failed to confirm: ${error.message}`)
      isConfirming = false
    }
  }

  function handleSkip() {
    dispatch("skip", { trailId })
  }
</script>

<div class="modal-overlay" on:click={handleSkip}>
  <div class="spray-modal" on:click|stopPropagation>
    <!-- Header -->
    <div class="spray-modal-header">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Check size={18} class="text-green-400" />
          <h3 class="text-base font-semibold text-white">Trail Complete</h3>
        </div>
        <button
          class="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10 active:bg-white/20"
          on:click={handleSkip}
          aria-label="Close"
        >
          <X size={16} class="text-white/70" />
        </button>
      </div>
      <p class="mt-1 text-xs text-white/50">Confirm the details below</p>
    </div>

    <!-- Body -->
    <div class="spray-modal-body">
      <!-- Operator + Vehicle -->
      <div class="info-section">
        <div class="info-row">
          <div class="info-icon">
            <User size={14} class="text-blue-400" />
          </div>
          <div class="info-content">
            <span class="info-label">Operator</span>
            <input
              type="text"
              class="operator-input"
              bind:value={selectedOperatorName}
              placeholder="Operator name"
            />
          </div>
        </div>

        <div class="info-row">
          <div class="info-icon">
            <Tractor size={14} class="text-purple-400" />
          </div>
          <div class="info-content">
            <span class="info-label">Vehicle</span>
            <span class="info-value">
              {vehicleType.replace(/([A-Z])/g, " $1").trim()}
            </span>
          </div>
        </div>
      </div>

      <!-- Fields covered -->
      <div class="fields-section">
        <div class="fields-header">
          <MapPin size={14} class="text-green-400" />
          <span class="fields-title">
            Fields Covered ({sprayRecords.length})
          </span>
        </div>

        <div class="fields-list">
          {#each sprayRecords as record, i}
            <div class="field-card" class:expandable={hasMultipleIntervals(record)}>
              <div
                class="field-card-header"
                class:clickable={hasMultipleIntervals(record)}
                on:click={() => hasMultipleIntervals(record) && toggleFieldExpand(record.field_id)}
              >
                <span class="field-index">{i + 1}</span>
                <span class="field-name">{record.field_name}</span>
                {#if hasMultipleIntervals(record)}
                  <span class="field-badge">{record.intervals.length} visits</span>
                  <span class="expand-icon">
                    {#if expandedFields.has(record.field_id)}
                      <ChevronDown size={14} class="text-white/50" />
                    {:else}
                      <ChevronRight size={14} class="text-white/50" />
                    {/if}
                  </span>
                {/if}
              </div>
              <div class="field-card-stats">
                <div class="field-stat">
                  <Clock size={11} class="text-white/40" />
                  <span>{formatTime(record.start_time)} – {formatTime(record.end_time)}</span>
                </div>
                <div class="field-stat">
                  <Ruler size={11} class="text-white/40" />
                  <span>{formatKm(record.distance_km)}</span>
                </div>
                <div class="field-stat field-stat-area">
                  {formatHa(record.area_hectares)}
                </div>
              </div>

              <!-- Expandable intervals (shown when field has re-entries) -->
              {#if hasMultipleIntervals(record) && expandedFields.has(record.field_id)}
                <div class="intervals-section">
                  {#each record.intervals as interval, j}
                    <div class="interval-row">
                      <span class="interval-label">Visit {j + 1}</span>
                      <span class="interval-time">
                        {formatTime(interval.entry_time)} – {formatTime(interval.exit_time)}
                      </span>
                      <span class="interval-duration">{formatDuration(interval.duration_seconds)}</span>
                      <span class="interval-distance">{formatKm(interval.distance_km)}</span>
                    </div>
                    {#if j < record.intervals.length - 1}
                      <div class="interval-gap">
                        <span class="gap-label">Exit → Re-entry</span>
                      </div>
                    {/if}
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Totals -->
      <div class="totals-bar">
        <div class="total-item">
          <span class="total-label">Total Distance</span>
          <span class="total-value">{formatKm(totalDistance)}</span>
        </div>
        <div class="total-item">
          <span class="total-label">Total Area</span>
          <span class="total-value total-area">{formatHa(totalArea)}</span>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="spray-modal-footer">
      <button class="modal-btn secondary" on:click={handleSkip} disabled={isConfirming}>
        Skip
      </button>
      <button class="modal-btn primary" on:click={handleConfirm} disabled={isConfirming}>
        {#if isConfirming}
          <Loader2 size={16} class="animate-spin" />
          Confirming...
        {:else}
          <Check size={16} />
          Confirm & Save
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 60;
    animation: fadeIn 0.2s ease-out;
  }

  .spray-modal {
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(20px);
    border-radius: 16px;
    max-width: 440px;
    width: 90%;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
    animation: slideIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    overflow: hidden;
  }

  .spray-modal-header {
    padding: 16px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(22, 163, 74, 0.1) 100%);
  }

  .spray-modal-body {
    padding: 16px 18px;
    overflow-y: auto;
    flex: 1;
  }

  /* Info section (operator + vehicle) */
  .info-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-bottom: 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    margin-bottom: 14px;
  }

  .info-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .info-icon {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
  }

  .info-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }

  .info-label {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .info-value {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.9);
    font-weight: 500;
  }

  .operator-input {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 14px;
    color: white;
    width: 100%;
    outline: none;
    transition: border-color 0.2s;
  }

  .operator-input:focus {
    border-color: rgba(34, 197, 94, 0.5);
  }

  /* Fields section */
  .fields-section {
    margin-bottom: 14px;
  }

  .fields-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  .fields-title {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.8);
  }

  .fields-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field-card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 10px 12px;
  }

  .field-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .field-index {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(34, 197, 94, 0.2);
    color: #4ade80;
    font-size: 11px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .field-name {
    font-size: 13px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
    flex: 1;
  }

  .field-badge {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
    font-weight: 500;
  }

  .expand-icon {
    display: flex;
    align-items: center;
  }

  .field-card-header.clickable {
    cursor: pointer;
  }

  .field-card.expandable {
    border-color: rgba(59, 130, 246, 0.2);
  }

  /* Intervals section (expandable) */
  .intervals-section {
    margin-top: 8px;
    padding: 8px 0 4px 28px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .interval-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: 11px;
  }

  .interval-label {
    color: #60a5fa;
    font-weight: 500;
    min-width: 50px;
  }

  .interval-time {
    color: rgba(255, 255, 255, 0.6);
  }

  .interval-duration {
    color: rgba(255, 255, 255, 0.4);
    margin-left: auto;
  }

  .interval-distance {
    color: rgba(255, 255, 255, 0.4);
    min-width: 50px;
    text-align: right;
  }

  .interval-gap {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0 2px 50px;
  }

  .gap-label {
    font-size: 10px;
    color: rgba(251, 191, 36, 0.6);
    font-style: italic;
  }

  .field-card-stats {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-left: 28px;
  }

  .field-stat {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
  }

  .field-stat-area {
    margin-left: auto;
    font-weight: 600;
    color: #4ade80;
    font-size: 12px;
  }

  /* Totals bar */
  .totals-bar {
    display: flex;
    gap: 12px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .total-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }

  .total-label {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .total-value {
    font-size: 16px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }

  .total-area {
    color: #4ade80;
  }

  /* Footer */
  .spray-modal-footer {
    padding: 14px 18px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }

  .modal-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 18px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .modal-btn.secondary {
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.7);
  }

  .modal-btn.secondary:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .modal-btn.primary {
    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    color: white;
  }

  .modal-btn.primary:hover {
    filter: brightness(1.1);
  }

  .modal-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideIn {
    from { transform: translateY(20px) scale(0.95); opacity: 0; }
    to { transform: translateY(0) scale(1); opacity: 1; }
  }
</style>