package com.skanfarming;

import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor plugin that starts/stops a native ForegroundService to feed mock GPS
 * locations into the Android location subsystem.  Because it is a ForegroundService,
 * it persists even when the WebView JS is frozen by the OS — exactly the condition
 * we need to test background-geolocation + background_sync behaviour.
 *
 * Usage from JS:
 *   import { registerPlugin } from '@capacitor/core';
 *   const MockLocation = registerPlugin('MockLocation');
 *
 *   await MockLocation.start({ latitude: -33.87, longitude: 151.21, intervalMs: 3000 });
 *   await MockLocation.stop();
 *   const { running } = await MockLocation.isRunning();
 *
 * PREREQUISITES:
 *   1. Developer Options enabled on the device
 *   2. "Select mock location app" → choose AgSKAN
 *   3. The app needs ACCESS_FINE_LOCATION (already granted for tracking)
 */
@CapacitorPlugin(name = "MockLocation")
public class MockLocationPlugin extends Plugin {
    private static final String TAG = "MockLocationPlugin";

    @PluginMethod
    public void start(PluginCall call) {
        double lat = call.getDouble("latitude", -33.8688);   // Default: Sydney
        double lng = call.getDouble("longitude", 151.2093);
        long intervalMs = call.getInt("intervalMs", 3000);    // 3 s default
        double stepMeters = call.getDouble("stepMeters", 15.0); // 15 m per tick
        String pattern = call.getString("pattern", "rectangle"); // rectangle | circle

        Log.i(TAG, "Starting mock location: lat=" + lat + " lng=" + lng
                + " interval=" + intervalMs + "ms step=" + stepMeters + "m");

        Intent intent = new Intent(getContext(), MockLocationService.class);
        intent.setAction(MockLocationService.ACTION_START);
        intent.putExtra("latitude", lat);
        intent.putExtra("longitude", lng);
        intent.putExtra("intervalMs", intervalMs);
        intent.putExtra("stepMeters", stepMeters);
        intent.putExtra("pattern", pattern);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }

        JSObject ret = new JSObject();
        ret.put("started", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Log.i(TAG, "Stopping mock location service");

        Intent intent = new Intent(getContext(), MockLocationService.class);
        intent.setAction(MockLocationService.ACTION_STOP);
        getContext().startService(intent);

        JSObject ret = new JSObject();
        ret.put("stopped", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("running", MockLocationService.isRunning());
        call.resolve(ret);
    }
}
