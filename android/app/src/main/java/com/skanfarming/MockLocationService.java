package com.skanfarming;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.location.Criteria;
import android.location.Location;
import android.location.LocationManager;
import android.location.provider.ProviderProperties;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.SystemClock;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * Android ForegroundService that injects mock GPS locations into the system.
 * Because it runs as a foreground service, Android will NOT kill it when the
 * WebView is frozen — exactly what we need to simulate background driving.
 *
 * The mock locations are picked up by transistorsoft's BackgroundGeolocation
 * plugin as if they were real GPS readings, exercising the full pipeline:
 *   mock GPS → onLocation → native HTTP POST → background_sync RPC → DB
 *
 * Supports two movement patterns:
 *   "rectangle"  — drives a rectangular loop (farm field pattern)
 *   "circle"     — drives in a circle around the start point
 *
 * To use this, the device must have Developer Options → "Select mock location app"
 * set to this app (AgSKAN).
 */
public class MockLocationService extends Service {
    private static final String TAG = "MockLocationSvc";
    private static final String CHANNEL_ID = "mock_location_channel";
    private static final int NOTIFICATION_ID = 9999;
    public static final String ACTION_START = "com.skanfarming.MOCK_START";
    public static final String ACTION_STOP = "com.skanfarming.MOCK_STOP";

    private static volatile boolean sRunning = false;

    private HandlerThread handlerThread;
    private Handler handler;
    private LocationManager locationManager;

    // Route state
    private double currentLat;
    private double currentLng;
    private double startLat;
    private double startLng;
    private long intervalMs = 3000;
    private double stepMeters = 15;
    private String pattern = "rectangle";
    private int tickCount = 0;
    private float currentHeading = 0f; // degrees
    private int legIndex = 0;   // which leg of the rectangle (0-3)
    private int legTicks = 0;   // ticks along current leg
    private static final int TICKS_PER_LEG = 20; // ~300 m per leg at 15 m step

    private final Runnable tickRunnable = new Runnable() {
        @Override
        public void run() {
            injectLocation();
            tickCount++;
            if (sRunning && handler != null) {
                handler.postDelayed(this, intervalMs);
            }
        }
    };

    public static boolean isRunning() {
        return sRunning;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;

        String action = intent.getAction();
        if (ACTION_START.equals(action)) {
            startLat = intent.getDoubleExtra("latitude", -33.8688);
            startLng = intent.getDoubleExtra("longitude", 151.2093);
            currentLat = startLat;
            currentLng = startLng;
            intervalMs = intent.getLongExtra("intervalMs", 3000);
            stepMeters = intent.getDoubleExtra("stepMeters", 15);
            pattern = intent.getStringExtra("pattern");
            if (pattern == null) pattern = "rectangle";
            tickCount = 0;
            legIndex = 0;
            legTicks = 0;
            currentHeading = 0f;

            startForeground(NOTIFICATION_ID, buildNotification("Simulating GPS movement…"));
            setupMockProvider();
            startSimulation();
            sRunning = true;
            Log.i(TAG, "Mock location simulation STARTED at " + currentLat + ", " + currentLng);
        } else if (ACTION_STOP.equals(action)) {
            stopSimulation();
            sRunning = false;
            stopForeground(true);
            stopSelf();
            Log.i(TAG, "Mock location simulation STOPPED");
        }
        return START_NOT_STICKY;
    }

