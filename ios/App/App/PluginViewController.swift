import UIKit
import Capacitor

class PluginViewController: CAPBridgeViewController {
    private var currentStatusBarStyle: UIStatusBarStyle = .default
    
    override open func viewDidLoad() {
        super.viewDidLoad()
        
        DispatchQueue.main.async {
            self.setupWebViewPadding()
            self.updateAppearance()
        }
    }
    
    override open func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        
        DispatchQueue.main.async {
            self.setupWebViewPadding()
            self.updateAppearance()
        }
    }
    
    override open func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        setupWebViewPadding()
    }
    
    override var preferredStatusBarStyle: UIStatusBarStyle {
        return currentStatusBarStyle
    }
    
    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        
        if #available(iOS 13.0, *) {
            if traitCollection.userInterfaceStyle != previousTraitCollection?.userInterfaceStyle {
                updateAppearance()
            }
        }
    }
    
    private func updateAppearance() {
        if #available(iOS 13.0, *) {
            let isDarkMode = traitCollection.userInterfaceStyle == .dark
            
            if isDarkMode {
                // Dark mode: yellow background
                let yellowColor = UIColor(red: 249/255, green: 229/255, blue: 138/255, alpha: 1.0)
                view.backgroundColor = yellowColor
                
                // Set the window's background - this colors the status bar and home indicator areas
                if let window = view.window {
                    window.backgroundColor = yellowColor
                }
                
                currentStatusBarStyle = .darkContent
            } else {
                // Light mode: dark gray background
                let darkGrayColor = UIColor(red: 16/255, green: 32/255, blue: 48/255, alpha: 1.0)
                view.backgroundColor = darkGrayColor
                
                // Set the window's background - this colors the status bar and home indicator areas
                if let window = view.window {
                    window.backgroundColor = darkGrayColor
                }
                
                currentStatusBarStyle = .lightContent
            }
            
            setNeedsStatusBarAppearanceUpdate()
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
