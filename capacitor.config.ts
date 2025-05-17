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
            launchShowDuration: 3000,
            launchAutoHide: true,
            launchFadeOutDuration: 500,
            backgroundColor: "#ffffffff",
            androidSplashResourceName: "splash",
            androidScaleType: "CENTER_CROP",
            showSpinner: true,
            androidSpinnerStyle: "large",
            iosSpinnerStyle: "small",
            spinnerColor: "#999999",
            splashFullScreen: true,
            splashImmersive: true,
            layoutName: "launch_screen",
            useDialog: true,
        },
        EdgeToEdge: {
            backgroundColor: "#f9e58a"
        },
    },

    android: {
        versionName: "1.0.3",
        versionCode: 4,
        // adjustMarginsForEdgeToEdge: 'force',
    }
};

export default config;