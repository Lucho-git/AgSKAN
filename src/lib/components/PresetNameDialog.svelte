<!-- src/lib/components/PresetNameDialog.svelte -->
<script>
  import { createEventDispatcher } from "svelte"
  import { Check, X } from "lucide-svelte"

  export let isOpen = false

  const dispatch = createEventDispatcher()

  let presetName = ""
  const MAX_LENGTH = 10

  // 🆕 FIXED: Handle input to enforce character limit
  function handleInput(event) {
    if (event.target.value.length > MAX_LENGTH) {
      presetName = event.target.value.slice(0, MAX_LENGTH)
      event.target.value = presetName
    } else {
      presetName = event.target.value
    }
  }

  function handleSave() {
    const trimmedName = presetName.trim()
    if (trimmedName && trimmedName.length <= MAX_LENGTH) {
      dispatch("save", { name: trimmedName })
      presetName = ""
    }
  }

  function handleCancel() {
    dispatch("cancel")
    presetName = ""
  }

  function handleKeydown(event) {
    if (event.key === "Enter") {
      handleSave()
    } else if (event.key === "Escape") {
      handleCancel()
    }
  }

  $: remainingChars = MAX_LENGTH - presetName.length
  $: isAtLimit = presetName.length >= MAX_LENGTH
</script>

{#if isOpen}
  <div class="dialog-overlay" on:click={handleCancel}>
    <div class="dialog-content" on:click|stopPropagation>
      <h3 class="dialog-title">Save Vehicle Preset</h3>
      <p class="dialog-description">
        Give your vehicle configuration a memorable name (max {MAX_LENGTH} characters)
      </p>

      <div class="input-wrapper">
        <input
          type="text"
          value={presetName}
          on:input={handleInput}
          placeholder="e.g., Header 12m, Seeder Red..."
          on:keydown={handleKeydown}
          autofocus
          class="preset-input"
        />
        <div class="char-counter" class:warning={isAtLimit}>
          {remainingChars} left
        </div>
      </div>

      <div class="dialog-actions">
        <button class="dialog-btn cancel-btn" on:click={handleCancel}>
          <X size={16} />
          Cancel
        </button>
        <button
          class="dialog-btn save-btn"
          on:click={handleSave}
          disabled={!presetName.trim()}
        >
          <Check size={16} />
          Save
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 20px;
  }

  .dialog-content {
    background: linear-gradient(
      135deg,
      rgba(30, 30, 40, 0.95),
      rgba(20, 20, 30, 0.95)
    );
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 24px;
    max-width: 400px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .dialog-title {
    margin: 0 0 8px;
    font-size: 20px;
    font-weight: 600;
    color: white;
  }

  .dialog-description {
    margin: 0 0 20px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.6);
    line-height: 1.5;
  }

  .input-wrapper {
    position: relative;
    margin-bottom: 20px;
  }

  .preset-input {
    width: 100%;
    padding: 12px 16px;
    padding-right: 60px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: white;
    font-size: 14px;
    transition: all 0.2s ease;
    box-sizing: border-box;
  }

  .preset-input:focus {
    outline: none;
    border-color: rgba(96, 165, 250, 0.5);
    background: rgba(255, 255, 255, 0.08);
  }

  .preset-input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  .char-counter {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    pointer-events: none;
    transition: color 0.2s ease;
  }

  .char-counter.warning {
    color: #fbbf24;
    font-weight: 600;
  }

  .dialog-actions {
    display: flex;
    gap: 12px;
  }

  .dialog-btn {
    flex: 1;
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .cancel-btn {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.8);
  }

  .cancel-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .save-btn {
    background: rgba(34, 197, 94, 0.2);
    border-color: rgba(34, 197, 94, 0.4);
    color: #22c55e;
  }

  .save-btn:hover:not(:disabled) {
    background: rgba(34, 197, 94, 0.3);
    border-color: rgba(34, 197, 94, 0.5);
  }

  .save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 480px) {
    .dialog-content {
      padding: 20px;
    }

    .dialog-title {
      font-size: 18px;
    }

    .dialog-description {
      font-size: 12px;
    }
  }
</style>
