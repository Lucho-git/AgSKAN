// capacitor.config.ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.skanfarming',
    appName: 'AgSKAN',
    webDir: 'build', // Corrected based on previous discussion
    bundledWebRuntime: false,
    server: {
        androidScheme: 'https',
        cleartext: true
    },
    plugins: {
        SplashScreen: {
            launchShowDuration: 2000,
            backgroundColor: "#f9e58a",
            androidSplashResourceName: "splash",
            androidScaleType: "CENTER_CROP"
        },
        EdgeToEdge: {
            backgroundColor: "#f9e58a"
        },
    },

    android: {
        versionName: "1.0.2",
        versionCode: 3,
        // adjustMarginsForEdgeToEdge: 'force',
    }
};

export default config;