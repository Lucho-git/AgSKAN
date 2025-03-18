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
    }
};

export default config;