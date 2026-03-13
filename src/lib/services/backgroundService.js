// $lib/services/backgroundService.js
import { Capacitor } from "@capacitor/core";
import BackgroundGeolocation from '@transistorsoft/capacitor-background-geolocation';
import { App } from '@capacitor/app';
import { toast } from "svelte-sonner";

class BackgroundService {
  constructor() {
    this.isInitialized = false;
    this.isTracking = false;
    this.isBackground = false; // Track background state locally to avoid race conditions
    this.listeners = [];
    this.backgroundStartTime = null;
    this.locationUpdatesInBackground = 0;
    this.appStateListener = null;
    this.backgroundPermissionGranted = false;
    this.locationSubscription = null;
    this.providerSubscription = null;
    this.heartbeatSubscription = null;
    this.motionChangeSubscription = null;
    this.platform = Capacitor.getPlatform();
    this.heartbeatCount = 0;
    this.jsHeartbeatInterval = null;
    this.lastLocationTime = null;
    this.lastHeartbeatTime = null;
    this.nativeSyncEnabled = false;
    this.httpSubscription = null;
    this.authorizationSubscription = null;
    this.preStartHook = null; // Async fn to call BEFORE start() — used to setConfig() before flush
    this.tokenSetTime = null; // When the auth token was last configured
    this.tokenRefreshCallback = null; // Async callback to refresh expired token
  }

  async init() {
    if (this.isInitialized || !Capacitor.isNativePlatform()) return false;

    console.log(`Initializing background service on ${this.platform}`);

    try {
      // Check permission first
      await this.checkBackgroundPermission();
      
      const permissionState = this.backgroundPermissionGranted;
      
      // Configure the plugin with error handling
      try {
        await this.configureBackgroundGeolocation();
      } catch (configError) {
        console.error("Error during background geolocation configuration:", configError);
      }
      
      // Set up app state listeners
      this.setupAppStateListeners();
      
      this.isInitialized = true;
      
      return permissionState;
    } catch (error) {
      console.error("Error initializing background service:", error);
      return false;
    }
  }

  async checkBackgroundPermission() {
    try {
      const providerState = await BackgroundGeolocation.getProviderState();
      console.log("Provider State:", JSON.stringify(providerState, null, 2));
      
      // Status code 3 = AUTHORIZATION_STATUS_ALWAYS (required for background)
      this.backgroundPermissionGranted = providerState.status === 3;
      
      console.log(`Background permission granted: ${this.backgroundPermissionGranted} (status=${providerState.status})`);
      return this.backgroundPermissionGranted;
    } catch (error) {
      console.error("Error checking background permission:", error);
      this.backgroundPermissionGranted = false;
      return false;
    }
  }

