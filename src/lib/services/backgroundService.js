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
    this.platform = Capacitor.getPlatform();
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

      console.log("Configuring BackgroundGeolocation with farming-optimized settings");
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
          console.log("[Background] Provider changed:", JSON.stringify(event));
          
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
    
    // Notify listeners immediately that we're in background
    // This ensures VehicleTracker sets isBackground=true before location events arrive
    this.notifyListeners('background', {
      backgroundPermissionGranted: this.backgroundPermissionGranted
    });
    
    // Now do the async permission check + start tracking
    await this.checkBackgroundPermission();
    
    if (this.backgroundPermissionGranted) {
      await this.startBackgroundTracking();
    } else {
      console.log("Background tracking not started - permission not granted");
    }
  }

  onForeground() {
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
    setTimeout(() => {
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
        console.log("Cannot start background tracking - permission not granted");
        return;
      }
      
      if (!this.isTracking) {
        await BackgroundGeolocation.start();
        this.isTracking = true;
        console.log("Background tracking started");
      }
    } catch (error) {
      console.error("Failed to start background tracking:", error);
    }
  }

  async stopBackgroundTracking() {
    try {
      if (this.isTracking) {
        await BackgroundGeolocation.stop();
        this.isTracking = false;
        console.log("Background tracking stopped");
      }
    } catch (error) {
      console.error("Failed to stop background tracking:", error);
    }
  }

  handleBackgroundLocation(location) {
    console.log("[Background] Location update received, isBackground:", this.isBackground);
    
    // Increment counter
    this.locationUpdatesInBackground++;
    
    // Extract location data — include accuracy for GPS glitch filter
    const { coords, timestamp } = location;
    const { latitude, longitude, heading, speed, accuracy } = coords;
    
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