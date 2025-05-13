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
    this.appStateListener = null;
    this.backgroundPermissionGranted = false;
    this.platform = Capacitor.getPlatform();
  }

  async init() {
    if (this.isInitialized || !Capacitor.isNativePlatform()) return false;

    console.log(`Initializing background service on ${this.platform}`);

    try {
      // Check permission first - this works correctly
      await this.checkBackgroundPermission();
      
      // Store the permission state before configuration
      const permissionState = this.backgroundPermissionGranted;
      
      // Configure the plugin with error handling
      try {
        await this.configureBackgroundGeolocation();
      } catch (configError) {
        console.error("Error during background geolocation configuration:", configError);
        // Continue with initialization despite config errors
        // We've already checked permissions which is the important part
      }
      
      // Set up app state listeners
      this.setupAppStateListeners();
      
      this.isInitialized = true;
      
      // Return the permission state we determined before configuration
      return permissionState;
    } catch (error) {
      console.error("Error initializing background service:", error);
      return false;
    }
  }

  async checkBackgroundPermission() {
    try {
      // Get the provider state to check permission status
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
        
        // Android notification
        notification: {
          title: "AgSKAN Tracking",
          text: "Tracking your location in background"
        }
      };

      console.log("Configuring BackgroundGeolocation");
      const state = await BackgroundGeolocation.ready(config);
      console.log("BackgroundGeolocation configured successfully");
      
      // Add location listener - this was working correctly
      try {
        BackgroundGeolocation.addListener('location', this.handleBackgroundLocation.bind(this));
        console.log("Location listener added successfully");
      } catch (listenerError) {
        console.error("Error adding location listener:", listenerError);
      }
      
      // Try to add error listener using addListener instead of onError
      try {
        BackgroundGeolocation.addListener('error', (error) => {
          console.error("[Background] Location error:", error);
        });
        console.log("Error listener added successfully");
      } catch (errorListenerError) {
        console.error("Error adding error listener:", errorListenerError);
        // Continue even if we can't add the error listener
      }
      
      // Try to add provider change listener using addListener instead of onProviderChange
      try {
        BackgroundGeolocation.addListener('providerchange', (event) => {
          console.log("[Background] Provider changed:", JSON.stringify(event));
          
          // Update permission status when provider changes
          if (typeof event.status !== 'undefined') {
            const wasGranted = this.backgroundPermissionGranted;
            this.backgroundPermissionGranted = event.status === 3;
            
            // Notify if permission status changed
            if (wasGranted !== this.backgroundPermissionGranted) {
              this.notifyListeners('permissionChange', {
                backgroundPermissionGranted: this.backgroundPermissionGranted
              });
            }
          }
        });
        console.log("Provider change listener added successfully");
      } catch (providerListenerError) {
        console.error("Error adding provider change listener:", providerListenerError);
        // Continue even if we can't add the provider change listener
      }

      return state;
    } catch (error) {
      console.error("Error configuring background geolocation:", error);
      throw error;
    }
  }

  setupAppStateListeners() {
    // Clean up existing listener if any
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
        // App came to foreground
        this.onForeground();
      } else {
        // App went to background
        this.onBackground();
      }
    });
  }

  async onBackground() {
    // Reset counters
    this.backgroundStartTime = Date.now();
    this.locationUpdatesInBackground = 0;
    
    // Check permission status before starting background tracking
    await this.checkBackgroundPermission();
    
    if (this.backgroundPermissionGranted) {
      // Start tracking only if permission is granted
      await this.startBackgroundTracking();
      
      this.notifyListeners('background', {
        backgroundPermissionGranted: true
      });
    } else {
      console.log("Background tracking not started - permission not granted");
      
      this.notifyListeners('background', {
        backgroundPermissionGranted: false
      });
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
    
    // Stop background tracking
    this.stopBackgroundTracking();
    
    // Notify listeners
    this.notifyListeners('foreground', {
      duration,
      locationUpdateCount: this.locationUpdatesInBackground,
      backgroundPermissionGranted: this.backgroundPermissionGranted
    });
    
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
    console.log("[Background] Location update received");
    
    // Increment counter
    this.locationUpdatesInBackground++;
    
    // Extract location data
    const { coords, timestamp } = location;
    const { latitude, longitude, heading, speed } = coords;
    
    // Pass to listeners
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

  async cleanup() {
    if (this.isTracking) {
      await this.stopBackgroundTracking();
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
  }
  
  // Simple method to request background permission
  async requestBackgroundPermission() {
    try {
      await BackgroundGeolocation.requestPermission();
      // Update our status after requesting
      return await this.checkBackgroundPermission();
    } catch (error) {
      console.error("Error requesting background permission:", error);
      return false;
    }
  }
}

// Export a singleton instance
export default new BackgroundService();