  async configureBackgroundGeolocation() {
    try {
      const isAndroid = this.platform === 'android';
      const isIOS = this.platform === 'ios';

      const config = {
        // Basic configuration
        debug: false,
        logLevel: BackgroundGeolocation.LOG_LEVEL_VERBOSE,
        desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
        distanceFilter: 10,
        locationAuthorizationRequest: 'Always',
        
        // Background behavior
        stopOnTerminate: false,
        startOnBoot: true,
        enableHeadless: true,

        // ── Prevent the plugin from deciding the device is "stopped" ──
        // Farming equipment moves slowly — default stop detection is too aggressive
        disableStopDetection: true,
        stopTimeout: 0,             // Never auto-stop (0 = disabled)
        stationaryRadius: 5,        // Very small stationary radius (meters)

        // ── Heartbeat: periodic wake-up even when stationary ──
        heartbeatInterval: 60,      // Fire heartbeat every 60s when stationary
        preventSuspend: true,       // (iOS) Keep the app alive in background

        // ── iOS-specific: prevent auto-pause of location updates ──
        pausesLocationUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true, // Blue bar on iOS
        
        // Android notification
        notification: {
          title: "AgSKAN Tracking",
          text: "Tracking your location in background"
        },

        // ── Android-specific ──
        ...(isAndroid ? {
          foregroundService: true,
          notification: {
            title: "AgSKAN Tracking",
            text: "Tracking your location in background",
            sticky: true,
          },
        } : {}),
      };

      // CRITICAL: reset:true forces the plugin to re-apply ALL config on every ready() call.
      // Without it, ready() only applies config on the FIRST launch — subsequent changes
      // (like disableStopDetection, stopTimeout) would be silently ignored.
      config.reset = true;

      console.log("Configuring BackgroundGeolocation with farming-optimized settings (reset:true)");
      const state = await BackgroundGeolocation.ready(config);
      console.log("BackgroundGeolocation configured successfully, state:", JSON.stringify(state, null, 2));
      
      // Use the proper transistorsoft event API (onLocation, onProviderChange)
      // These return subscription objects for cleanup
      try {
        this.locationSubscription = BackgroundGeolocation.onLocation(
          this.handleBackgroundLocation.bind(this),
          (error) => {
            console.error("[Background] Location error:", error);
          }
        );
        console.log("Location listener registered via onLocation()");
      } catch (listenerError) {
        console.error("Error registering onLocation, falling back to addListener:", listenerError);
        try {
          BackgroundGeolocation.addListener('location', this.handleBackgroundLocation.bind(this));
          console.log("Location listener added via addListener() fallback");
        } catch (fallbackError) {
          console.error("Both location listener methods failed:", fallbackError);
        }
      }
      
      // Provider change listener
      try {
        this.providerSubscription = BackgroundGeolocation.onProviderChange((event) => {
          console.log("[BG-DIAG] 📡 Provider changed:", JSON.stringify(event));
          
          if (typeof event.status !== 'undefined') {
            const wasGranted = this.backgroundPermissionGranted;
            this.backgroundPermissionGranted = event.status === 3;
            
            if (wasGranted !== this.backgroundPermissionGranted) {
              this.notifyListeners('permissionChange', {
                backgroundPermissionGranted: this.backgroundPermissionGranted
              });
            }
          }
        });
        console.log("Provider change listener registered via onProviderChange()");
      } catch (providerListenerError) {
        console.error("Error registering onProviderChange:", providerListenerError);
      }

      // Heartbeat listener — fires periodically even when stationary
      // This tells us if the native plugin is still alive
      try {
        this.heartbeatSubscription = BackgroundGeolocation.onHeartbeat(async (event) => {
          this.heartbeatCount++;
          this.lastHeartbeatTime = Date.now();
          const bgSeconds = this.backgroundStartTime ? Math.round((Date.now() - this.backgroundStartTime) / 1000) : 0;
          console.log(`[BG-DIAG] 💓 Heartbeat #${this.heartbeatCount} | bg=${this.isBackground} | tracking=${this.isTracking} | bgTime=${bgSeconds}s | loc=${event?.location ? 'yes' : 'no'}`);
          
          // If we got a location with the heartbeat, process it
          if (event?.location) {
            this.handleBackgroundLocation(event.location);
          }

          // ── Proactive token refresh ──────────────────────────────────
          // If the JWT was set >45 min ago and we have a registered callback,
          // refresh it BEFORE it expires (~60 min). This is a belt-and-suspenders
          // backup to the transistorsoft Authorization config's 401 auto-retry.
          // The heartbeat fires every 60s from native, briefly waking JS.
          if (this.nativeSyncEnabled && this.tokenSetTime && this.tokenRefreshCallback) {
            const tokenAgeSec = (Date.now() - this.tokenSetTime) / 1000;
            if (tokenAgeSec > 45 * 60) {
              console.log(`[BG-DIAG] 🔑 Token is ${Math.round(tokenAgeSec / 60)}min old — triggering proactive refresh`);
              try {
                const result = await this.tokenRefreshCallback();
                if (result?.accessToken) {
                  await this.updateAuthToken(result.accessToken, result.refreshToken);
                  console.log("[BG-DIAG] 🔑 ✅ Proactive token refresh succeeded");
                }
              } catch (refreshErr) {
                console.warn("[BG-DIAG] 🔑 ⚠️ Proactive token refresh failed:", refreshErr);
              }
            }
          }
        });
        console.log("[BG-DIAG] Heartbeat listener registered");
      } catch (heartbeatError) {
        console.error("[BG-DIAG] Error registering onHeartbeat:", heartbeatError);
      }

      // Motion change listener — fires when plugin detects moving/stationary transitions
      try {
        this.motionChangeSubscription = BackgroundGeolocation.onMotionChange((event) => {
          const bgSeconds = this.backgroundStartTime ? Math.round((Date.now() - this.backgroundStartTime) / 1000) : 0;
          console.log(`[BG-DIAG] 🏃 Motion change: isMoving=${event.isMoving} | bg=${this.isBackground} | bgTime=${bgSeconds}s | location=[${event.location?.coords?.latitude?.toFixed(5)}, ${event.location?.coords?.longitude?.toFixed(5)}]`);
        });
        console.log("[BG-DIAG] Motion change listener registered");
      } catch (motionError) {
        console.error("[BG-DIAG] Error registering onMotionChange:", motionError);
      }

      // HTTP response listener — fires when native HTTP engine gets a response
      // Only works while JS is alive (~60s), but crucial for debugging native POST format
      try {
        this.httpSubscription = BackgroundGeolocation.onHttp((event) => {
          if (event.success) {
            console.log(`[BG-DIAG] ✅ Native HTTP ${event.status}: location synced to server`);
          } else {
            console.warn(`[BG-DIAG] ❌ Native HTTP ${event.status}: ${event.responseText}`);
          }
        });
        console.log("[BG-DIAG] HTTP response listener registered");
      } catch (httpListenerError) {
        console.error("[BG-DIAG] Error registering onHttp:", httpListenerError);
      }

      // Authorization listener — fires when the SDK auto-refreshes the JWT
      // via the `authorization` config (e.g. after a 401 triggers refreshUrl)
      try {
        this.authorizationSubscription = BackgroundGeolocation.onAuthorization((event) => {
          if (event.success) {
            this.tokenSetTime = Date.now(); // Reset token age on successful refresh
            console.log(`[BG-DIAG] 🔑 Authorization auto-refresh SUCCESS (status=${event.status})`);
          } else {
            console.warn(`[BG-DIAG] 🔑 Authorization auto-refresh FAILED (status=${event.status}): ${event.error}`);
          }
        });
        console.log("[BG-DIAG] Authorization listener registered");
      } catch (authListenerError) {
        console.error("[BG-DIAG] Error registering onAuthorization:", authListenerError);
      }

      return state;
    } catch (error) {
      console.error("Error configuring background geolocation:", error);
      throw error;
    }
  }

