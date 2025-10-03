import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.skanfarming',
    appName: 'AgSKAN',
    webDir: 'build',
    bundledWebRuntime: false,
    server: {
        androidScheme: 'https',
        iosScheme: 'https',
        cleartext: true,
        allowNavigation: ['*'],
        hostname: 'localhost',
    },
    plugins: {
        SplashScreen: {
            launchShowDuration: 3000,
            launchAutoHide: false,
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
        versionName: "2.31",
        versionCode: 231,
    },
    ios: {
        limitsNavigationsToAppBoundDomains: false,
    }
};

export default config;