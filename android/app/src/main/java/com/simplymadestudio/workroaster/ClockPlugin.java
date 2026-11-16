package com.simplymadestudio.workroaster;

import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge between the web app and the Android-only clock pieces: the
 * "Clocked in" notification and the two home-screen widgets.
 *
 *  sync({ startedAt, profileId })  the app's clock for the active profile (0/null = not clocked in)
 *  get()                            what Android has (a widget may have clocked in while the app was closed)
 *  setSummary({ range, earned, hours, net })  figures for the pay-cycle widget
 *  notificationStatus()             { enabled }
 *  openNotificationSettings()       this app's page in Android's notification settings
 *  takeAction()                     "clockOut" once, after Clock out was tapped on the notification/widget
 * Event "action" ({ action: "clockOut" }) fires when that happens while the app is open.
 */
@CapacitorPlugin(name = "Clock")
public class ClockPlugin extends Plugin {

    @Override
    public void load() {
        if (getActivity() != null) remember(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (remember(intent)) {
            JSObject data = new JSObject();
            data.put("action", "clockOut");
            notifyListeners("action", data, true);
        }
    }

    private boolean remember(Intent intent) {
        if (intent == null || !ClockNotification.ACTION_CLOCK_OUT.equals(intent.getAction())) return false;
        ClockStore.setPendingAction(getContext(), "clockOut");
        intent.setAction(Intent.ACTION_MAIN); // don't repeat it after a rotation
        return true;
    }

    @PluginMethod
    public void sync(PluginCall call) {
        Long startedAt = call.getLong("startedAt", 0L);
        long value = startedAt == null ? 0L : startedAt;
        long now = System.currentTimeMillis();
        // Same limits as storage.js#loadClock: not in the future, not older than 7 days.
        if (value > now + 60_000L || value < now - 7L * 24 * 60 * 60 * 1000) value = 0L;
        String profileId = ClockStore.clip(call.getString("profileId", "default"), 64);
        ClockStore.setClock(getContext(), value, profileId);
        ClockNotification.sync(getContext());
        ClockWidget.updateAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void get(PluginCall call) {
        JSObject result = new JSObject();
        result.put("startedAt", ClockStore.startedAt(getContext()));
        result.put("profileId", ClockStore.profileId(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void setSummary(PluginCall call) {
        ClockStore.setSummary(getContext(),
            call.getString("range", ""), call.getString("earned", ""),
            call.getString("hours", ""), call.getString("net", ""));
        SummaryWidget.updateAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void notificationStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", ClockNotification.canPost(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(android.net.Uri.fromParts("package", getContext().getPackageName(), null));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("Couldn't open notification settings.");
        }
    }

    @PluginMethod
    public void takeAction(PluginCall call) {
        JSObject result = new JSObject();
        String action = ClockStore.takePendingAction(getContext());
        if (action != null) result.put("action", action);
        call.resolve(result);
    }
}
