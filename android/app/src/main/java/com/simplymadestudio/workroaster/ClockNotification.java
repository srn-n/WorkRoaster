package com.simplymadestudio.workroaster;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.SystemClock;
import android.text.format.DateFormat;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.util.Date;

/**
 * The "Clocked in" notification: a small icon in the status bar and, in the
 * notification panel, a timer that counts every second until clock-out.
 *
 * It is "ongoing", so "Clear all" leaves it alone. Android 14+ lets people
 * swipe even ongoing notifications away; when that happens the delete intent
 * tells ClockReceiver, which puts it straight back while still clocked in.
 * Local only: built and shown on the phone, nothing is sent anywhere.
 */
final class ClockNotification {
    static final String CHANNEL_ID = "clocked_in";
    static final int NOTIFICATION_ID = 1301;
    static final String ACTION_CLOCK_OUT = "com.simplymadestudio.workroaster.CLOCK_OUT";

    private ClockNotification() {}

    static boolean canPost(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Clocked in", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Shows a running timer while you're clocked in.");
        channel.setShowBadge(false);
        channel.enableVibration(false);
        channel.setSound(null, null);
        nm.createNotificationChannel(channel);
    }

    /** Elapsed-realtime base for a Chronometer that started at wall-clock startedAt. */
    static long chronometerBase(long startedAt) {
        long elapsed = Math.max(0L, System.currentTimeMillis() - startedAt);
        return SystemClock.elapsedRealtime() - elapsed;
    }

    static String sinceText(Context context, long startedAt) {
        String time = DateFormat.getTimeFormat(context).format(new Date(startedAt));
        long ageMs = System.currentTimeMillis() - startedAt;
        if (ageMs < 20L * 60 * 60 * 1000) return time;
        return DateFormat.getMediumDateFormat(context).format(new Date(startedAt)) + ", " + time;
    }

    static PendingIntent openApp(Context context) {
        Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, 10, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static PendingIntent clockOut(Context context) {
        Intent out = new Intent(context, MainActivity.class).setAction(ACTION_CLOCK_OUT).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, 11, out, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Shows (or refreshes) the notification if clocked in; removes it if not. */
    static void sync(Context context) {
        long startedAt = ClockStore.startedAt(context);
        if (startedAt <= 0) {
            cancel(context);
            return;
        }
        if (!canPost(context)) return;
        ensureChannel(context);

        Intent repost = new Intent(context, ClockReceiver.class).setAction(ClockReceiver.ACTION_REPOST);
        PendingIntent onDismiss = PendingIntent.getBroadcast(context, 12, repost, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        String since = sinceText(context, startedAt);
        RemoteViews big = new RemoteViews(context.getPackageName(), R.layout.notification_clock_big);
        big.setTextViewText(R.id.clock_since, "Clocked in since " + since);
        big.setChronometer(R.id.clock_timer, chronometerBase(startedAt), null, true);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_workroaster)
            .setColor(ContextCompat.getColor(context, R.color.wr_accent))
            .setContentTitle("Clocked in")
            .setContentText("Since " + since + " · stays here until you clock out")
            .setWhen(startedAt)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setCustomBigContentView(big)
            .setContentIntent(openApp(context))
            .setDeleteIntent(onDismiss)
            .addAction(0, "Clock out", clockOut(context));
        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException ignored) {
            // Permission withdrawn between the check and the post.
        }
    }

    static void cancel(Context context) {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID);
    }
}
