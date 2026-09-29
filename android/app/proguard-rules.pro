# ─────────────────────────────────────────────────────────────────────
# AgSKAN — ProGuard / R8 rules
#
# Enabled 2026-09-29: Play Console flagged "DEX code optimisation"
# (obfuscation was 2% because release builds shipped with
# minifyEnabled false). Capacitor's own consumer rules already keep
# plugin classes — the rules below cover the WebView bridge, our
# custom native plugins and readable crash reports.
# ─────────────────────────────────────────────────────────────────────

# WebView ⇄ JS bridge (Capacitor Bridge, @JavascriptInterface methods)
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Capacitor plugins are loaded reflectively via capacitor.plugins.json
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.PluginMethod public <methods>;
}
-keep public class * extends com.getcapacitor.Plugin { *; }

# Our native code — custom plugins (RawGps, MockLocation), GNSS/mock
# services and MainActivity. Kept as one block so reflective lookups and
# logcat/crash-report class names stay stable.
-keep class com.skanfarming.** { *; }

# Attributes needed by reflection-based libraries (Gson etc. used by the
# background-geolocation / OneSignal stacks)
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod

# Keep source file + line numbers so Play/Studio can de-obfuscate traces
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
