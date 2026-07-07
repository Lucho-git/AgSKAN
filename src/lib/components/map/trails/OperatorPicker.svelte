<!-- src/lib/components/map/trails/OperatorPicker.svelte -->
<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte"
  import { operatorApi, type Operator } from "$lib/api/operatorApi"
  import { operatorStore } from "$lib/stores/operatorStore"
  import { toast } from "svelte-sonner"
  import { X, User, UserPlus, Check, Loader2, Route } from "lucide-svelte"

  export let mapId: string
  export let context: "start" | "select" = "start"

  const dispatch = createEventDispatcher()

  let operators: Operator[] = []
  let loading = true
  let saving = false
  let newName = ""
  let mode: "list" | "create" = "list"
  let pendingTakeOp: Operator | null = null

  onMount(async () => {
    loading = true
    operators = await operatorApi.getMapOperators(mapId)
    loading = false
  })

  function autofocus(node: HTMLInputElement) { node.focus(); node.select() }

  async function handleSelect(operatorId: string) {
    saving = true
    const op = await operatorApi.selectOperator(operatorId, mapId)
    saving = false
    if (op) { toast.success(`Operator: ${op.name}`); dispatch("selected", op) }
    else { toast.error("Failed to select operator") }
  }

  async function handleOneTap(op: Operator) {
    if (op.in_use_by) { pendingTakeOp = op; return }
    await handleSelect(op.id)
  }

  function confirmTakeOperator() {
    if (!pendingTakeOp) return
    const op = pendingTakeOp; pendingTakeOp = null; handleSelect(op.id)
  }

  function cancelTakeOperator() { pendingTakeOp = null }

  async function handleCreate() {
    const name = newName.trim()
    if (!name || name.length < 2) { toast.error("Name is too short"); return }
    saving = true
    const op = await operatorApi.createAndSelectOperator(mapId, name)
    saving = false
    if (op) { toast.success(`Operator created: ${op.name}`); dispatch("selected", op) }
    else { toast.error("Failed to create operator") }
  }

  function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return "?"
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
</script>

