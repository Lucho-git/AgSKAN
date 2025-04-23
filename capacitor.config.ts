import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.skanfarming',
    appName: 'AgSKAN',
    webDir: 'public',
    bundledWebRuntime: false,
    server: {
        androidScheme: 'https',
        cleartext: true  // Allow cleartext traffic for development
    },
    plugins: {
        SplashScreen: {
            launchShowDuration: 2000,
            backgroundColor: "#f9e58a",
            androidSplashResourceName: "splash",
            androidScaleType: "CENTER_CROP"
        },
        StatusBar: {
            style: "DARK",
            backgroundColor: "#f9e58a"
        }
    },
    android: {
        versionName: "1.0.1", // Update this for each release
        versionCode: 2,       // Increment this for each release
        // other Android-specific options
    }
};

export default config;