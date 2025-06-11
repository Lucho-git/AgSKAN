export interface Article {
    id: string          // Keep for internal use
    slug: string        // New: URL-friendly identifier
    title: string
    content: string
    category: string
    categorySlug: string // New: URL-friendly category
    lastUpdated: string
    readTime: string
    excerpt: string
}

export const articles: Article[] = [
    // Getting Started articles
    {
        id: "1",
        slug: "getting-started-with-agskan",
        title: "Getting Started with AgSKAN",
        content: `Welcome to AgSKAN! This guide will help you get up and running quickly.

**Step 1: Download the App**
Download AgSKAN from the App Store or Google Play Store on all devices you plan to use for tracking.

**Step 2: Create Your Account**
Sign up with your email address and verify your account through the confirmation email.

**Step 3: Set Up Your First Paddock**
1. Tap "Add Paddock" on the main screen
2. Draw your paddock boundaries by walking or driving the perimeter
3. Name your paddock for easy identification
4. Save your paddock

**Step 4: Start Tracking**
Simply start the app when you begin work in any paddock. AgSKAN will automatically track your movement and show your progress in real-time.

**Tips for Success:**
- Ensure all team members have the app installed
- Test the system on a small paddock first
- Keep your devices charged for full-day tracking

For more detailed setup instructions, check out our [Setting Up Your Farm Profile](/knowledge-base/article/setting-up-farm-profile) guide.

Need help? Contact our support team at support@skanfarming.com.au`,
        category: "Getting Started",
        categorySlug: "getting-started",
        lastUpdated: "May 9, 2025",
        readTime: "3 min",
        excerpt: "Learn how to set up AgSKAN and start tracking your first paddock in minutes."
    },
    {
        id: "2",
        slug: "setting-up-farm-profile",
        title: "Setting Up Your Farm Profile",
        content: `Your farm profile helps AgSKAN provide personalized features and better support.

**Adding Farm Details**
Go to Settings > Farm Profile and add:
- Farm name and location
- Primary crop types
- Average paddock sizes
- Number of operators

**Configuring Notifications**
Set up alerts for:
- Low battery warnings
- GPS signal issues
- Completed paddock notifications
- Daily summary reports

**Managing Team Members**
Invite team members by:
1. Going to Settings > Team Management
2. Sending invitation emails
3. Assigning roles and permissions

If you're having trouble with team coordination, our [Multi-User Tracking](/knowledge-base/article/multiple-people-same-paddock) guide has helpful tips.

**Privacy Settings**
Control what data is shared and how your information is used through the Privacy section in Settings.

For troubleshooting common setup issues, see our [GPS Signal Issues](/knowledge-base/article/gps-signal-issues) article.`,
        category: "Getting Started",
        categorySlug: "getting-started",
        lastUpdated: "May 8, 2025",
        readTime: "4 min",
        excerpt: "Configure your farm profile and team settings for optimal AgSKAN performance."
    },

    // Troubleshooting articles
    {
        id: "3",
        slug: "gps-signal-issues",
        title: "GPS Signal Issues",
        content: `If you're experiencing GPS problems, try these solutions:

**Check Your Location Settings**
1. Ensure location services are enabled for AgSKAN
2. Set permission to "Always" (not just "While Using App")
3. Enable high accuracy mode in your device settings

**Improve Signal Strength**
- Move to an open area away from buildings
- Remove any device cases that might block GPS
- Restart the AgSKAN app
- Toggle airplane mode on/off to refresh connections

**Device-Specific Solutions**

*Android:*
- Go to Settings > Apps > AgSKAN > Permissions
- Ensure Location is set to "Allow all the time"
- Check if battery optimization is disabled for AgSKAN

*iOS:*
- Settings > Privacy & Security > Location Services
- Find AgSKAN and set to "Always"
- Enable "Precise Location"

**Still Having Issues?**
Contact support with:
- Your device model and OS version
- Screenshots of permission settings
- Description of when the issue occurs

If you're still experiencing problems, you might also want to check our [App Crashes and Performance](/knowledge-base/article/app-crashes-performance) guide for additional solutions.`,
        category: "Troubleshooting",
        categorySlug: "troubleshooting",
        lastUpdated: "May 7, 2025",
        readTime: "5 min",
        excerpt: "Resolve GPS and location tracking problems with these step-by-step solutions."
    },
    {
        id: "4",
        slug: "app-crashes-performance",
        title: "App Crashes and Performance",
        content: `If AgSKAN is crashing or running slowly, follow these troubleshooting steps:

**Basic Troubleshooting**
1. Force close and restart the app
2. Restart your device
3. Ensure you have the latest app version
4. Check available storage space (need at least 1GB free)

**Clear App Cache (Android)**
1. Settings > Apps > AgSKAN
2. Storage > Clear Cache
3. Restart the app

**Reinstall the App**
If problems persist:
1. Export any important data first
2. Uninstall AgSKAN
3. Restart your device
4. Reinstall from app store
5. Log back into your account

**Check System Requirements**
- iOS 12.0 or later
- Android 8.0 or later
- Minimum 2GB RAM
- Active internet connection

**Performance Tips**
- Close other apps running in background
- Disable unnecessary notifications
- Use power saving mode sparingly
- Keep device updated

Contact support if issues continue after trying these steps.

For location-related issues, check our [GPS Signal Issues](/knowledge-base/article/gps-signal-issues) guide.`,
        category: "Troubleshooting",
        categorySlug: "troubleshooting",
        lastUpdated: "May 6, 2025",
        readTime: "4 min",
        excerpt: "Fix app crashes and improve AgSKAN performance with these troubleshooting tips."
    },

    // FAQ articles
    {
        id: "5",
        slug: "data-usage",
        title: "How much data does AgSKAN use?",
        content: `AgSKAN is designed to be data-efficient for rural internet connections.

**Typical Data Usage**
- Light usage (1-2 hours/day): ~10-20MB per month
- Moderate usage (4-6 hours/day): ~30-50MB per month  
- Heavy usage (8+ hours/day): ~60-100MB per month

**What Uses Data**
- Initial map downloads: 5-10MB per paddock
- Real-time location updates: 1-2MB per hour
- Syncing with team: 2-3MB per hour
- Photo uploads: 1-3MB per photo

**Reducing Data Usage**
- Download maps over WiFi before heading to field
- Use offline mode when possible
- Limit photo uploads to essential documentation
- Sync data overnight when on WiFi

**Offline Capability**
AgSKAN works offline for up to 8 hours:
- GPS tracking continues without internet
- Data syncs automatically when connection restored
- Core features remain available

**Data-Saving Tips**
- Pre-load paddocks on WiFi
- Use standard quality for photos
- Enable background app refresh only for AgSKAN
- Monitor usage in your device settings

For team coordination with limited connectivity, see our [Multi-User Tracking](/knowledge-base/article/multiple-people-same-paddock) article.`,
        category: "FAQs",
        categorySlug: "faqs",
        lastUpdated: "May 5, 2025",
        readTime: "3 min",
        excerpt: "Learn about AgSKAN's data usage and how to minimize it for rural connections."
    },
    {
        id: "6",
        slug: "multiple-people-same-paddock",
        title: "Can multiple people track the same paddock?",
        content: `Yes! AgSKAN supports multiple operators working in the same paddock simultaneously.

**How Multi-User Tracking Works**
- Each operator appears as a different colored trail
- Real-time location sharing shows where everyone is working
- Automatic overlap detection prevents duplication
- Live updates every 30 seconds when online

**Setting Up Team Tracking**
1. Farm owner invites team members via email
2. Each person installs AgSKAN and accepts invitation
3. All team members can see shared paddocks
4. Individual tracking starts automatically

For detailed setup instructions, see our [Setting Up Your Farm Profile](/knowledge-base/article/setting-up-farm-profile) guide.

**Team Features**
- See all operators on one map
- Color-coded trails for each person
- Progress tracking for the whole team
- Communication through map annotations

**Permission Levels**
- Owner: Full access to all features
- Manager: Can add/edit paddocks, view all data
- Operator: Can track assigned paddocks, view own data
- Viewer: Read-only access to maps and progress

**Best Practices**
- Ensure all devices have accurate time settings
- Use descriptive operator names
- Regularly sync when internet is available
- Communicate role changes clearly

**Conflict Resolution**
If overlapping work is detected, AgSKAN will:
- Alert both operators
- Suggest coordination
- Track actual coverage to prevent gaps

For connectivity concerns with multiple users, check our [Data Usage](/knowledge-base/article/data-usage) guide.`,
        category: "FAQs",
        categorySlug: "faqs",
        lastUpdated: "May 4, 2025",
        readTime: "4 min",
        excerpt: "Understand how multiple team members can efficiently track work in shared paddocks."
    }
]

// Updated helper functions
export function getArticlesByCategory(category: string): Article[] {
    return articles.filter(article =>
        article.category === category || article.categorySlug === category
    )
}

export function getArticleById(id: string): Article | undefined {
    return articles.find(article => article.id === id)
}

export function getArticleBySlug(slug: string): Article | undefined {
    return articles.find(article => article.slug === slug)
}

export function getRelatedArticles(articleSlug: string, limit: number = 3): Article[] {
    const currentArticle = getArticleBySlug(articleSlug)
    if (!currentArticle) return []

    return articles
        .filter(article =>
            article.slug !== articleSlug &&
            article.category === currentArticle.category
        )
        .slice(0, limit)
}

export function getAllCategories(): string[] {
    return [...new Set(articles.map(article => article.category))]
}

export function searchArticles(query: string): Article[] {
    const searchTerm = query.toLowerCase()
    return articles.filter(article =>
        article.title.toLowerCase().includes(searchTerm) ||
        article.content.toLowerCase().includes(searchTerm) ||
        article.excerpt.toLowerCase().includes(searchTerm)
    )
}