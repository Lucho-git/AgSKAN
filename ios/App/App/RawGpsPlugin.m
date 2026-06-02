#import <Capacitor/Capacitor.h>

// Register the RawGps Swift plugin with Capacitor's plugin registry.
// This macro bridges the Swift class to ObjC so Capacitor's native loader can find it.
CAP_PLUGIN(RawGpsPlugin, "RawGps",
    CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(isRunning, CAPPluginReturnPromise);
)
