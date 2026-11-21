package com.simplymadestudio.workroaster;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Bridge between the web app and the Android-only clock pieces: the
 * "Clocked in" notification and the two home-screen widgets.
 *
 *  sync({ startedAt, profileId })  the app's clock for the active profile (0/null = not clocked in)
 *  get()                            what Android has (a widget may have clocked in while the app was closed)
 *  setSummary({ range, earned, hours, net })  figures for the pay-cycle widget
 *  notificationStatus()             { enabled, permission, sdk, maker, installer }
 *  requestNotifications()           Android's prompt (13+) when it can still be shown, then the status
 *  openNotificationSettings()       this app's page in Android's notification settings
 *  takeAction()                     "clockOut" once, after Clock out was tapped on the notification/widget
 * Event "action" ({ action: "clockOut" }) fires when that happens while the app is open.
 */
@CapacitorPlugin(
    name = "Clock",
    permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = ClockPlugin.NOTIFICATIONS) }
)
public class ClockPlugin extends Plugin {
    static final String NOTIFICATIONS = "notifications";

    @Override
    public void load() {
        // Channels exist from the first start, so Android lists WorkRoaster
        // as an app that sends notifications (some phones hide or grey out
        // the switch for apps that have none).
        ClockNotification.ensureChannel(getContext());
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
        call.resolve(status());
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState(NOTIFICATIONS) == PermissionState.GRANTED) {
            call.resolve(status());
            return;
        }
        requestPermissionForAlias(NOTIFICATIONS, call, "notificationsResult");
    }

    @PermissionCallback
    private void notificationsResult(PluginCall call) {
        ClockNotification.ensureChannel(getContext());
        ClockNotification.sync(getContext());
        call.resolve(status());
    }

    /**
     * enabled: Android will show WorkRoaster's notifications right now.
     * permission: "granted" | "prompt" (never asked) | "prompt-with-rationale"
     *   (refused once, can ask again) | "denied" (Android won't ask again).
     * installer: the app that installed WorkRoaster (Play: com.android.vending).
     * Shown in Settings so a problem on a particular phone can be told apart.
     */
    private JSObject status() {
        JSObject r = new JSObject();
        r.put("enabled", ClockNotification.canPost(getContext()));
        String permission = "granted";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            PermissionState state = getPermissionState(NOTIFICATIONS);
            permission = state == null ? "prompt" : state.toString();
        }
        r.put("permission", permission);
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("maker", ClockStore.clip(Build.MANUFACTURER, 30));
        r.put("installer", ClockStore.clip(installerPackage(), 80));
        return r;
    }

    @SuppressWarnings("deprecation")
    private String installerPackage() {
        try {
            PackageManager pm = getContext().getPackageManager();
            String pkg = getContext().getPackageName();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                String name = pm.getInstallSourceInfo(pkg).getInstallingPackageName();
                return name == null ? "" : name;
            }
            String name = pm.getInstallerPackageName(pkg);
            return name == null ? "" : name;
        } catch (Exception e) {
            return "";
        }
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
