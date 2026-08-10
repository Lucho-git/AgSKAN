// src/lib/stores/mapAttentionStore.js
// General-purpose registry of "attention" points. Anything that needs to draw
// the user's attention when it's off-screen (moving silos now, vehicles or
// locations later) registers here with coordinates + an icon. The
// EdgeIndicator overlay renders an edge-pinned badge for each item that falls
// outside the current viewport.
// @ts-nocheck
import { writable } from "svelte/store"

function createMapAttentionStore() {
  const { subscribe, set, update } = writable([])

  return {
    subscribe,
    set,
    update,
    /** Add or upsert (by id) an attention item: { id, coordinates, icon?, color?, label? } */
    add(item) {
      if (!item?.id) return
      update((items) => {
        const idx = items.findIndex((i) => i.id === item.id)
        if (idx >= 0) {
          const next = [...items]
          next[idx] = { ...items[idx], ...item }
          return next
        }
        return [...items, item]
      })
    },
    /** Remove an attention item by id. */
    remove(id) {
      update((items) => items.filter((i) => i.id !== id))
    },
    clear() {
      set([])
    },
  }
}

export const mapAttentionStore = createMapAttentionStore()
