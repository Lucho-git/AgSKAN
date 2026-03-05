//$lib/stores/markerStore.js

//@ts-nocheck
import { writable } from "svelte/store"

export const markerStore = writable(null)

export const selectedMarkerStore = writable(null)

function createConfirmedMarkersStore() {
  const { subscribe, set, update } = writable([])

  let subscriberCount = 0

  function customSubscribe(run, invalidate) {
    subscriberCount++
    //   console.log(`Got a subscriber to confirmedMarkersStore. Total subscribers: ${subscriberCount}`);

    const unsubscribe = subscribe(run, invalidate)

    return () => {
      subscriberCount--
      // console.log(`Subscriber to confirmedMarkersStore unsubscribed. Total subscribers: ${subscriberCount}`);
      unsubscribe()
    }
  }

  return {
    subscribe: customSubscribe,
    set,
    update,
  }
}

export const confirmedMarkersStore = createConfirmedMarkersStore()

function createRemoveMarkerStore() {
  let subscriberCount = 0

  const { subscribe, set, update } = writable([], () => {
    subscriberCount++
    // console.log(`Got a subscriber to removeMarkerStore. Total subscribers: ${subscriberCount}`);

    return () => {
      subscriberCount--
      //   console.log(`Subscriber to removeMarkerStore unsubscribed. Total subscribers: ${subscriberCount}`);
    }
  })

  return {
    subscribe,
    set,
    update,
  }
}

export const removeMarkerStore = createRemoveMarkerStore()

function createMarkerActionsStore() {
  let subscriberCount = 0

  const { subscribe, set, update } = writable([], () => {
    subscriberCount++
    // console.log(`Got a subscriber to markerActionsStore. Total subscribers: ${subscriberCount}`);

    return () => {
      subscriberCount--
      //   console.log(`Subscriber to markerActionsStore unsubscribed. Total subscribers: ${subscriberCount}`);
    }
  })

  return {
    subscribe,
    set,
    update,
  }
}

export const markerActionsStore = createMarkerActionsStore()

export const syncStore = writable({
  synchronizeMarkers: null,
  spinning: false,
})

function createLocationMarkerStore() {
  const { subscribe, set, update } = writable(null)

  return {
    subscribe,
    set,
    update,
    triggerLocationMarker: () => update((n) => Date.now()),
  }
}

export const locationMarkerStore = createLocationMarkerStore()

// Extra marker location store - carries {coordinates, marker} payload
function createExtraLocationMarkerStore() {
  const { subscribe, set, update } = writable(null)

  return {
    subscribe,
    set,
    update,
    drop: (coordinates, marker) => set({ coordinates, marker, timestamp: Date.now() }),
  }
}

export const extraLocationMarkerStore = createExtraLocationMarkerStore()

// 🆕 Pending marker changes stores for tracking unsynced data
export const pendingMarkerChangesStore = writable(new Set())
export const pendingMarkerDeletionsStore = writable(new Set())

// Remote marker ripple event - fires when another user places a marker
export const remoteMarkerRippleStore = writable(null)

// Remote marker edit event - fires when another user edits a marker
export const remoteMarkerEditStore = writable(null)

// Remote marker delete event - fires when another user deletes a marker
export const remoteMarkerDeleteStore = writable(null)

// ═══════════════════════════════════════════════════════
//  Collection Mode — auto-delete markers on proximity
// ═══════════════════════════════════════════════════════
function createCollectionModeStore() {
  const { subscribe, set, update } = writable({
    enabled: false,
    radius: 25,                         // meters
    targetIconClasses: new Set(["custom-svg-rock"]),  // Rock pre-selected
    animationStyle: "green",             // "green" = collect gather, "red" = removal puff
  })

  return {
    subscribe,
    set,
    update,
    toggle: () => update(s => ({ ...s, enabled: !s.enabled })),
    setRadius: (r) => update(s => ({ ...s, radius: r })),
    setAnimationStyle: (style) => update(s => ({ ...s, animationStyle: style })),
    toggleTarget: (iconClass) => update(s => {
      const next = new Set(s.targetIconClasses)
      if (next.has(iconClass)) next.delete(iconClass)
      else next.add(iconClass)
      return { ...s, targetIconClasses: next }
    }),
  }
}

export const collectionModeStore = createCollectionModeStore()

// ═══════════════════════════════════════════════════════
//  Collection Route Planner — lasso select → TSP route
// ═══════════════════════════════════════════════════════
function createCollectionRouteStore() {
  const initial = {
    /** "idle" | "drawing" | "selected" | "navigating" */
    phase: "idle",
    /** Array of [lng, lat] points forming the lasso polygon */
    lassoPoints: [],
    /** Filtered marker objects inside the polygon that match target classes */
    selectedMarkers: [],
    /** Ordered [lng, lat] TSP route coordinates (includes user start) */
    routeCoords: [],
    /** Total route distance in metres */
    routeDistanceM: 0,
    /** Set of marker IDs that have been collected during navigation */
    collectedIds: new Set(),
  }

  const { subscribe, set, update } = writable({ ...initial })

  return {
    subscribe,
    set,
    update,
    /** Enter lasso drawing mode (phase: drawing) */
    startDrawing: () => set({ ...initial, phase: "drawing" }),
    /** Abort drawing / go back to idle */
    cancelDrawing: () => set({ ...initial }),
    /** Lasso finished — show preview dots (phase: selected) */
    finishSelection: (lassoPoints, selectedMarkers) => update(s => ({
      ...s,
      phase: "selected",
      lassoPoints,
      selectedMarkers,
    })),
    /** User presses Start — compute & show route (phase: navigating) */
    startNavigation: (routeCoords, routeDistanceM) => update(s => ({
      ...s,
      phase: "navigating",
      routeCoords,
      routeDistanceM,
    })),
    /** Tear down everything */
    clearRoute: () => set({ ...initial, collectedIds: new Set() }),
    /** Mark a marker as collected (turns its dot green) */
    markCollected: (markerId) => update(s => {
      const ids = new Set(s.collectedIds)
      ids.add(markerId)
      return { ...s, collectedIds: ids }
    }),
  }
}

export const collectionRouteStore = createCollectionRouteStore()