<div class="op-overlay" on:click|self={() => {}}>
  <div class="op-modal">
    <div class="op-header">
      <div class="op-header-icon"><User size={20} /></div>
      <div class="op-header-text">
        <h3>{context === "start" ? "Select Operator" : "Change Operator"}</h3>
        <p>{context === "start" ? "Choose who is driving for this session" : "Select an operator for this record"}</p>
      </div>
      <button type="button" class="op-close-btn" on:click={() => dispatch("close")} aria-label="Close">
        <X size={16} />
      </button>
    </div>

    <div class="op-body">
      <!-- Current selection box — clickable, not duplicated in the list -->
      {#if $operatorStore?.operator}
        <button type="button" class="op-current-box has-operator"
          on:click={() => dispatch("close")}>
          <div class="op-current-avatar" style="--op-color: {$operatorStore.operator.color}">
            {getInitials($operatorStore.operator.name)}
          </div>
          <div class="op-current-info">
            <span class="op-current-label">Currently selected</span>
            <span class="op-current-name">{$operatorStore.operator.name}</span>
          </div>
          <Check size={16} class="op-current-check" />
        </button>
      {:else}
        <div class="op-current-box">
          <div class="op-current-avatar op-current-avatar-empty"><User size={18} /></div>
          <span class="op-current-empty-text">No operator selected</span>
        </div>
      {/if}

      {#if loading}
        <div class="op-loading"><Loader2 size={24} class="spin" /><span>Loading operators…</span></div>
      {:else if mode === "list"}
        {@const filtered = operators.filter(op => op.id !== $operatorStore?.operator?.id)}
        {#if filtered.length > 0}
          <div class="op-list">
            {#each filtered as op (op.id)}
              <button type="button" class="op-option" class:in-use={op.in_use_by}
                disabled={saving} on:click={() => handleOneTap(op)}>
                <div class="op-avatar" style="--op-color: {op.color}">{getInitials(op.name)}</div>
                <span class="op-name">{op.name}</span>
                {#if op.in_use_by}<span class="op-inuse-label">In use by {op.in_use_by}</span>{/if}
                {#if saving}<Loader2 size={16} class="spin op-check" />{/if}
              </button>
            {/each}
          </div>
        {:else if operators.length === 0}
          <div class="op-empty"><p>No operators on this map yet.</p><p class="op-empty-sub">Create one below to get started.</p></div>
        {/if}
        <button type="button" class="op-create-toggle" on:click={() => (mode = "create")}>
          <UserPlus size={16} /><span>Create new operator</span>
        </button>
      {:else}
        <div class="op-create-form">
          <label for="op-name-input" class="op-label">Operator Name</label>
          <input id="op-name-input" type="text" bind:value={newName} placeholder="e.g. John Smith"
            maxlength="60" use:autofocus on:keydown={(e) => e.key === "Enter" && handleCreate()} />
          <p class="op-hint">This name will be saved to all spray records.</p>
          <div class="op-create-actions">
            {#if operators.length > 0}
              <button type="button" class="op-back-btn" on:click={() => (mode = "list")}>Back</button>
            {/if}
            <button type="button" class="op-confirm-btn"
              disabled={!newName.trim() || saving} on:click={handleCreate}>
              {#if saving}<Loader2 size={16} class="spin" />{/if}
              {#if context === "start"}<Route size={16} />{/if}
              {saving ? "Creating…" : context === "start" ? "Create & Start" : "Create & Select"}
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

{#if pendingTakeOp}
  <div class="op-confirm-overlay" on:click|self={cancelTakeOperator}>
    <div class="op-confirm-dialog">
      <h4>Take operator name?</h4>
      <p><strong>{pendingTakeOp.name}</strong> was last being used by <strong>{pendingTakeOp.in_use_by}</strong>.</p>
      <div class="op-confirm-buttons">
        <button type="button" class="op-confirm-cancel" on:click={cancelTakeOperator}>Cancel</button>
        <button type="button" class="op-confirm-take" disabled={saving} on:click={confirmTakeOperator}>
          {#if saving}<Loader2 size={14} class="spin" />{/if}
          {saving ? "Taking…" : "Take Operator"}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .op-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:1200; display:flex; align-items:center; justify-content:center; padding:16px; animation:fadeIn 0.15s ease-out; }
  .op-modal { background:#1a1a1a; border:1px solid rgba(255,255,255,0.15); border-radius:16px; width:380px; max-width:100%; max-height:85vh; overflow-y:auto; box-shadow:0 16px 48px rgba(0,0,0,0.6); animation:slideUp 0.2s ease-out; }
  .op-header { display:flex; align-items:center; gap:12px; padding:18px 20px 14px; border-bottom:1px solid rgba(255,255,255,0.1); }
  .op-header-icon { width:40px; height:40px; border-radius:10px; background:rgba(96,165,250,0.15); color:#93c5fd; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .op-header-text h3 { margin:0; font-size:17px; font-weight:600; color:#fff; }
  .op-header-text p { margin:2px 0 0; font-size:12px; color:rgba(255,255,255,0.45); }
  .op-close-btn { width:32px; height:32px; border-radius:8px; background:transparent; border:none; color:rgba(255,255,255,0.5); cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.15s ease; flex-shrink:0; margin-left:auto; }
  .op-close-btn:hover { background:rgba(255,255,255,0.1); color:rgba(255,255,255,0.9); }
  .op-body { padding:16px 20px 20px; }

  .op-current-box { display:flex; align-items:center; gap:12px; padding:12px 14px; border-radius:10px; margin-bottom:14px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); width:100%; text-align:left; }
  .op-current-box.has-operator { background:rgba(74,222,128,0.06); border-color:rgba(74,222,128,0.2); cursor:pointer; transition:all 0.15s ease; }
  .op-current-box.has-operator:hover { background:rgba(74,222,128,0.12); border-color:rgba(74,222,128,0.35); }
  .op-current-avatar { width:36px; height:36px; border-radius:50%; background:color-mix(in srgb, var(--op-color, #60a5fa) 25%, transparent); border:2px solid var(--op-color, #60a5fa); display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; color:var(--op-color, #93c5fd); flex-shrink:0; }
  .op-current-avatar-empty { background:rgba(255,255,255,0.06); border-color:rgba(255,255,255,0.15); color:rgba(255,255,255,0.3); }
  .op-current-info { flex:1; min-width:0; display:flex; flex-direction:column; gap:1px; }
  .op-current-label { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:rgba(255,255,255,0.35); }
  .op-current-name { font-size:14px; font-weight:600; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .op-current-check { color:#4ade80; flex-shrink:0; }
  .op-current-empty-text { font-size:14px; color:rgba(255,255,255,0.4); }

  .op-loading { display:flex; flex-direction:column; align-items:center; gap:10px; padding:30px 0; color:rgba(255,255,255,0.5); font-size:13px; }
  .op-loading :global(.spin) { animation:spin 1s linear infinite; }
  .op-list { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; }
  .op-option { display:flex; align-items:center; gap:12px; width:100%; padding:10px 12px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:10px; cursor:pointer; transition:all 0.15s ease; color:rgba(255,255,255,0.85); text-align:left; }
  .op-option:hover { background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.2); }
  .op-option.in-use { border-color:rgba(251,191,36,0.2); }
  .op-option.in-use:hover { border-color:rgba(251,191,36,0.4); }
  .op-avatar { width:34px; height:34px; border-radius:50%; background:color-mix(in srgb, var(--op-color, #60a5fa) 25%, transparent); border:2px solid var(--op-color, #60a5fa); display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; color:var(--op-color, #93c5fd); flex-shrink:0; }
  .op-name { flex:1; font-size:14px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .op-inuse-label { font-size:10px; color:rgba(251,191,36,0.8); font-weight:500; flex-shrink:0; }
  .op-check { color:#60a5fa; flex-shrink:0; }
  .op-empty { text-align:center; padding:24px 0; color:rgba(255,255,255,0.4); }
  .op-empty p { margin:0; font-size:14px; }
  .op-empty-sub { font-size:12px !important; margin-top:4px !important; }
  .op-create-toggle { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; padding:10px; background:transparent; border:1px dashed rgba(255,255,255,0.2); border-radius:10px; color:rgba(255,255,255,0.6); font-size:13px; font-weight:500; cursor:pointer; transition:all 0.15s ease; }
  .op-create-toggle:hover { background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.3); color:rgba(255,255,255,0.85); }
  .op-create-form { display:flex; flex-direction:column; gap:8px; }
  .op-label { font-size:12px; font-weight:600; color:rgba(255,255,255,0.6); text-transform:uppercase; letter-spacing:0.05em; }
  .op-create-form input { width:100%; padding:12px 14px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); border-radius:10px; color:#fff; font-size:15px; outline:none; transition:border-color 0.15s ease; }
  .op-create-form input:focus { border-color:rgba(96,165,250,0.5); }
  .op-create-form input::placeholder { color:rgba(255,255,255,0.3); }
  .op-hint { margin:0; font-size:11px; color:rgba(255,255,255,0.35); }
  .op-create-actions { display:flex; gap:8px; margin-top:6px; }
  .op-back-btn { padding:12px 18px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); border-radius:10px; color:rgba(255,255,255,0.7); font-size:14px; font-weight:500; cursor:pointer; transition:all 0.15s ease; }
  .op-back-btn:hover { background:rgba(255,255,255,0.12); }
  .op-confirm-btn { display:flex; align-items:center; justify-content:center; gap:8px; padding:12px 22px; background:rgba(96,165,250,0.2); border:1px solid rgba(96,165,250,0.4); border-radius:10px; color:#93c5fd; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.15s ease; }
  .op-confirm-btn:hover:not(:disabled) { background:rgba(96,165,250,0.3); border-color:rgba(96,165,250,0.5); }
  .op-confirm-btn:disabled { opacity:0.4; cursor:not-allowed; }
  .op-confirm-btn :global(.spin) { animation:spin 1s linear infinite; }
  .op-confirm-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:1300; display:flex; align-items:center; justify-content:center; padding:16px; animation:fadeIn 0.15s ease-out; }
  .op-confirm-dialog { background:#1a1a1a; border:1px solid rgba(251,191,36,0.3); border-radius:14px; width:340px; max-width:100%; padding:20px; box-shadow:0 16px 48px rgba(0,0,0,0.6); animation:slideUp 0.2s ease-out; }
  .op-confirm-icon { width:40px; height:40px; border-radius:10px; background:rgba(251,191,36,0.15); color:#fbbf24; display:flex; align-items:center; justify-content:center; margin-bottom:14px; }
  .op-confirm-dialog h4 { margin:0 0 8px; font-size:16px; font-weight:600; color:#fff; }
  .op-confirm-dialog p { margin:0 0 18px; font-size:13px; line-height:1.5; color:rgba(255,255,255,0.6); }
  .op-confirm-dialog p strong { color:rgba(255,255,255,0.9); }
  .op-confirm-buttons { display:flex; gap:8px; }
  .op-confirm-cancel { flex:1; padding:10px 16px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); border-radius:10px; color:rgba(255,255,255,0.7); font-size:14px; font-weight:500; cursor:pointer; transition:all 0.15s ease; }
  .op-confirm-cancel:hover { background:rgba(255,255,255,0.12); }
  .op-confirm-take { flex:1; display:flex; align-items:center; justify-content:center; gap:6px; padding:10px 16px; background:rgba(251,191,36,0.2); border:1px solid rgba(251,191,36,0.4); border-radius:10px; color:#fbbf24; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.15s ease; }
  .op-confirm-take:hover:not(:disabled) { background:rgba(251,191,36,0.3); }
  .op-confirm-take:disabled { opacity:0.5; cursor:not-allowed; }

  @keyframes fadeIn { from{opacity:0} to{opacity:1} }
  @keyframes slideUp { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
  @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
</style>