  setupAppStateListeners() {
    if (this.appStateListener) {
      try {
        this.appStateListener.remove();
      } catch (e) {
        console.error("Error removing existing listener:", e);
      }
    }
    
    this.appStateListener = App.addListener('appStateChange', async ({ isActive }) => {
      console.log("App state changed. isActive:", isActive);
      
      if (isActive) {
        this.onForeground();
      } else {
        this.onBackground();
      }
    });
  }

  async onBackground() {
    // Set background flag FIRST — before any async work — so location events
    // that arrive during startup are not dropped (fixes race condition)
    this.isBackground = true;
    this.backgroundStartTime = Date.now();
    this.locationUpdatesInBackground = 0;
    this.heartbeatCount = 0;
    this.lastLocationTime = null;
    this.lastHeartbeatTime = null;
    
    console.log(`[BG-DIAG] ===== ENTERING BACKGROUND ===== platform=${this.platform} time=${new Date().toLocaleTimeString()}`);
    
    // Notify listeners immediately that we're in background
    this.notifyListeners('background', {
      backgroundPermissionGranted: this.backgroundPermissionGranted
    });
    
    // Start a JS-side heartbeat to detect when the WebView JS freezes
    this.startJsHeartbeat();
    
    // Now do the async permission check + start tracking
    await this.checkBackgroundPermission();
    
    if (this.backgroundPermissionGranted) {
      // CRITICAL: Run the pre-start hook BEFORE start() — this lets VehicleTracker
      // call setConfig() with the correct URL/locationTemplate BEFORE start() triggers
      // an HTTP flush of queued locations from the plugin's SQLite store.
      if (this.preStartHook) {
        try {
          console.log("[BG-DIAG] Running pre-start hook (configuring native sync)...");
          await this.preStartHook();
          console.log("[BG-DIAG] Pre-start hook completed");
        } catch (e) {
          console.error("[BG-DIAG] Pre-start hook failed:", e);
        }
      }
      await this.startBackgroundTracking();
      console.log(`[BG-DIAG] Background tracking started, waiting for locations...`);
      
      // Also get the current plugin state for diagnostics
      try {
        const state = await BackgroundGeolocation.getState();
        console.log(`[BG-DIAG] Plugin state: enabled=${state.enabled} | isMoving=${state.isMoving} | didLaunchInBackground=${state.didLaunchInBackground} | stopTimeout=${state.stopTimeout} | distanceFilter=${state.distanceFilter} | disableStopDetection=${state.disableStopDetection} | url=${state.url ? 'SET' : 'none'} | autoSync=${state.autoSync}`);
      } catch (e) {
        console.warn("[BG-DIAG] Could not get plugin state:", e);
      }
    } else {
      console.log("[BG-DIAG] Background tracking NOT started - permission not granted");
    }
  }

