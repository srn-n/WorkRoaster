package com.simplymadestudio.workroaster;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Not exported: only the app's own PendingIntents and the system (boot,
 * app update) can reach it.
 *  - REPOST: the clocked-in notification was swiped away; show it again.
 *  - WIDGET_CLOCK_IN: "Clock in" tapped on the home-screen widget.
 *  - BOOT_COMPLETED / MY_PACKAGE_REPLACED: bring the notification and the
 *    widgets back after a restart or an update.
 */
public class ClockReceiver extends BroadcastReceiver {
    static final String ACTION_REPOST = "com.simplymadestudio.workroaster.CLOCK_REPOST";
    static final String ACTION_WIDGET_CLOCK_IN = "com.simplymadestudio.workroaster.WIDGET_CLOCK_IN";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_WIDGET_CLOCK_IN.equals(action)) {
            if (ClockStore.startedAt(context) <= 0) {
                ClockStore.setClock(context, System.currentTimeMillis(), null);
            }
        } else if (!ACTION_REPOST.equals(action)
            && !Intent.ACTION_BOOT_COMPLETED.equals(action)
            && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            return;
        }
        ClockNotification.sync(context);
        ClockWidget.updateAll(context);
        SummaryWidget.updateAll(context);
    }
}
