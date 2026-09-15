<!-- src/lib/components/map/MapFocusFlyer.svelte -->
<!-- Flies the map to locations tapped in message bubbles, with a temporary pin. -->
<script>
  import { onDestroy } from "svelte"
  import mapboxgl from "mapbox-gl"
  import { mapFocusStore } from "$lib/stores/locationPickStore"

  export let map = null

  let pin = null
  let hideTimer = null
  let lastToken = 0

  $: if (map && $mapFocusStore && $mapFocusStore._t !== lastToken) {
    lastToken = $mapFocusStore._t
    showFocus($mapFocusStore)
  }

  function showFocus(focus) {
    try {
      if (focus.fly !== false) {
        map.flyTo({
          center: [focus.lng, focus.lat],
          zoom: Math.max(map.getZoom(), 14.5),
          duration: 900,
        })
      }

      removePin()

      const wrapper = document.createElement("div")
      wrapper.style.cssText =
        "display:flex;flex-direction:column;align-items:center;gap:2px;"

      // Pick confirmations show only the text chip — the map selection is the
      // indicator. Other flows (message bubble "show on map") keep the pin.
      if (!focus.noPin) {
        const pinEl = document.createElement("div")
        pinEl.textContent = "📍"
        pinEl.style.cssText =
          "font-size:26px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));"
        wrapper.appendChild(pinEl)
      }

      if (focus.label) {
        const labelEl = document.createElement("div")
        labelEl.textContent = focus.label
        labelEl.style.cssText =
          "font-size:11px;font-weight:600;color:#fff;background:rgba(10,10,12,0.85);padding:2px 8px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);white-space:nowrap;"
        wrapper.appendChild(labelEl)
      }

      pin = new mapboxgl.Marker({ element: wrapper, anchor: "bottom" })
        .setLngLat([focus.lng, focus.lat])
        .addTo(map)

      clearTimeout(hideTimer)
      hideTimer = setTimeout(removePin, 15000)
    } catch (error) {
      console.warn("Could not focus map location:", error)
    }
  }

  function removePin() {
    clearTimeout(hideTimer)
    if (pin) {
      pin.remove()
      pin = null
    }
  }

  onDestroy(removePin)
</script>
