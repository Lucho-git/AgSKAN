---
task_ref: "Task 1.1 - Migrate Map Core Components"
agent_assignment: "Agent_MapComponents"
memory_log_path: ".apm/Memory/Phase_01_Component_Migration/Task_1_1_Migrate_Map_Core_Components.md"
execution_type: "single-step"
dependency_context: false
ad_hoc_delegation: false
---

# APM Task Assignment: Migrate Map Core Components

## Task Reference
Implementation Plan: **Task 1.1 - Migrate Map Core Components** assigned to **Agent_MapComponents**

## Objective
Move central map orchestration files to the new core folder structure with file path comments.

## Detailed Instructions
Complete all items in one response:

1. **Create target directory**: `src/lib/components/map/core/`

2. **Migrate MapViewer.svelte**:
   - Move `src/components/MapViewer.svelte` → `src/lib/components/map/core/MapViewer.svelte`
   - Add file path comment `<!-- src/lib/components/map/core/MapViewer.svelte -->` as the first line of the file

3. **Migrate MapEventManager.svelte**:
   - Move `src/components/MapEventManager.svelte` → `src/lib/components/map/core/MapEventManager.svelte`
   - Add file path comment `<!-- src/lib/components/map/core/MapEventManager.svelte -->` as the first line of the file

4. **Verify both files exist** in the new location with correct file path comments

**Important**: These are the most critical files in the map system—handle carefully. Preserve all existing content exactly as-is, only adding the path comment at the top.

## Expected Output
- Deliverables: `MapViewer.svelte` and `MapEventManager.svelte` in `src/lib/components/map/core/` with file path comments
- Success criteria: Both files migrated with path comments added as first line
- File locations:
  - `src/lib/components/map/core/MapViewer.svelte`
  - `src/lib/components/map/core/MapEventManager.svelte`

## Memory Logging
Upon completion, you **MUST** log work in: `.apm/Memory/Phase_01_Component_Migration/Task_1_1_Migrate_Map_Core_Components.md`
Follow .apm/guides/Memory_Log_Guide.md instructions.

## Reporting Protocol
After logging, you **MUST** output a **Final Task Report** code block.
- **Format:** Use the exact template provided in your .github/prompts/apm-3-initiate-implementation.prompt.md instructions.
- **Perspective:** Write it from the User's perspective so they can copy-paste it back to the Manager.