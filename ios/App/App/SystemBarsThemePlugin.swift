import UIKit
import Capacitor

/// Bridges the web app's theme to the native shell on iOS.
///
/// The web app's `data-theme` attribute is the single source of truth for the
/// "screen header": when it changes, `$lib/systemBars.ts` calls setTheme and
/// this plugin repaints the window background behind the (inset) status bar
/// and switches the status bar icon style — keeping the header consistent with
/// the app's own theme instead of the system dark/light preference.
@objc(SystemBarsThemePlugin)
public class SystemBarsThemePlugin: CAPPlugin {
    @objc func setTheme(_ call: CAPPluginCall) {
        let dark = call.getBool("dark") ?? false
        DispatchQueue.main.async { [weak self] in
            if let vc = self?.bridge?.viewController as? PluginViewController {
                vc.applySystemBarsTheme(darkAppTheme: dark)
            }
            call.resolve()
        }
    }
}
