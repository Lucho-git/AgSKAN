package com.skanfarming;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;

/**
 * Foreground service that reads raw GPS fixes from LocationManager.GPS_PROVIDER.
 *
 * Running as a foreground service with a persistent notification prevents Android
 * from throttling GPS updates (which otherwise stops delivering unique fixes
 * after ~30 seconds for a bare LocationManager request without a service).
 *
 * Locations are broadcast via a local Intent so that RawGpsPlugin can pick them
 * up and forward to the JS layer.
 */
public class RawGpsService extends Service {
    private static final String TAG = "RawGpsService";
    private static final String CHANNEL_ID = "raw_gps_channel";
    private static final int NOTIFICATION_ID = 9998;

    public static final String ACTION_START = "com.skanfarming.RAW_GPS_START";
    public static final String ACTION_STOP = "com.skanfarming.RAW_GPS_STOP";
    public static final String ACTION_LOCATION = "com.skanfarming.RAW_GPS_LOCATION";

    private static volatile boolean sRunning = false;

    private LocationManager locationManager;
    private LocationListener locationListener;

    public static boolean isRunning() {
        return sRunning;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;

        String action = intent.getAction();
        if (ACTION_START.equals(action)) {
            long intervalMs = intent.getLongExtra("intervalMs", 1000);
            float minDistanceM = intent.getFloatExtra("minDistanceM", 0f);

            startForeground(NOTIFICATION_ID, buildNotification("GPS active — 1Hz mode"));

            boolean started = startLocationUpdates(intervalMs, minDistanceM);
            if (started) {
                sRunning = true;
                Log.i(TAG, "Raw GPS foreground service STARTED: interval=" + intervalMs + "ms");
            } else {
                Log.e(TAG, "Failed to start location updates — stopping service");
                sRunning = false;
                stopSelf();
            }
        } else if (ACTION_STOP.equals(action)) {
            stopLocationUpdates();
            sRunning = false;
            stopForeground(true);
            stopSelf();
            Log.i(TAG, "Raw GPS foreground service STOPPED");
        }

        return START_STICKY;
    }

    private boolean startLocationUpdates(long intervalMs, float minDistanceM) {
        Context ctx = getApplicationContext();
        locationManager = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);

        if (locationManager == null) {
            Log.e(TAG, "LocationManager not available");
            return false;
        }

        if (!locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            Log.e(TAG, "GPS provider is not enabled");
            return false;
        }

        if (ActivityCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "ACCESS_FINE_LOCATION not granted");
            return false;
        }

        locationListener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                // Broadcast location to the plugin via a local Intent
                Intent broadcast = new Intent(ACTION_LOCATION);
                broadcast.setPackage(getPackageName());
                broadcast.putExtra("latitude", location.getLatitude());
                broadcast.putExtra("longitude", location.getLongitude());
                broadcast.putExtra("accuracy", location.getAccuracy());
                broadcast.putExtra("altitude", location.getAltitude());
                broadcast.putExtra("speed", location.getSpeed());
                broadcast.putExtra("heading", location.getBearing());
                broadcast.putExtra("timestamp", location.getTime());
                broadcast.putExtra("provider", location.getProvider());

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    Bundle extras = location.getExtras();
                    if (extras != null) {
                        broadcast.putExtra("satellites", extras.getInt("satellites", -1));
                    }
                }

                sendBroadcast(broadcast);
            }

            @Override
            public void onStatusChanged(String provider, int status, Bundle extras) {
                Log.d(TAG, "Provider status changed: " + provider + " status=" + status);
            }

            @Override
            public void onProviderEnabled(String provider) {
                Log.i(TAG, "Provider enabled: " + provider);
            }

            @Override
            public void onProviderDisabled(String provider) {
                Log.w(TAG, "Provider disabled: " + provider);
            }
        };

        locationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                intervalMs,
                minDistanceM,
                locationListener,
                Looper.getMainLooper()
        );

        return true;
    }

    private void stopLocationUpdates() {
        if (locationManager != null && locationListener != null) {
            locationManager.removeUpdates(locationListener);
            locationListener = null;
            Log.i(TAG, "Location updates removed");
        }
    }

    @Override
    public void onDestroy() {
        stopLocationUpdates();
        sRunning = false;
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // ─── Notification ──────────────────────────────────────────────────

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Raw GPS Tracking",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Provides continuous 1Hz GPS updates");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(String text) {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("AgSKAN GPS")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setOngoing(true)
                .build();
    }
}
