package com.simplymadestudio.workroaster;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Home-screen widget: "Clock in" when idle; while clocked in, a timer
 * counting every second and a "Clock out" button (which opens the app to
 * fill in the record, the same as clocking out inside the app).
 *
 * Exported only because Android requires it for widgets. It handles the
 * standard APPWIDGET_* broadcasts only (via AppWidgetProvider); the clock-in
 * tap goes to the non-exported ClockReceiver through an immutable
 * PendingIntent.
 */
public class ClockWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (manager == null) return;
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, ClockWidget.class));
        if (ids == null || ids.length == 0) return;
        RemoteViews views = build(context);
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    static RemoteViews build(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_clock);
        long startedAt = ClockStore.startedAt(context);
        boolean running = startedAt > 0;

        views.setOnClickPendingIntent(R.id.widget_root, ClockNotification.openApp(context));
        views.setViewVisibility(R.id.clock_idle_text, running ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.clock_timer, running ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.btn_clock_in, running ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.btn_clock_out, running ? View.VISIBLE : View.GONE);

        if (running) {
            views.setTextViewText(R.id.clock_label, "Clocked in since " + ClockNotification.sinceText(context, startedAt));
            views.setChronometer(R.id.clock_timer, ClockNotification.chronometerBase(startedAt), null, true);
            views.setOnClickPendingIntent(R.id.btn_clock_out, ClockNotification.clockOut(context));
        } else {
            views.setTextViewText(R.id.clock_label, "WorkRoaster");
            views.setChronometer(R.id.clock_timer, 0L, null, false);
            Intent in = new Intent(context, ClockReceiver.class).setAction(ClockReceiver.ACTION_WIDGET_CLOCK_IN);
            PendingIntent clockIn = PendingIntent.getBroadcast(context, 20, in, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            views.setOnClickPendingIntent(R.id.btn_clock_in, clockIn);
        }
        return views;
    }
}