    @Nullable @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        stopSimulation();
        sRunning = false;
        super.onDestroy();
    }

    // ─── Mock provider setup ───────────────────────────────────────────

    private void setupMockProvider() {
        try {
            // Remove existing mock provider if any
            try {
                locationManager.removeTestProvider(LocationManager.GPS_PROVIDER);
            } catch (Exception ignored) {}

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // API 31+: use ProviderProperties
                locationManager.addTestProvider(
                    LocationManager.GPS_PROVIDER,
                    false, false, false, false, true, true, true,
                    ProviderProperties.POWER_USAGE_LOW,
                    ProviderProperties.ACCURACY_FINE
                );
            } else {
                locationManager.addTestProvider(
                    LocationManager.GPS_PROVIDER,
                    false, false, false, false, true, true, true,
                    Criteria.POWER_LOW,
                    Criteria.ACCURACY_FINE
                );
            }
            locationManager.setTestProviderEnabled(LocationManager.GPS_PROVIDER, true);
            Log.i(TAG, "Mock GPS provider registered");
        } catch (SecurityException e) {
            Log.e(TAG, "Cannot set mock location — is this app selected as 'Mock location app' in Developer Options?", e);
        } catch (Exception e) {
            Log.e(TAG, "Failed to register mock provider", e);
        }
    }

    private void tearDownMockProvider() {
        try {
            locationManager.setTestProviderEnabled(LocationManager.GPS_PROVIDER, false);
            locationManager.removeTestProvider(LocationManager.GPS_PROVIDER);
            Log.i(TAG, "Mock GPS provider removed");
        } catch (Exception ignored) {}
    }

    // ─── Simulation loop ───────────────────────────────────────────────

    private void startSimulation() {
        if (handlerThread != null) return;
        handlerThread = new HandlerThread("MockLocationThread");
        handlerThread.start();
        handler = new Handler(handlerThread.getLooper());
        handler.post(tickRunnable);
    }

    private void stopSimulation() {
        if (handler != null) {
            handler.removeCallbacks(tickRunnable);
        }
        if (handlerThread != null) {
            handlerThread.quitSafely();
            handlerThread = null;
            handler = null;
        }
        tearDownMockProvider();
    }

    // ─── Location injection ────────────────────────────────────────────

    private void injectLocation() {
        advancePosition();

        Location loc = new Location(LocationManager.GPS_PROVIDER);
        loc.setLatitude(currentLat);
        loc.setLongitude(currentLng);
        loc.setAltitude(50.0);
        loc.setAccuracy(5.0f);
        loc.setBearing(currentHeading);
        loc.setSpeed((float)(stepMeters / (intervalMs / 1000.0))); // m/s
        loc.setTime(System.currentTimeMillis());
        loc.setElapsedRealtimeNanos(SystemClock.elapsedRealtimeNanos());

        try {
            locationManager.setTestProviderLocation(LocationManager.GPS_PROVIDER, loc);
            if (tickCount % 10 == 0) {
                Log.d(TAG, "📍 Tick #" + tickCount + " → " +
                    String.format("%.6f, %.6f", currentLat, currentLng) +
                    " hdg=" + currentHeading + " leg=" + legIndex);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to inject location", e);
        }
    }

    /**
     * Advance position along the current movement pattern.
     * "rectangle" traces a rectangular field ~300m × 300m.
     * "circle" traces a circle of radius ~300m around the start point.
     */
    private void advancePosition() {
        if ("circle".equals(pattern)) {
            // Circle: rotate around startLat/startLng at ~300 m radius
            double radiusM = TICKS_PER_LEG * stepMeters / (2 * Math.PI) * 4;
            double angleDeg = (tickCount * 360.0) / (TICKS_PER_LEG * 4);
            double angleRad = Math.toRadians(angleDeg);
            double dLat = (radiusM * Math.cos(angleRad)) / 111_320.0;
            double dLng = (radiusM * Math.sin(angleRad)) / (111_320.0 * Math.cos(Math.toRadians(startLat)));
            currentLat = startLat + dLat;
            currentLng = startLng + dLng;
            currentHeading = (float)((angleDeg + 90) % 360);
        } else {
            // Rectangle: 4 legs, TICKS_PER_LEG ticks each
            // Headings: 0=North, 90=East, 180=South, 270=West
            float[] headings = {0f, 90f, 180f, 270f};
            currentHeading = headings[legIndex % 4];

            double stepLat = 0, stepLng = 0;
            switch (legIndex % 4) {
                case 0: stepLat = stepMeters / 111_320.0; break;               // North
                case 1: stepLng = stepMeters / (111_320.0 * Math.cos(Math.toRadians(currentLat))); break; // East
                case 2: stepLat = -stepMeters / 111_320.0; break;              // South
                case 3: stepLng = -stepMeters / (111_320.0 * Math.cos(Math.toRadians(currentLat))); break; // West
            }
            currentLat += stepLat;
            currentLng += stepLng;

            legTicks++;
            if (legTicks >= TICKS_PER_LEG) {
                legTicks = 0;
                legIndex = (legIndex + 1) % 4;
            }
        }
    }

    // ─── Notification ──────────────────────────────────────────────────

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Mock Location Simulation",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Simulates GPS movement for testing");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(String text) {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("AgSKAN GPS Simulator")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .build();
    }
}
