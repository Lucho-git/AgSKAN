import { browser } from '$app/environment';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';

// Check if we're in a Capacitor native app
export const isNativeApp = browser && Capacitor.isNativePlatform();

// Initialize safe areas for the app
export async function initializeSafeAreas() {
    if (!isNativeApp) return;

    console.log('Initializing safe areas for native app');

    // For iOS with notches, use env(safe-area-inset-top) CSS
    const style = document.createElement('style');
    style.innerHTML = `
    :root {
      --safe-area-inset-top: env(safe-area-inset-top, 0px);
      --safe-area-inset-right: env(safe-area-inset-right, 0px);
      --safe-area-inset-bottom: env(safe-area-inset-bottom, 0px);
      --safe-area-inset-left: env(safe-area-inset-left, 0px);
    }
    
    body {
      padding-top: var(--safe-area-inset-top);
    }
    
    .safe-area-top {
      padding-top: var(--safe-area-inset-top);
    }
    
    .fixed-top {
      top: var(--safe-area-inset-top) !important;
    }
  `;
    document.head.appendChild(style);

    // Flag the body for CSS targeting
    document.body.classList.add('native-app');

    // Configure the StatusBar
    if (Capacitor.isPluginAvailable('StatusBar')) {
        try {
            // Set the status bar to NOT overlay the WebView
            await StatusBar.setOverlaysWebView({ overlay: false });

            // This is crucial - we tell Capacitor to use the WebView's layout system
            // for handling the status bar, which better matches how PWAs work
            document.body.style.setProperty('--ion-safe-area-top', 'env(safe-area-inset-top)');

            console.log('StatusBar configured to not overlay WebView');
        } catch (err) {
            console.error('Error configuring StatusBar:', err);
        }
    }
}