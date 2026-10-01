import UIKit
import Capacitor

class PluginViewController: CAPBridgeViewController {
    private var currentStatusBarStyle: UIStatusBarStyle = .default

    // Register custom local plugins with the Capacitor bridge
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(RawGpsPlugin())
        bridge?.registerPluginInstance(SystemBarsThemePlugin())
    }
    
    override open func viewDidLoad() {
        super.viewDidLoad()
        
        // Clear URL cache on app launch to prevent network issues
        URLCache.shared.removeAllCachedResponses()
        
        // Also clear cookies if needed
        if let cookies = HTTPCookieStorage.shared.cookies {
            for cookie in cookies {
                HTTPCookieStorage.shared.deleteCookie(cookie)
            }
        }
        
        DispatchQueue.main.async {
            self.setupWebViewPadding()
            self.refreshThemeFromWebApp()
        }
    }
    
    override open func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        
        DispatchQueue.main.async {
            self.setupWebViewPadding()
            self.refreshThemeFromWebApp()
        }
    }
    
    override open func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        setupWebViewPadding()
    }
    
    override var preferredStatusBarStyle: UIStatusBarStyle {
        return currentStatusBarStyle
    }
    
    /// Applies the APP theme (pushed from the web via SystemBarsThemePlugin).
    /// The app's data-theme is the single source of truth — the system
    /// dark/light preference is only ever a seeding fallback on the web side.
    /// Dark app theme → yellow bars + dark icons; light → dark grey + light icons.
    func applySystemBarsTheme(darkAppTheme: Bool) {
        if #available(iOS 13.0, *) {
            let backgroundColor = darkAppTheme
                ? UIColor(red: 249/255, green: 229/255, blue: 138/255, alpha: 1.0) // brand yellow
                : UIColor(red: 16/255, green: 32/255, blue: 48/255, alpha: 1.0)    // dark grey

            // The web view is inset below the status bar, so the window/view
            // background is what shows behind it (status + home indicator areas).
            view.backgroundColor = backgroundColor
            if let window = view.window {
                window.backgroundColor = backgroundColor
            }

            currentStatusBarStyle = darkAppTheme ? .darkContent : .lightContent
            setNeedsStatusBarAppearanceUpdate()
        }
    }

    /// First paint: read the web app's data-theme (the source of truth).
    /// Before the web app has set it, fall back to the system trait — matching
    /// the web side's seeding behaviour.
    private func refreshThemeFromWebApp() {
        webView?.evaluateJavaScript(
            "document.documentElement.getAttribute('data-theme') || ''"
        ) { [weak self] result, _ in
            guard let self = self else { return }
            let theme = (result as? String) ?? ""

            if theme == "skanthemedark" {
                self.applySystemBarsTheme(darkAppTheme: true)
            } else if theme == "skantheme" {
                self.applySystemBarsTheme(darkAppTheme: false)
            } else if #available(iOS 13.0, *) {
                self.applySystemBarsTheme(
                    darkAppTheme: self.traitCollection.userInterfaceStyle == .dark
                )
            } else {
                self.applySystemBarsTheme(darkAppTheme: false)
            }
        }
    }
    
    private func setupWebViewPadding() {
        guard let webView = self.webView else { return }
        
        var topPadding: CGFloat = 0
        var bottomPadding: CGFloat = 0
        var leftPadding: CGFloat = 0
        var rightPadding: CGFloat = 0
        
        if #available(iOS 13.0, *) {
            let window = view.window ?? UIApplication.shared.windows.first { $0.isKeyWindow }
            topPadding = window?.safeAreaInsets.top ?? 0
            bottomPadding = window?.safeAreaInsets.bottom ?? 0
            leftPadding = window?.safeAreaInsets.left ?? 0
            rightPadding = window?.safeAreaInsets.right ?? 0
        } else {
            topPadding = UIApplication.shared.statusBarFrame.height
        }
        
        webView.frame.origin = CGPoint(x: leftPadding, y: topPadding)
        webView.frame.size = CGSize(
            width: UIScreen.main.bounds.width - leftPadding - rightPadding,
            height: UIScreen.main.bounds.height - topPadding - bottomPadding
        )
        
        webView.backgroundColor = UIColor.white
        webView.isOpaque = true
    }
}

