package com.skanfarming;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Custom Capacitor plugin that reads raw GPS fixes directly from the GNSS chip
 * via Android's LocationManager.GPS_PROVIDER — bypassing Google's Fused Location
 * Provider (FLP) which caches/deduplicates positions.
 *
 * GPS listening runs inside {@link RawGpsService} (a foreground service with a
 * persistent notification) so Android does not throttle updates after ~30s.
 * The service broadcasts locations via Intent; this plugin receives them and
 * forwards to the JS layer via notifyListeners().
 *
 * Usage from JS:
 *   import { registerPlugin } from '@capacitor/core';
 *   const RawGps = registerPlugin('RawGps');
 *
 *   await RawGps.start({ intervalMs: 1000, minDistanceM: 0 });
 *   RawGps.addListener('rawLocation', (data) => { ... });
 *   await RawGps.stop();
 */
@CapacitorPlugin(name = "RawGps")
public class RawGpsPlugin extends Plugin {
    private static final String TAG = "RawGpsPlugin";
    private boolean isRunning = false;
    private BroadcastReceiver locationReceiver;

    @PluginMethod
    public void start(PluginCall call) {
        // If already running, stop first then restart with new params
        if (isRunning) {
            Log.i(TAG, "Already running — restarting with new params");
            stopInternal();
        }

        int intervalMs = call.getInt("intervalMs", 1000);
        float minDistanceM = call.getFloat("minDistanceM", 0f);

        Context ctx = getContext();

        // Register a broadcast receiver to pick up locations from the foreground service
        locationReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (RawGpsService.ACTION_LOCATION.equals(intent.getAction())) {
                    JSObject data = new JSObject();
                    data.put("latitude", intent.getDoubleExtra("latitude", 0));
                    data.put("longitude", intent.getDoubleExtra("longitude", 0));
                    data.put("accuracy", intent.getFloatExtra("accuracy", 0));
                    data.put("altitude", intent.getDoubleExtra("altitude", 0));
                    data.put("speed", intent.getFloatExtra("speed", 0));
                    data.put("heading", intent.getFloatExtra("heading", 0));
                    data.put("timestamp", intent.getLongExtra("timestamp", 0));
                    data.put("provider", intent.getStringExtra("provider"));
                    data.put("satellites", intent.getIntExtra("satellites", -1));
                    notifyListeners("rawLocation", data);
                }
            }
        };

        IntentFilter filter = new IntentFilter(RawGpsService.ACTION_LOCATION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ctx.registerReceiver(locationReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            ctx.registerReceiver(locationReceiver, filter);
        }

        // Guard: SDK 36+ requires location permission BEFORE startForegroundService()
        // for a location-type foreground service. Without this the service crashes the app.
        if (ActivityCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "ACCESS_FINE_LOCATION not granted — skipping RawGpsService start");
            // Clean up the receiver we just registered
            try { ctx.unregisterReceiver(locationReceiver); } catch (Exception ignored) {}
            locationReceiver = null;

            JSObject ret = new JSObject();
            ret.put("started", false);
            ret.put("reason", "LOCATION_PERMISSION_NOT_GRANTED");
            call.resolve(ret);
            return;
        }

        // Start the foreground service
        Intent serviceIntent = new Intent(ctx, RawGpsService.class);
        serviceIntent.setAction(RawGpsService.ACTION_START);
        serviceIntent.putExtra("intervalMs", (long) intervalMs);
        serviceIntent.putExtra("minDistanceM", minDistanceM);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(serviceIntent);
        } else {
            ctx.startService(serviceIntent);
        }

        isRunning = true;
        Log.i(TAG, "Started RawGpsService: interval=" + intervalMs + "ms");

        JSObject ret = new JSObject();
        ret.put("started", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopInternal();

        JSObject ret = new JSObject();
        ret.put("stopped", true);
        call.resolve(ret);
    }

    /**
     * Internal stop — tears down receiver + service without resolving a PluginCall.
     * Used by both stop() and start()-restart.
     */
    private void stopInternal() {
        Context ctx = getContext();

        // Unregister receiver
        if (locationReceiver != null) {
            try {
                ctx.unregisterReceiver(locationReceiver);
            } catch (IllegalArgumentException e) {
                // Already unregistered
            }
            locationReceiver = null;
        }

        // Stop the foreground service
        Intent serviceIntent = new Intent(ctx, RawGpsService.class);
        serviceIntent.setAction(RawGpsService.ACTION_STOP);
        ctx.startService(serviceIntent);

        isRunning = false;
        Log.i(TAG, "Stopped RawGpsService");
    }

    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("running", isRunning && RawGpsService.isRunning());
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        stopInternal();
        super.handleOnDestroy();
    }
}
