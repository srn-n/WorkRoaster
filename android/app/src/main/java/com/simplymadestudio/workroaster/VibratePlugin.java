package com.simplymadestudio.workroaster;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * "Vibrate on taps" (Settings → Appearance → Vibration, off by default).
 *
 * Uses the vibrator directly instead of the view's haptic feedback, which
 * Android silences whenever the phone's own "touch vibration" is off; the
 * person's choice inside WorkRoaster decides instead. Android still keeps it
 * silent if vibration is switched off for the whole phone. Needs only the
 * VIBRATE permission (granted at install, no prompt, no data involved).
 */
@CapacitorPlugin(name = "Vibrate")
public class VibratePlugin extends Plugin {

    // light, medium, strong. Amplitude is 1–255 where the motor supports it;
    // otherwise only the length changes.
    private static final long[] DURATION_MS = { 12, 20, 32 };
    private static final int[] AMPLITUDE = { 70, 150, 255 };
    private static final long[] FALLBACK_MS = { 8, 16, 30 };

    private Vibrator vibrator;

    @Override
    public void load() {
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            vibrator = manager == null ? null : manager.getDefaultVibrator();
        } else {
            vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
        }
    }

    static int strengthIndex(String strength) {
        if ("light".equals(strength)) return 0;
        if ("strong".equals(strength)) return 2;
        return 1;
    }

    @PluginMethod
    @SuppressWarnings("deprecation")
    public void tap(PluginCall call) {
        JSObject result = new JSObject();
        if (vibrator == null || !vibrator.hasVibrator()) {
            result.put("vibrated", false);
            call.resolve(result);
            return;
        }
        int i = strengthIndex(call.getString("strength", "medium"));
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                VibrationEffect effect = vibrator.hasAmplitudeControl()
                    ? VibrationEffect.createOneShot(DURATION_MS[i], AMPLITUDE[i])
                    : VibrationEffect.createOneShot(FALLBACK_MS[i], VibrationEffect.DEFAULT_AMPLITUDE);
                vibrator.vibrate(effect);
            } else {
                vibrator.vibrate(FALLBACK_MS[i]);
            }
            result.put("vibrated", true);
        } catch (RuntimeException e) {
            // A vendor build refusing to vibrate is not worth an error in the page.
            result.put("vibrated", false);
        }
        call.resolve(result);
    }
}