  onForeground() {
    const bgSeconds = this.backgroundStartTime ? Math.round((Date.now() - this.backgroundStartTime) / 1000) : 0;
    
    console.log(`[BG-DIAG] ===== RETURNING TO FOREGROUND ===== bgTime=${bgSeconds}s | locations=${this.locationUpdatesInBackground} | heartbeats=${this.heartbeatCount} | lastLoc=${this.lastLocationTime ? Math.round((Date.now() - this.lastLocationTime) / 1000) + 's ago' : 'never'} | lastHB=${this.lastHeartbeatTime ? Math.round((Date.now() - this.lastHeartbeatTime) / 1000) + 's ago' : 'never'}`);
    
    // Stop JS heartbeat
    this.stopJsHeartbeat();
    
    // Calculate time in background
    let duration = null;
    if (this.backgroundStartTime) {
      const milliseconds = Date.now() - this.backgroundStartTime;
      duration = {
        milliseconds,
        formatted: this.formatDuration(milliseconds)
      };
    }
    
    // Notify listeners BEFORE stopping — this gives VehicleTracker a chance
    // to process any final in-flight location events
    this.notifyListeners('foreground', {
      duration,
      locationUpdateCount: this.locationUpdatesInBackground,
      backgroundPermissionGranted: this.backgroundPermissionGranted
    });
    
    // Small delay before stopping to allow in-flight events to be processed
    setTimeout(async () => {
      // Disable native HTTP sync first (stop POSTing to Supabase)
      await this.disableNativeSync();
      this.stopBackgroundTracking();
      this.isBackground = false;
    }, 200);
    
    // Reset counters
    this.backgroundStartTime = null;
    this.locationUpdatesInBackground = 0;
  }

