package com.simplymadestudio.workroaster;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins must be registered before the bridge starts.
        registerPlugin(SaveFilePlugin.class);
        super.onCreate(savedInstanceState);

        // Defence in depth. Capacitor serves two internal routes to the page:
        // /_capacitor_file_/ (any file in the app's private storage) and
        // /_capacitor_content_/ (other apps' content, read as WorkRoaster).
        // WorkRoaster never uses them; only a script running inside the app
        // could, and the Content-Security-Policy already stops foreign
        // scripts. Closing them means even an injected script would find
        // nothing to read. The check mirrors Capacitor's own (decoded path
        // prefix), so no URL spelling reaches one and not the other.
        bridge.setWebViewClient(
            new BridgeWebViewClient(bridge) {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    if (isInternalFileRoute(request.getUrl())) {
                        return new WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", null, null);
                    }
                    return super.shouldInterceptRequest(view, request);
                }
            }
        );
    }

    static boolean isInternalFileRoute(Uri url) {
        String path = url == null ? null : url.getPath();
        return path != null && (path.startsWith(Bridge.CAPACITOR_FILE_START) || path.startsWith(Bridge.CAPACITOR_CONTENT_START));
    }
}
