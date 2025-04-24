// src/lib/services/backgroundService.js
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';

class BackgroundService {
  constructor() {
    this.listeners = [];
    this.initialized = false;
  }

  async init() {
    if (this.initialized || !Capacitor.isNativePlatform()) return;
    
    try {
      // Set up app state listener
      App.addListener('appStateChange', this.handleAppStateChange.bind(this));
      
      // Check if we have a stored background time on startup
      await this.checkStoredBackgroundTime();
      
      this.initialized = true;
      console.log('Background service initialized');
    } catch (error) {
      console.error('Error initializing background service:', error);
    }
  }

  async handleAppStateChange({ isActive }) {
    try {
      if (isActive) {
        // App came to foreground
        const duration = await this.calculateBackgroundDuration();
        if (duration) {
          // Notify all listeners about the background duration
          this.notifyListeners('foreground', { duration });
        }
      } else {
        // App went to background - store the current time
        await this.storeBackgroundStartTime();
        this.notifyListeners('background', {});
      }
    } catch (error) {
      console.error('Error in app state change handler:', error);
    }
  }

  async storeBackgroundStartTime() {
    try {
      const now = Date.now();
      await Preferences.set({
        key: 'backgroundStartTime',
        value: now.toString()
      });
      console.log('Stored background start time:', new Date(now).toISOString());
    } catch (error) {
      console.error('Error storing background start time:', error);
    }
  }

  async calculateBackgroundDuration() {
    try {
      const result = await Preferences.get({ key: 'backgroundStartTime' });
      if (!result.value) return null;

      const startTime = parseInt(result.value, 10);
      const now = Date.now();
      const duration = now - startTime;
      
      // Clear the stored time
      await Preferences.remove({ key: 'backgroundStartTime' });
      
      console.log(`App was in background for ${this.formatDuration(duration)}`);
      return {
        milliseconds: duration,
        formatted: this.formatDuration(duration)
      };
    } catch (error) {
      console.error('Error calculating background duration:', error);
      return null;
    }
  }

  async checkStoredBackgroundTime() {
    try {
      const duration = await this.calculateBackgroundDuration();
      if (duration) {
        // If we have a duration, it means the app was closed while in background
        this.notifyListeners('restart', { duration });
      }
    } catch (error) {
      console.error('Error checking stored background time:', error);
    }
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

  addListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  notifyListeners(event, data) {
    this.listeners.forEach(listener => {
      try {
        listener(event, data);
      } catch (error) {
        console.error('Error in background service listener:', error);
      }
    });
  }

  cleanup() {
    if (Capacitor.isNativePlatform()) {
      App.removeAllListeners();
    }
    this.listeners = [];
    this.initialized = false;
  }
}

// Export a singleton instance
const backgroundService = new BackgroundService();
export default backgroundService;