  async startBackgroundTracking() {
    try {
      if (!this.backgroundPermissionGranted) {
        console.log("[BG-DIAG] Cannot start background tracking - permission not granted");
        return;
      }
      
      // Check if the plugin is already running (persists across app restarts)
      const state = await BackgroundGeolocation.getState();
      if (state.enabled) {
        console.log("[BG-DIAG] Plugin already enabled (from previous session), skipping start()");
        this.isTracking = true;
        // Even when already enabled, force active tracking mode.
        // The plugin might be stuck in stationary monitoring from a previous session.
        try {
          await BackgroundGeolocation.changePace(true);
          console.log("[BG-DIAG] ✅ Forced changePace(true) on already-enabled plugin");
        } catch (e) {
          console.warn("[BG-DIAG] changePace failed on already-enabled plugin:", e);
        }
        return;
      }

      if (!this.isTracking) {
        // Stale locations are already cleared in configureNativeSync() before setConfig().
        console.log("[BG-DIAG] Calling BackgroundGeolocation.start()...");
        await BackgroundGeolocation.start();
        this.isTracking = true;
        console.log("[BG-DIAG] ✅ BackgroundGeolocation.start() succeeded");

        // CRITICAL: Force the plugin into active tracking mode immediately.
        // Without this, the plugin starts in stationary mode, sets up a geofence,
        // detects exit, transitions to moving — but this rapid state transition
        // can cause the native tracking engine to go silent (no SQLite persistence).
        // changePace(true) bypasses the stationary phase entirely.
        try {
          await BackgroundGeolocation.changePace(true);
          console.log("[BG-DIAG] ✅ Forced changePace(true) — active tracking mode");
        } catch (e) {
          console.warn("[BG-DIAG] changePace(true) failed:", e);
        }
      } else {
        console.log("[BG-DIAG] Already tracking, skip start()");
      }
    } catch (error) {
      console.error("[BG-DIAG] ❌ Failed to start background tracking:", error);
    }
  }

