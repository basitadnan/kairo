package com.megaschedule.app.widget;

import android.content.Context;
import android.util.Log;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Tiny bridge: the web app hands us a JSON snapshot of "today" and we persist
 * it for the widget, then refresh every placed widget immediately.
 */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    private static final String TAG = "KairoWidget";

    /** Trivial round-trip so the web side can verify the bridge from JS. */
    @PluginMethod
    public void ping(PluginCall call) {
        Log.w(TAG, "ping received — bridge OK");
        call.resolve();
    }

    @PluginMethod
    public void saveSnapshot(PluginCall call) {
        Log.w(TAG, "saveSnapshot called (" + String.valueOf(call.getString("json", "")).length() + " chars)");
        String json = call.getString("json");
        if (json == null || json.isEmpty()) {
            Log.w(TAG, "saveSnapshot rejected: empty json");
            call.reject("json is required");
            return;
        }
        try {
            Context context = getContext();
            context.getSharedPreferences(TodayWidgetProvider.PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(TodayWidgetProvider.KEY_SNAPSHOT, json)
                .apply();
            Log.w(TAG, "snapshot persisted, refreshing widgets");
            TodayWidgetProvider.updateAll(context);
            call.resolve();
        } catch (Exception e) {
            Log.w(TAG, "saveSnapshot failed", e);
            call.reject("snapshot write failed: " + e.getMessage());
        }
    }
}
