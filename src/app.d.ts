import { Session } from "@supabase/supabase-js"

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  /**
   * Minimal structural type for the map published to the screen-recording
   * harness. `mapbox-gl` ships no type declarations in this repo, so describing
   * just what shots need is more useful than a reference that resolves to any.
   */
  interface AgskanDebugMap {
    easeTo(options: {
      center?: [number, number]
      zoom?: number
      bearing?: number
      pitch?: number
      duration?: number
      easing?: (t: number) => number
      essential?: boolean
    }): unknown
    flyTo(options: { center?: [number, number]; zoom?: number; duration?: number }): unknown
    jumpTo(options: { center?: [number, number]; zoom?: number }): unknown
    getCenter(): { lng: number; lat: number }
    getZoom(): number
    getBearing(): number
  }

  interface Window {
    /**
     * Mapbox instance, published for the screen-recording harness
     * (scripts/help-video) so shots can drive frame-accurate camera moves such
     * as `map.easeTo({ duration: 14000 })`.
     *
     * Only set in dev, or when the URL carries `?debugMap`, so production
     * bundles never expose it.
     */
    __agskanMap?: AgskanDebugMap
  }

  namespace App {
    // No Locals: the app is a static build (adapter-static), so there are no
    // server hooks. All Supabase access goes through the browser client.
    interface PageData {
      session: Session | null
    }
    // interface Error {}
    // interface Platform {}
  }
}

export {}