  /**
   * Configure the plugin's built-in native HTTP sync.
   * When JS is frozen by Android, the native plugin (OkHttp) will POST
   * each location to a Supabase RPC function that handles BOTH:
   *   - vehicle_state UPSERT (always — so other users see this vehicle)
   *   - trail_stream INSERT (only when trailing)
   * 
   * @param {Object} config
   * @param {string} config.supabaseUrl - e.g. 'https://xxx.supabase.co'
   * @param {string} config.anonKey - Supabase anon key
   * @param {string} config.authToken - User's JWT bearer token
   * @param {string} config.refreshToken - Supabase refresh token for auto-renewal
   * @param {string} config.operationId - Current operation UUID (empty if not trailing)
   * @param {string} config.trailId - Current trail UUID (empty if not trailing)
   * @param {string} config.vehicleId - Current vehicle/user UUID
   * @param {string} config.masterMapId - Current master map UUID
   * @param {boolean} config.isTrailing - Whether the user is actively trailing
   */
  async configureNativeSync(config) {
    try {
      // CRITICAL: Destroy any stale queued locations BEFORE setConfig().
      // The plugin may have locations in its SQLite store from a previous session,
      // recorded with the OLD locationTemplate (default fields like activity, age, battery...).
      // When setConfig() applies autoSync:true with a URL, the plugin immediately flushes
      // those stale locations — but their body doesn't match the RPC function signature → 404.
      // Clearing them first prevents this.
      try {
        await BackgroundGeolocation.destroyLocations();
        console.log("[BG-DIAG] Cleared stale queued locations before setConfig");
      } catch (e) {
        console.warn("[BG-DIAG] Could not clear stale locations:", e);
      }

      const { supabaseUrl, anonKey, authToken, refreshToken, operationId, trailId, vehicleId, masterMapId, isTrailing } = config;

      // Build the locationTemplate: each location is POSTed as RPC params.
      // The Supabase function background_sync() handles both vehicle_state + trail_stream.
      // Static values (IDs) are baked into the template at config time.
      // Dynamic values (lat, lng, heading, speed, timestamp) use transistorsoft template vars.
      const locationTemplate = '{'
        + '"p_lat":<%= latitude %>,'
        + '"p_lng":<%= longitude %>,'
        + '"p_heading":<%= heading %>,'
        + '"p_speed":<%= speed %>,'
        + '"p_timestamp":"<%= timestamp %>",'
        + '"p_operation_id":"' + (operationId || '') + '",'
        + '"p_trail_id":"' + (trailId || '') + '",'
        + '"p_vehicle_id":"' + (vehicleId || '') + '",'
        + '"p_master_map_id":"' + (masterMapId || '') + '",'
        + '"p_is_trailing":"' + (isTrailing ? 'true' : 'false') + '"'
        + '}';

      // ── Build the native HTTP config ──
      // Use transistorsoft's built-in `authorization` for automatic JWT refresh.
      // When the native engine receives a 401 from our RPC endpoint, it will
      // automatically POST to refreshUrl to get a new access_token, then retry.
      // This is critical for background sessions >1 hour where the JWT expires
      // and the WebView JS is frozen (can't run Supabase autoRefreshToken).
      const httpConfig = {
        url: `${supabaseUrl}/rest/v1/rpc/background_sync`,
        autoSync: true,
        autoSyncThreshold: 0,
        batchSync: false,
        method: 'POST',
        // httpRootProperty '.' makes the rendered locationTemplate the root of the
        // HTTP body, which is required for PostgREST RPC calls (params at root).
        // CAVEAT: when the location comes from a mock GPS provider, the transistorsoft
        // plugin injects an extra `mock: true` field into the body alongside the
        // template fields. The background_sync SQL function accepts this param and
        // ignores it — without that, PostgREST returns 404 (signature mismatch).
        httpRootProperty: '.',
        locationTemplate,
        headers: {
          'apikey': anonKey,
          'Content-Type': 'application/json',
          // NOTE: Do NOT set 'Authorization' here — the `authorization` config below
          // handles it automatically, including refresh on 401.
        },
        authorization: {
          strategy: 'JWT',
          accessToken: authToken,
          refreshToken: refreshToken || '',
          refreshUrl: `${supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
          refreshPayload: {
            refresh_token: '{refreshToken}',
          },
          refreshHeaders: {
            'apikey': anonKey,
            'Content-Type': 'application/json',
          },
          // Supabase JWTs default to 3600s. Tell the plugin so it knows the window.
          expires: 3600,
        },
        // NOTE: Do NOT use `extras` here — the plugin merges extras into the HTTP body,
        // which would add duplicate un-prefixed params alongside the p_* params in locationTemplate,
        // causing PostgREST to fail with a 404 (wrong function signature).
      };

      await BackgroundGeolocation.setConfig(httpConfig);
      this.nativeSyncEnabled = true;
      this.tokenSetTime = Date.now();
      console.log(`[BG-DIAG] ✅ Native sync configured → RPC background_sync | trailing=${isTrailing} | trail=${(trailId || 'none').slice(0,8)} | vehicle=${(vehicleId || 'none').slice(0,8)} | authorization=JWT`);
      return true;
    } catch (error) {
      console.error("[BG-DIAG] ❌ Failed to configure native sync:", error);
      return false;
    }
  }

  /**
   * Disable native HTTP sync (called on foreground return).
   * Removes the URL config so the plugin stops POSTing.
   */
  async disableNativeSync() {
    try {
      if (this.nativeSyncEnabled) {
        await BackgroundGeolocation.setConfig({
          url: '',
          autoSync: false,
        });
        this.nativeSyncEnabled = false;
        this.tokenSetTime = null;
        console.log("[BG-DIAG] Native HTTP sync disabled");
      }
    } catch (error) {
      console.error("[BG-DIAG] Error disabling native sync:", error);
    }
  }

  /**
   * Update the native engine's auth token without re-configuring the full sync.
   * Called from the heartbeat proactive refresh or foreground return.
   * @param {string} accessToken - New JWT access token
   * @param {string} [refreshToken] - New refresh token (optional)
   */
  async updateAuthToken(accessToken, refreshToken) {
    if (!this.nativeSyncEnabled) return;
    try {
      const authUpdate = {
        authorization: {
          strategy: 'JWT',
          accessToken,
        },
      };
      if (refreshToken) {
        authUpdate.authorization.refreshToken = refreshToken;
      }
      await BackgroundGeolocation.setConfig(authUpdate);
      this.tokenSetTime = Date.now();
      console.log("[BG-DIAG] 🔑 Native engine auth token updated");
    } catch (e) {
      console.warn("[BG-DIAG] Could not update native engine auth token:", e);
    }
  }

  /**
   * Register a callback that backgroundService calls to refresh the auth token.
   * The callback should return { accessToken, refreshToken } on success, or null.
   * This is used for proactive heartbeat-based refresh before the JWT expires.
   * @param {Function} callback - Async fn returning { accessToken, refreshToken } | null
   */
  setTokenRefreshCallback(callback) {
    this.tokenRefreshCallback = callback;
  }

  /**
   * Get un-synced locations stored by the plugin.
   * Locations that were successfully POSTed via native HTTP are already removed.
   * Any remaining are failed syncs that need to be retried.
   */
  async getStoredLocations() {
    try {
      const locations = await BackgroundGeolocation.getLocations();
      console.log(`[BG-DIAG] Stored (un-synced) locations: ${locations.length}`);
      return locations;
    } catch (error) {
      console.error("[BG-DIAG] Error getting stored locations:", error);
      return [];
    }
  }

  /**
   * Get the count of locations synced by the native HTTP service.
   */
  async getSyncedLocationCount() {
    try {
      const count = await BackgroundGeolocation.getCount();
      return count;
    } catch (error) {
      return 0;
    }
  }

  async stopBackgroundTracking() {
    try {
      if (this.isTracking) {
        console.log("[BG-DIAG] Calling BackgroundGeolocation.stop()...");
        await BackgroundGeolocation.stop();
        this.isTracking = false;
        console.log("[BG-DIAG] ✅ BackgroundGeolocation.stop() succeeded");
      }
    } catch (error) {
      console.error("[BG-DIAG] ❌ Failed to stop background tracking:", error);
    }
  }

  // ── JS Heartbeat: Proves whether JavaScript execution is alive ──
  // If these logs stop appearing, the Android WebView has frozen JS execution
  startJsHeartbeat() {
    this.stopJsHeartbeat();
    let tick = 0;
    this.jsHeartbeatInterval = setInterval(() => {
      tick++;
      const bgSeconds = this.backgroundStartTime ? Math.round((Date.now() - this.backgroundStartTime) / 1000) : 0;
      const sinceLastLoc = this.lastLocationTime ? Math.round((Date.now() - this.lastLocationTime) / 1000) : null;
      console.log(`[BG-DIAG] ⏱️ JS heartbeat #${tick} | bgTime=${bgSeconds}s | tracking=${this.isTracking} | locations=${this.locationUpdatesInBackground} | lastLoc=${sinceLastLoc !== null ? sinceLastLoc + 's ago' : 'none'}`);
    }, 10000); // Every 10 seconds
  }

  stopJsHeartbeat() {
    if (this.jsHeartbeatInterval) {
      clearInterval(this.jsHeartbeatInterval);
      this.jsHeartbeatInterval = null;
    }
  }

  handleBackgroundLocation(location) {
    const now = Date.now();
    const bgSeconds = this.backgroundStartTime ? Math.round((now - this.backgroundStartTime) / 1000) : 0;
    const sinceLast = this.lastLocationTime ? Math.round((now - this.lastLocationTime) / 1000) : 0;
    this.lastLocationTime = now;
    
    // Increment counter
    this.locationUpdatesInBackground++;
    
    // Extract location data — include accuracy for GPS glitch filter
    const { coords, timestamp } = location;
    const { latitude, longitude, heading, speed, accuracy } = coords;
    
    console.log(`[BG-DIAG] 📍 Location #${this.locationUpdatesInBackground} | bg=${this.isBackground} | bgTime=${bgSeconds}s | sinceLast=${sinceLast}s | acc=${accuracy?.toFixed(0)}m | spd=${speed?.toFixed(1)}m/s | [${latitude.toFixed(5)}, ${longitude.toFixed(5)}]`);
    
    // Pass to listeners
    this.notifyListeners('location', {
      coords: {
        latitude,
        longitude,
        heading: heading || 0,
        speed: speed || 0,
        accuracy: accuracy || null,
      },
      timestamp
    });
  }

  /**
   * Simulate the background lifecycle for testing.
   * Called from dev tools — fires events through the exact same code path
   * as real background geolocation, without needing a real device.
   */
  simulateBackground() {
    this.isBackground = true;
    this.backgroundStartTime = Date.now();
    this.locationUpdatesInBackground = 0;
    this.notifyListeners('background', {
      backgroundPermissionGranted: true
    });
  }

  /**
   * Simulate returning to foreground.
   */
  simulateForeground() {
    let duration = null;
    if (this.backgroundStartTime) {
      const milliseconds = Date.now() - this.backgroundStartTime;
      duration = {
        milliseconds,
        formatted: this.formatDuration(milliseconds)
      };
    }
    
    this.notifyListeners('foreground', {
      duration,
      locationUpdateCount: this.locationUpdatesInBackground,
      backgroundPermissionGranted: true
    });
    
    this.isBackground = false;
    this.backgroundStartTime = null;
    this.locationUpdatesInBackground = 0;
  }

  /**
   * Inject a synthetic location through the background pipeline.
   * Used by dev tools to test the exact same code path as real GPS.
   */
  simulateLocationUpdate(latitude, longitude, heading = 0, speed = 0, accuracy = 5) {
    this.handleBackgroundLocation({
      coords: { latitude, longitude, heading, speed, accuracy },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Register an async function to run BEFORE BackgroundGeolocation.start().
   * Used by VehicleTracker to call setConfig() with correct URL/template
   * before start() triggers an HTTP flush of any queued locations.
   */
  registerPreStartHook(fn) {
    this.preStartHook = fn;
  }

  addListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  notifyListeners(event, data) {
    this.listeners.forEach(listener => {
      try {
        listener(event, data);
      } catch (error) {
        console.error("Error in background service listener:", error);
      }
    });
  }

  formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  async cleanup() {
    this.stopJsHeartbeat();
    
    if (this.isTracking) {
      await this.stopBackgroundTracking();
    }
    
    // Clean up transistorsoft subscriptions
    if (this.locationSubscription) {
      try { this.locationSubscription.remove(); } catch (e) { /* ignore */ }
    }
    if (this.providerSubscription) {
      try { this.providerSubscription.remove(); } catch (e) { /* ignore */ }
    }
    if (this.heartbeatSubscription) {
      try { this.heartbeatSubscription.remove(); } catch (e) { /* ignore */ }
    }
    if (this.motionChangeSubscription) {
      try { this.motionChangeSubscription.remove(); } catch (e) { /* ignore */ }
    }
    if (this.httpSubscription) {
      try { this.httpSubscription.remove(); } catch (e) { /* ignore */ }
    }
    if (this.authorizationSubscription) {
      try { this.authorizationSubscription.remove(); } catch (e) { /* ignore */ }
    }
    
    if (this.appStateListener && Capacitor.isNativePlatform()) {
      try {
        this.appStateListener.remove();
      } catch (error) {
        console.error("Error removing app state listener:", error);
      }
    }
    
    this.listeners = [];
    this.isInitialized = false;
    this.isBackground = false;
  }
  
  async requestBackgroundPermission() {
    try {
      await BackgroundGeolocation.requestPermission();
      return await this.checkBackgroundPermission();
    } catch (error) {
      console.error("Error requesting background permission:", error);
      return false;
    }
  }
}

// Export a singleton instance
export default new BackgroundService();