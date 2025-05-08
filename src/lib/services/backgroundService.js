// $lib/services/backgroundService.js
import { Capacitor } from "@capacitor/core";
import BackgroundGeolocation from '@transistorsoft/capacitor-background-geolocation';
import { App } from '@capacitor/app';
import { toast } from "svelte-sonner";

class BackgroundService {
  constructor() {
    this.isInitialized = false;
    this.isTracking = false;
    this.listeners = [];
    this.backgroundStartTime = null;
    this.locationUpdatesInBackground = 0;
    this.lastForegroundTime = Date.now();
    this.appStateListener = null; // Store the listener reference
  }

  init() {
    if (this.isInitialized || !Capacitor.isNativePlatform()) return;

    console.log("Initializing background service");

    // Configure background geolocation
    this.configureBackgroundGeolocation();

    // Listen for app state changes
    this.setupAppStateListeners();

    this.isInitialized = true;
  }

  async configureBackgroundGeolocation() {
    try {
      const config = {
        // Debug settings
        debug: false, // Set to true for testing
        logLevel: BackgroundGeolocation.LOG_LEVEL_VERBOSE,

        // Geolocation settings
        desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
        distanceFilter: 10, // meters
        stopTimeout: 5, // minutes to detect stop

        // Application settings
        stopOnTerminate: false,
        startOnBoot: true, 
        enableHeadless: true,

        // Notification settings for Android
        notification: {
          title: "AgSKAN Tracking",
          text: "Tracking your location in background"
        }
      };

      const state = await BackgroundGeolocation.ready(config);
      console.log("BackgroundGeolocation configured:", state);

      // Add location listener for background updates
      BackgroundGeolocation.onLocation(this.handleBackgroundLocation.bind(this));
      
      // Handle location errors
      BackgroundGeolocation.onError(error => {
        console.error("[Background] Location error:", error);
      });
      
      // Listen for app going to foreground/background via the plugin
      BackgroundGeolocation.onProviderChange(event => {
        console.log("[Background] Provider changed:", event);
      });

    } catch (error) {
      console.error("Error configuring background geolocation:", error);
    }
  }

  setupAppStateListeners() {
    // Listen for app state changes and store the listener reference
    this.appStateListener = App.addListener('appStateChange', ({ isActive }) => {
      console.log("App state changed. isActive:", isActive);
      
      if (isActive) {
        // App came to foreground
        this.onForeground();
      } else {
        // App went to background
        this.onBackground();
      }
    });
  }

  onBackground() {
    this.backgroundStartTime = Date.now();
    this.locationUpdatesInBackground = 0;
    
    // Start background tracking if not already tracking
    this.startBackgroundTracking();
    
    // Notify listeners
    this.notifyListeners('background', {});
  }

  onForeground() {
    // Calculate duration in background
    let duration = null;
    if (this.backgroundStartTime) {
      const milliseconds = Date.now() - this.backgroundStartTime;
      duration = {
        milliseconds,
        formatted: this.formatDuration(milliseconds)
      };
    }
    
    // Switch to foreground tracking
    this.stopBackgroundTracking();
    
    // Notify listeners with duration and location update count
    this.notifyListeners('foreground', {
      duration,
      locationUpdateCount: this.locationUpdatesInBackground
    });
    
    // Show toast with background update count
    if (this.locationUpdatesInBackground > 0) {
      toast.info(`Location tracking stats`, {
        description: `Recorded ${this.locationUpdatesInBackground} location updates while in background.`,
        duration: 5000
      });
    }
    
    // Reset values
    this.backgroundStartTime = null;
    this.locationUpdatesInBackground = 0;
  }

  async startBackgroundTracking() {
    try {
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
    console.log("[Background] Location update:", location);
    
    // Increment the counter of background location updates
    this.locationUpdatesInBackground++;
    
    // Extract the location data
    const { coords, timestamp } = location;
    const { latitude, longitude, heading, speed } = coords;
    
    // Forward this data to your existing streamMarkerPosition logic
    // We're not calling it directly to avoid circular dependencies
    // Instead, we'll notify listeners which VehicleTracker will handle
    this.notifyListeners('location', {
      coords: {
        latitude,
        longitude,
        heading: heading || 0,
        speed: speed || 0
      },
      timestamp
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

  cleanup() {
    if (this.isTracking) {
      this.stopBackgroundTracking();
    }
    
    if (Capacitor.isNativePlatform()) {
      // Remove the appStateListener properly
      if (this.appStateListener) {
        try {
          this.appStateListener.remove();
        } catch (error) {
          console.error("Error removing app state listener:", error);
        }
      }
      
      // BackgroundGeolocation listeners are typically handled by the plugin
      // itself when the app is destroyed, but we can add specific cleanup
      // if needed in the future
    }
    
    this.listeners = [];
    this.isInitialized = false;
  }
}

// Export a singleton instance
export default new BackgroundService();