package com.megaschedule.app;

import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.megaschedule.app.widget.WidgetBridgePlugin;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "KairoWidget";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must run BEFORE super.onCreate(): BridgeActivity.onCreate ends with
        // load() → builder.create(), which consumes the pending plugin list.
        registerPlugin(WidgetBridgePlugin.class);
        super.onCreate(savedInstanceState);
        Log.w(TAG, "Kairo started — WidgetBridge registered");
    }
}
