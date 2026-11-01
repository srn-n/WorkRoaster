package com.simplymadestudio.workroaster;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * "Save as" for exports and backups. A WebView ignores <a download>, so the
 * app hands the finished file here instead. Android's own save dialog
 * (Storage Access Framework) lets the person choose the folder or Drive, so
 * the app needs no storage permission and never sees any other file.
 * Nothing is sent anywhere: the bytes go straight to the chosen location.
 */
@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {

    // The only kinds of file WorkRoaster makes. Anything else is saved as
    // generic data, so the page can't ask Android to treat it as, say, an
    // installable app package.
    private static final Set<String> ALLOWED_TYPES = new HashSet<>(
        Arrays.asList(
            "application/pdf",
            "image/jpeg",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/json",
            "text/csv"
        )
    );

    // Real exports and backups are a few MB; refuse anything absurd rather
    // than run the phone out of memory decoding it.
    private static final int MAX_BASE64_CHARS = 40 * 1024 * 1024;

    @PluginMethod
    public void save(PluginCall call) {
        String filename = call.getString("filename");
        String data = call.getString("data");
        String requestedType = call.getString("mimeType", "application/octet-stream");
        String mimeType = ALLOWED_TYPES.contains(requestedType) ? requestedType : "application/octet-stream";
        if (filename == null || filename.isEmpty() || data == null) {
            call.reject("Missing file name or contents.");
            return;
        }
        if (data.length() > MAX_BASE64_CHARS) {
            call.reject("The file is too large to save.");
            return;
        }
        // A display name only (the person picks the folder); no path parts.
        filename = filename.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        if (filename.length() > 120) {
            filename = filename.substring(0, 120);
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, "onLocationChosen");
    }

    @ActivityCallback
    private void onLocationChosen(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        JSObject ret = new JSObject();
        Intent resultData = result.getData();
        Uri uri = resultData == null ? null : resultData.getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            ret.put("saved", false);
            call.resolve(ret);
            return;
        }
        try {
            byte[] bytes = Base64.decode(call.getString("data"), Base64.DEFAULT);
            try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "w")) {
                if (out == null) {
                    throw new IOException("The chosen location could not be opened.");
                }
                out.write(bytes);
            }
            ret.put("saved", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("The file could not be saved.", e);
        }
    }
}
