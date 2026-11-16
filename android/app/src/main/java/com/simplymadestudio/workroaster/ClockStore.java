package com.simplymadestudio.workroaster;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * What the Android side knows about the clock-in and the current pay cycle,
 * so the notification and the home-screen widgets work while the app is
 * closed. The web app stays the source of truth: it writes here through
 * ClockPlugin, and adopts a clock-in started from a widget when it opens.
 *
 * Private app storage only (MODE_PRIVATE, excluded from backup because
 * allowBackup is false). Holds a start time and short display strings,
 * nothing else.
 */
final class ClockStore {
    private static final String PREFS = "workroaster_clock";
    private static final String STARTED_AT = "started_at";
    private static final String PROFILE_ID = "profile_id";
    private static final String PENDING_ACTION = "pending_action";
    private static final String S_RANGE = "summary_range";
    private static final String S_EARNED = "summary_earned";
    private static final String S_HOURS = "summary_hours";
    private static final String S_NET = "summary_net";
    private static final String S_SET = "summary_set";

    private ClockStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** 0 when not clocked in. */
    static long startedAt(Context context) {
        return prefs(context).getLong(STARTED_AT, 0L);
    }

    static String profileId(Context context) {
        return prefs(context).getString(PROFILE_ID, "default");
    }

    static void setClock(Context context, long startedAt, String profileId) {
        SharedPreferences.Editor e = prefs(context).edit().putLong(STARTED_AT, Math.max(0L, startedAt));
        if (profileId != null) e.putString(PROFILE_ID, profileId);
        e.apply();
    }

    static void setProfile(Context context, String profileId) {
        if (profileId != null) prefs(context).edit().putString(PROFILE_ID, profileId).apply();
    }

    static void setPendingAction(Context context, String action) {
        prefs(context).edit().putString(PENDING_ACTION, action).apply();
    }

    /** Returns the waiting action ("clockOut") once, then forgets it. */
    static String takePendingAction(Context context) {
        SharedPreferences p = prefs(context);
        String action = p.getString(PENDING_ACTION, null);
        if (action != null) p.edit().remove(PENDING_ACTION).apply();
        return action;
    }

    static void setSummary(Context context, String range, String earned, String hours, String net) {
        prefs(context).edit()
            .putBoolean(S_SET, true)
            .putString(S_RANGE, clip(range, 40))
            .putString(S_EARNED, clip(earned, 24))
            .putString(S_HOURS, clip(hours, 24))
            .putString(S_NET, clip(net, 48))
            .apply();
    }

    static boolean hasSummary(Context context) {
        return prefs(context).getBoolean(S_SET, false);
    }

    static String summaryRange(Context context) { return prefs(context).getString(S_RANGE, ""); }
    static String summaryEarned(Context context) { return prefs(context).getString(S_EARNED, ""); }
    static String summaryHours(Context context) { return prefs(context).getString(S_HOURS, ""); }
    static String summaryNet(Context context) { return prefs(context).getString(S_NET, ""); }

    /** Display strings only; never trust their length. */
    static String clip(String value, int max) {
        if (value == null) return "";
        String v = value.replaceAll("\\p{Cntrl}", " ").trim();
        return v.length() > max ? v.substring(0, max) : v;
    }
}
