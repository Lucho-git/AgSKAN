# AgSKAN Codebase Restructure – APM Implementation Plan
**Memory Strategy:** Dynamic-MD
**Last Modification:** Plan creation by the Setup Agent.
**Project Overview:** Restructure AgSKAN SvelteKit codebase by migrating all 32 components from `src/components/` and reorganizing existing `src/lib/components/` files into a logical folder structure under `src/lib/components/map/` (core, vehicles, markers, trails, fields, toolbox, ui) plus `marketing/` and `widgets/` folders. Update all import paths, add file path comments, rename `VehicleControls.svelte` to `MapVehiclesOverview.svelte`, and verify build success.

## Phase 1: Component Migration

### Task 1.1 – Migrate Map Core Components - Agent_MapComponents
**Objective:** Move central map orchestration files to the new core folder structure.
**Output:** MapViewer.svelte and MapEventManager.svelte in `src/lib/components/map/core/` with file path comments.
**Guidance:** These are the most critical files - handle carefully.

- Create `src/lib/components/map/core/` directory
- Move `src/components/MapViewer.svelte` → `src/lib/components/map/core/MapViewer.svelte`
- Move `src/components/MapEventManager.svelte` → `src/lib/components/map/core/MapEventManager.svelte`
- Add file path comment `<!-- src/lib/components/map/core/<filename>.svelte -->` to each file

### Task 1.2 – Migrate Vehicle Components - Agent_MapComponents
**Objective:** Move all vehicle-related components to vehicles folder, including rename.
**Output:** 7+ vehicle files in `src/lib/components/map/vehicles/` with MapVehiclesOverview renamed.
**Guidance:** The VehicleControls.svelte in src/components becomes MapVehiclesOverview.svelte. The VehicleControls.svelte in lib/components stays for Task 1.6.

- Create `src/lib/components/map/vehicles/` directory
- Move and rename `src/components/VehicleControls.svelte` → `src/lib/components/map/vehicles/MapVehiclesOverview.svelte`
- Move from `src/components/`: VehicleTracker.svelte, VehicleDetailsPanel.svelte, VehicleSelectionMenu.svelte, VehicleStateSynchronizer.svelte, UserMarker.svelte
- Move from `src/lib/components/`: VehicleFlashController.svelte
- Add file path comment `<!-- src/lib/components/map/vehicles/<filename>.svelte -->` to each file

### Task 1.3 – Migrate Marker Components - Agent_MapComponents
**Objective:** Move marker-related components to markers folder.
**Output:** Marker files in `src/lib/components/map/markers/` with comments.
**Guidance:** MapStateSaver.svelte is marker state despite its name. MarkerControls.svelte goes to toolbox in Task 1.6.

- Create `src/lib/components/map/markers/` directory
- Move from `src/components/`: MarkerManager.svelte, MarkerEditPanel.svelte, MapStateSaver.svelte
- Move from `src/lib/components/`: MarkerDrawings.svelte, CrosshairMarkerPlacement.svelte
- Add file path comment to each file

### Task 1.4 – Migrate Trail Components - Agent_MapComponents
**Objective:** Move trail-related components to trails folder.
**Output:** Trail files in `src/lib/components/map/trails/` with comments.
**Guidance:** TrailControls.svelte goes to toolbox in Task 1.6.

- Create `src/lib/components/map/trails/` directory
- Move from `src/components/`: TrailModals.svelte
- Move from `src/lib/components/`: ActiveTrailManager.svelte, HistoricalTrailManager.svelte, TrailSynchronizer.svelte, TrailView.svelte, TrailHighlighter.svelte
- Add file path comment to each file

### Task 1.5 – Migrate Field/Overlay Components - Agent_MapComponents
**Objective:** Move field and drawing/overlay components to fields folder.
**Output:** Field/drawing files in `src/lib/components/map/fields/` with comments.
**Guidance:** All drawing-related components and field management go here.

- Create `src/lib/components/map/fields/` directory
- Move from `src/components/`: MapFields.svelte
- Move from `src/lib/components/`: EmOverlays.svelte, FieldIcon.svelte, DrawingTool.svelte, DrawingPanel.svelte, DrawingModePanel.svelte, DrawingStyleEditor.svelte, DrawingHectares.svelte, BoundaryWizard.svelte, GeoJsonMap.svelte
- Add file path comment to each file

