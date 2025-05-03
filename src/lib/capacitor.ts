import { StatusBar } from '@capacitor/status-bar';

export function initCapacitor() {
    // Only run this code when in a Capacitor app environment
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        // Set status bar to not overlay content - this fixes your main issue
        StatusBar.setOverlaysWebView({ overlay: false });
    }
}