package com.simplymadestudio.workroaster;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Home-screen widget: the current pay cycle, as at the top of the app
 * (dates, earned so far, hours worked, after-tax estimate if turned on).
 * The app writes the figures whenever they change (ClockPlugin.setSummary);
 * tapping opens WorkRoaster. Exported only because widgets must be; it
 * handles the standard APPWIDGET_* broadcasts only.
 */
public class SummaryWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (manager == null) return;
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, SummaryWidget.class));
        if (ids == null || ids.length == 0) return;
        RemoteViews views = build(context);
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    static RemoteViews build(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_summary);
        views.setOnClickPendingIntent(R.id.widget_root, ClockNotification.openApp(context));
        if (!ClockStore.hasSummary(context)) {
            views.setTextViewText(R.id.summary_range, "This pay cycle");
            views.setTextViewText(R.id.summary_earned, "—");
            views.setTextViewText(R.id.summary_hours, "Open WorkRoaster once to show your pay cycle here.");
            views.setViewVisibility(R.id.summary_net, View.GONE);
            return views;
        }
        String range = ClockStore.summaryRange(context);
        views.setTextViewText(R.id.summary_range, range.isEmpty() ? "This pay cycle" : "This pay cycle · " + range);
        views.setTextViewText(R.id.summary_earned, ClockStore.summaryEarned(context));
        views.setTextViewText(R.id.summary_hours, ClockStore.summaryHours(context));
        String net = ClockStore.summaryNet(context);
        views.setTextViewText(R.id.summary_net, net);
        views.setViewVisibility(R.id.summary_net, net.isEmpty() ? View.GONE : View.VISIBLE);
        return views;
    }
}