### Task 1.6 – Migrate Toolbox Components - Agent_UIToolbox
**Objective:** Move all *Controls.svelte and toolbox-related components to toolbox folder.
**Output:** Control/toolbox files in `src/lib/components/map/toolbox/` with comments.
**Guidance:** These are the menu/panel components used in the map toolbox interface.

- Create `src/lib/components/map/toolbox/` directory
- Move from `src/lib/components/`: VehicleControls.svelte, MarkerControls.svelte, TrailControls.svelte, LayerControls.svelte, SatelliteControls.svelte, NavigationControl.svelte, Toolbox.svelte, SatelliteManager.svelte, SettingsModule.svelte, RefreshMap.svelte, PresetNameDialog.svelte
- Add file path comment to each file

### Task 1.7 – Migrate Map UI Components - Agent_UIToolbox
**Objective:** Move map-specific UI components to map/ui folder.
**Output:** UI files in `src/lib/components/map/ui/` with comments.
**Guidance:** General UI elements used within the map interface.

- Create `src/lib/components/map/ui/` directory
- Move from `src/components/`: GridColorPicker.svelte, InfoPanel.svelte, NotificationsBanner.svelte, IconSVG.svelte, ThemeSwitcher.svelte, ButtonSection.svelte
- Move from `src/lib/components/`: FlashingToast.svelte
- Add file path comment to each file

### Task 1.8 – Migrate Marketing Components - Agent_Marketing
**Objective:** Move non-map marketing/website components to marketing folder.
**Output:** Marketing files in `src/lib/components/marketing/` with comments.
**Guidance:** These are website components not used in the map viewer.

- Create `src/lib/components/marketing/` directory
- Move from `src/components/`: PricePlanBox.svelte, PricingPlans.svelte, AlertBanner.svelte, EdgeFunction.svelte, FileInspector.svelte, LogoCard.svelte, StubContainer.svelte, TypeFormSurvey.svelte
- Move from `src/lib/components/`: PricingSection.svelte (evaluate if belongs with existing `pricing/` folder)
- Add file path comment to each file

### Task 1.9 – Migrate Widget Components - Agent_Marketing
**Objective:** Move chat/contact widget components to widgets folder.
**Output:** Widget files in `src/lib/components/widgets/` with comments.
**Guidance:** External chat and contact widgets.

- Create `src/lib/components/widgets/` directory
- Move from `src/components/`: CrispChatWidget.svelte, FloatingChat.svelte, FloatingContact.svelte, WhatsAppWidget.svelte
- Add file path comment to each file

## Phase 2: Import Path Updates

### Task 2.1 – Update Map Core Imports - Agent_Imports
**Objective:** Update all imports of MapViewer and MapEventManager across codebase.
**Output:** All imports pointing to `$lib/components/map/core/`.
**Guidance:** **Depends on: Task 1.1 Output by Agent_MapComponents**. Search thoroughly - these are imported in many places.

1. Search codebase for imports of `MapViewer.svelte` and `MapEventManager.svelte`
2. Update each import path to `$lib/components/map/core/MapViewer.svelte` and `$lib/components/map/core/MapEventManager.svelte`
3. Verify no broken references remain

### Task 2.2 – Update Vehicle Component Imports - Agent_Imports
**Objective:** Update all imports for vehicle components including renamed MapVehiclesOverview.
**Output:** All vehicle imports pointing to `$lib/components/map/vehicles/`.
**Guidance:** **Depends on: Task 1.2 Output by Agent_MapComponents**. Remember to update references from old VehicleControls to MapVehiclesOverview.

1. Search for imports of: VehicleTracker, VehicleDetailsPanel, VehicleSelectionMenu, VehicleStateSynchronizer, UserMarker, VehicleFlashController
2. Update paths to `$lib/components/map/vehicles/<filename>.svelte`
3. Update any references to old `VehicleControls` (from src/components path) to `MapVehiclesOverview`
4. Verify no broken references remain

### Task 2.3 – Update Marker Component Imports - Agent_Imports
**Objective:** Update all imports for marker components.
**Output:** All marker imports pointing to `$lib/components/map/markers/`.
**Guidance:** **Depends on: Task 1.3 Output by Agent_MapComponents**.

1. Search for imports of: MarkerManager, MarkerEditPanel, MapStateSaver, MarkerDrawings, CrosshairMarkerPlacement
2. Update paths to `$lib/components/map/markers/<filename>.svelte`
3. Verify no broken references remain

### Task 2.4 – Update Trail Component Imports - Agent_Imports
**Objective:** Update all imports for trail components.
**Output:** All trail imports pointing to `$lib/components/map/trails/`.
**Guidance:** **Depends on: Task 1.4 Output by Agent_MapComponents**.

