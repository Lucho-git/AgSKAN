import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.skanfarming',
    appName: 'AgSKAN',
    webDir: 'build',
    bundledWebRuntime: false,
    server: {
        androidScheme: 'https',
        cleartext: true,
        allowNavigation: ['*'],
        // For iOS, you might need to specify hostname
        hostname: 'localhost',
        iosScheme: 'capacitor'
    },
    plugins: {
        SplashScreen: {
            launchShowDuration: 3000,
            launchAutoHide: false, // Set to false and manually hide
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
        CapacitorHttp: {
            enabled: true
        }
    },
    android: {
        versionName: "1.0.5",
        versionCode: 5,
    },
    ios: {
        limitsNavigationsToAppBoundDomains: false,
    }
};

export default config;
