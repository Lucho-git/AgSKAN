package com.skanfarming;

import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.Plugin;
import android.content.Intent;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;

// ModifiedMainActivityForSocialLoginPlugin is VERY VERY important !!!!!!
public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register custom native plugins so JS can call them
        registerPlugin(MockLocationPlugin.class);
        registerPlugin(RawGpsPlugin.class);
        super.onCreate(savedInstanceState);

        createMessageNotificationChannel();
    }

    // High-importance "Messages" channel so message pushes arrive as heads-up
    // banner notifications. OneSignal payloads reference this channel via
    // existing_android_channel_id ("agskan_messages").
    private void createMessageNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null && manager.getNotificationChannel("agskan_messages") == null) {
                NotificationChannel channel = new NotificationChannel(
                        "agskan_messages",
                        "Messages",
                        NotificationManager.IMPORTANCE_HIGH);
                channel.setDescription("Direct messages and important updates from your team");
                channel.enableVibration(true);
                channel.setShowBadge(true);
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
            if (pluginHandle == null) {
                Log.i("Google Activity Result", "SocialLogin login handle is null");
                return;
            }
            Plugin plugin = pluginHandle.getInstance();
            if (!(plugin instanceof SocialLoginPlugin)) {
                Log.i("Google Activity Result", "SocialLogin plugin instance is not SocialLoginPlugin");
                return;
            }
            ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
        }
    }

    // This function will never be called, leave it empty
    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}
}