1. Search for imports of: TrailModals, ActiveTrailManager, HistoricalTrailManager, TrailSynchronizer, TrailView, TrailHighlighter
2. Update paths to `$lib/components/map/trails/<filename>.svelte`
3. Verify no broken references remain

### Task 2.5 – Update Field Component Imports - Agent_Imports
**Objective:** Update all imports for field/overlay components.
**Output:** All field imports pointing to `$lib/components/map/fields/`.
**Guidance:** **Depends on: Task 1.5 Output by Agent_MapComponents**.

1. Search for imports of: MapFields, EmOverlays, FieldIcon, DrawingTool, DrawingPanel, DrawingModePanel, DrawingStyleEditor, DrawingHectares, BoundaryWizard, GeoJsonMap
2. Update paths to `$lib/components/map/fields/<filename>.svelte`
3. Verify no broken references remain

### Task 2.6 – Update Toolbox Component Imports - Agent_Imports
**Objective:** Update all imports for toolbox components.
**Output:** All toolbox imports pointing to `$lib/components/map/toolbox/`.
**Guidance:** **Depends on: Task 1.6 Output by Agent_UIToolbox**.

1. Search for imports of: VehicleControls (lib version), MarkerControls, TrailControls, LayerControls, SatelliteControls, NavigationControl, Toolbox, SatelliteManager, SettingsModule, RefreshMap, PresetNameDialog
2. Update paths to `$lib/components/map/toolbox/<filename>.svelte`
3. Verify no broken references remain

### Task 2.7 – Update UI Component Imports - Agent_Imports
**Objective:** Update all imports for map UI components.
**Output:** All map UI imports pointing to `$lib/components/map/ui/`.
**Guidance:** **Depends on: Task 1.7 Output by Agent_UIToolbox**.

1. Search for imports of: GridColorPicker, InfoPanel, NotificationsBanner, IconSVG, ThemeSwitcher, ButtonSection, FlashingToast
2. Update paths to `$lib/components/map/ui/<filename>.svelte`
3. Verify no broken references remain

### Task 2.8 – Update Marketing Component Imports - Agent_Imports
**Objective:** Update all imports for marketing components.
**Output:** All marketing imports pointing to `$lib/components/marketing/`.
**Guidance:** **Depends on: Task 1.8 Output by Agent_Marketing**.

1. Search for imports of: PricePlanBox, PricingPlans, AlertBanner, EdgeFunction, FileInspector, LogoCard, StubContainer, TypeFormSurvey, PricingSection
2. Update paths to `$lib/components/marketing/<filename>.svelte`
3. Verify no broken references remain

### Task 2.9 – Update Widget Component Imports - Agent_Imports
**Objective:** Update all imports for widget components.
**Output:** All widget imports pointing to `$lib/components/widgets/`.
**Guidance:** **Depends on: Task 1.9 Output by Agent_Marketing**.

1. Search for imports of: CrispChatWidget, FloatingChat, FloatingContact, WhatsAppWidget
2. Update paths to `$lib/components/widgets/<filename>.svelte`
3. Verify no broken references remain

## Phase 3: Validation & Cleanup

### Task 3.1 – Build Verification - Agent_Imports
**Objective:** Verify all imports resolve correctly via build.
**Output:** Successful `npm run build` with no errors.
**Guidance:** **Depends on: All Phase 2 tasks**. If build fails, analyze errors and fix remaining import issues.

1. Run `npm run build`
2. If errors occur, analyze error messages to identify broken imports
3. Fix any remaining import path issues
4. Re-run build until successful

### Task 3.2 – Development Server Test - Agent_Imports
**Objective:** Verify application runs without runtime errors.
**Output:** Working development server with map viewer functional.
**Guidance:** **Depends on: Task 3.1 Output**.

1. Run `npm run dev`
2. Navigate to map viewer page to verify components load
3. Check browser console for import/component errors
4. Report any issues found

### Task 3.3 – Cleanup Empty Directories - Agent_Imports
**Objective:** Remove empty directories after migration.
**Output:** Clean directory structure with no empty folders.
**Guidance:** **Depends on: Task 3.1 Output**. Note: db.js and pathSimplification.js in src/components are utilities - evaluate if they should stay or move to src/lib/utils/.

- Verify `src/components/` contents (db.js, pathSimplification.js are utilities)
- Evaluate if utilities should move to `src/lib/utils/` or remain
- Remove any truly empty directories

