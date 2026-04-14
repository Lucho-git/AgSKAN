import backgroundService from "$lib/services/backgroundService"

export default class NativeGeolocateControl {
  constructor(options = {}) {
    this.options = options
    this._map = null
    this._container = null
    this._button = null
    this._spinner = null
    this._state = "idle" // idle | acquiring | locked | unlocked
    this._lastCoords = null
    this._bgRemove = null
    this._dragHandler = null
    this._onClick = this._onClick.bind(this)
    this._onBgEvent = this._onBgEvent.bind(this)
    this._onMapDragStart = this._onMapDragStart.bind(this)
  }

  onAdd(map) {
    this._map = map

    // Ensure styles exist
    if (!document.getElementById("native-geolocate-style")) {
      const style = document.createElement("style")
      style.id = "native-geolocate-style"
      style.textContent = `
      .native-geolocate-control button{ background:#fff; border:0; width:40px; height:40px; border-radius:4px; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.2); }
      .native-geolocate-control button.state-locked{ background:#2563eb; color:#fff }
      .native-geolocate-control button.state-unlocked{ background:#1e40af; color:#fff }
      .native-geolocate-control button .icon{ width:18px; height:18px; display:inline-block }
      .native-geolocate-control button .spinner{ width:18px; height:18px; border-radius:50%; border:2px solid rgba(0,0,0,0.12); border-top-color: rgba(0,0,0,0.6); animation:ngc-spin 0.9s linear infinite }
      @keyframes ngc-spin{ from{ transform:rotate(0deg) } to{ transform:rotate(360deg) } }
      `
      document.head.appendChild(style)
    }

    this._container = document.createElement("div")
    this._container.className = "mapboxgl-ctrl mapboxgl-ctrl-group native-geolocate-control"

    this._button = document.createElement("button")
    this._button.type = "button"
    this._button.title = "Locate"
    this._button.className = "state-idle"
    this._button.addEventListener("click", this._onClick)

    // Icon placeholder (compass-like)
    const icon = document.createElement("span")
    icon.className = "icon"
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 8l-6 4 4 6 6-10z"></path></svg>`

    this._spinner = document.createElement("span")
    this._spinner.className = "spinner"
    this._spinner.style.display = "none"

    this._button.appendChild(icon)
    this._button.appendChild(this._spinner)
    this._container.appendChild(this._button)

    // Start listening to native backgroundService events so we can act on locations
    try {
      // Ensure backgroundService is initialized if possible
      if (backgroundService && typeof backgroundService.init === "function") {
        backgroundService.init().catch(() => {})
      }
    } catch (e) {}

    this._bgRemove = backgroundService.addListener((event, data) => this._onBgEvent(event, data))

    // map drag -> unlock (user override)
    if (this._map && this._map.on) {
      this._map.on("dragstart", this._onMapDragStart)
    }

    return this._container
  }

  onRemove() {
    if (this._button) this._button.removeEventListener("click", this._onClick)
    if (this._bgRemove) this._bgRemove()
    if (this._map && this._map.off) this._map.off("dragstart", this._onMapDragStart)
    if (this._container && this._container.parentNode) this._container.parentNode.removeChild(this._container)
    this._container = null
    this._map = null
  }

  _onClick() {
    if (this._state === "idle") {
      // begin acquiring; show spinner until first native fix
      this._setState("acquiring")
      this._waitingForFirstFix = true
      return
    }

    // toggle between locked/unlocked on subsequent clicks
    if (this._state === "locked") {
      this._setState("unlocked")
    } else if (this._state === "unlocked") {
      // re-lock and center on last known coords
      if (this._lastCoords) {
        this._setState("locked")
        this._centerTo(this._lastCoords)
      } else {
        // if no last coords, go back to acquiring until next fix
        this._setState("acquiring")
        this._waitingForFirstFix = true
      }
    } else if (this._state === "acquiring") {
      // already acquiring — noop
    }
  }

  _onBgEvent(event, data) {
    if (event !== "location") return
    if (!data || !data.coords) return

    const coords = {
      latitude: data.coords.latitude,
      longitude: data.coords.longitude,
      heading: data.coords.heading,
      accuracy: data.coords.accuracy,
      speed: data.coords.speed,
    }

    this._lastCoords = coords

    // If we were waiting for first fix, accept it and lock+center
    if (this._waitingForFirstFix) {
      this._waitingForFirstFix = false
      this._setState("locked")
      this._centerTo(coords)
      return
    }

    // While locked, keep centering on new native locations (throttled)
    if (this._state === "locked") {
      const now = Date.now()
      if (!this._lastCenterAt || now - this._lastCenterAt > (this.options.recenterInterval || 1000)) {
        this._lastCenterAt = now
        this._centerTo(coords)
      }
    }
  }

  _onMapDragStart() {
    // When user drags the map, we release lock
    if (this._state === "locked") {
      this._setState("unlocked")
    }
  }

  _setState(state) {
    this._state = state
    if (!this._button) return
    // reset classes
    this._button.className = ""
    if (state === "idle") {
      this._button.classList.add("state-idle")
      this._spinner.style.display = "none"
    } else if (state === "acquiring") {
      this._button.classList.add("state-acquiring")
      this._spinner.style.display = "inline-block"
    } else if (state === "locked") {
      this._button.classList.add("state-locked")
      this._spinner.style.display = "none"
    } else if (state === "unlocked") {
      this._button.classList.add("state-unlocked")
      this._spinner.style.display = "none"
    }
  }

  _centerTo(coords) {
    if (!this._map || !coords) return
    try {
      const { longitude, latitude } = coords
      if (longitude == null || latitude == null) return
      this._map.easeTo({ center: [longitude, latitude], duration: 600, essential: true })
    } catch (e) {
      console.warn("NativeGeolocateControl: centerTo failed", e)
    }
  }
}
