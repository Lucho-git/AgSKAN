# AgSKAN Codebase Restructure – APM Memory Root
**Memory Strategy:** Dynamic-MD
**Project Overview:** Restructure AgSKAN SvelteKit codebase by migrating 32 components from `src/components/` and reorganizing existing `src/lib/components/` files into a logical folder structure under `src/lib/components/map/` (core, vehicles, markers, trails, fields, toolbox, ui) plus `marketing/` and `widgets/` folders. Update all import paths, add file path comments, rename VehicleControls.svelte to MapVehiclesOverview.svelte, and verify build success across 3 phases and 21 tasks.
