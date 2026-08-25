package com.megaschedule.app.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;

import com.megaschedule.app.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Home-screen widget showing today's classes, personal items and soonest
 * tasks. Data comes from a JSON snapshot the WebView app writes through
 * WidgetBridgePlugin whenever something changes.
 */
public class TodayWidgetProvider extends AppWidgetProvider {

    private static final String TAG = "KairoWidget";

    static final String PREFS = "mega_widget";
    static final String KEY_SNAPSHOT = "snapshot";
    private static final int MAX_ROWS = 6;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        Log.w(TAG, "onUpdate ids=" + appWidgetIds.length);
        RemoteViews views = buildViews(context);
        for (int id : appWidgetIds) {
            manager.updateAppWidget(id, views);
        }
    }

    /** Re-render every placed widget; called by the bridge after a snapshot write. */
    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TodayWidgetProvider.class));
        Log.w(TAG, "updateAll widgets=" + ids.length);
        if (ids.length == 0) return;
        RemoteViews views = buildViews(context);
        for (int id : ids) {
            manager.updateAppWidget(id, views);
        }
    }

    private static RemoteViews buildViews(Context context) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_today);

        // Tapping anywhere on the widget opens the app.
        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (open != null) {
            PendingIntent pi = PendingIntent.getActivity(
                context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            v.setOnClickPendingIntent(R.id.widget_root, pi);
        }

        v.setTextViewText(R.id.widget_header, headerLabel());

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_SNAPSHOT, null);
        if (raw == null) {
            Log.w(TAG, "no snapshot yet → first-run hint");
            showEmpty(v, context.getString(R.string.widget_hint_first_run));
            return v;
        }

        try {
            JSONObject snap = new JSONObject(raw);
            boolean darkTheme = "dark".equals(snap.optString("theme", "light"));
            applyTheme(v, darkTheme);

            v.removeAllViews(R.id.widget_rows);

            String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
            boolean stale = !today.equals(snap.optString("dateISO", ""));

            JSONArray rows = stale ? null : snap.optJSONArray("rows");
            int shown = 0;
            if (rows != null) {
                for (int i = 0; i < rows.length() && shown < MAX_ROWS; i++) {
                    JSONObject row = rows.getJSONObject(i);
                    RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.view_widget_class_row);
                    String time = row.optString("time", "");
                    String label = row.optString("label", "");
                    rv.setViewVisibility(R.id.widget_row_time, time.isEmpty() ? View.GONE : View.VISIBLE);
                    rv.setTextViewText(R.id.widget_row_time, time);
                    rv.setTextViewText(R.id.widget_row_name, label);
                    rv.setTextColor(R.id.widget_row_time, darkTheme ? TIME_DARK : TIME_LIGHT);
                    rv.setTextColor(R.id.widget_row_name, darkTheme ? NAME_DARK : NAME_LIGHT);
                    v.addView(R.id.widget_rows, rv);
                    shown++;
                }
            }

            if (stale) {
                showEmpty(v, context.getString(R.string.widget_hint_stale));
            } else if (shown == 0) {
                showEmpty(v, context.getString(R.string.widget_hint_no_classes));
            } else {
                v.setViewVisibility(R.id.widget_empty, View.GONE);
                v.setTextColor(R.id.widget_empty, darkTheme ? TIME_DARK : TIME_LIGHT);
            }

            renderExamLine(v, darkTheme, stale ? null : snap.optJSONObject("nextExam"));
        } catch (Exception e) {
            Log.w(TAG, "snapshot parse failed", e);
            showEmpty(v, context.getString(R.string.widget_hint_stale));
        }
        return v;
    }

    /* Palette mirrors globals.css "Soft Editorial" tokens for both modes. */
    private static final int HEADER_LIGHT = 0xFFA5A29B;
    private static final int TIME_LIGHT   = 0xFF7A7874;
    private static final int NAME_LIGHT   = 0xFF2A2A28;
    private static final int EXAM_LIGHT   = 0xFF57653F;

    private static final int HEADER_DARK  = 0xFF6E6B63;
    private static final int TIME_DARK    = 0xFF9B9890;
    private static final int NAME_DARK    = 0xFFECEAE3;
    private static final int EXAM_DARK    = 0xFFB3C79A;

    private static void applyTheme(RemoteViews v, boolean dark) {
        v.setInt(R.id.widget_root, "setBackgroundResource",
                dark ? R.drawable.widget_bg_dark : R.drawable.widget_bg);
        v.setTextColor(R.id.widget_header, dark ? HEADER_DARK : HEADER_LIGHT);
        v.setTextColor(R.id.widget_empty, dark ? TIME_DARK : TIME_LIGHT);
        v.setTextColor(R.id.widget_exam, dark ? EXAM_DARK : EXAM_LIGHT);
    }

    private static void renderExamLine(RemoteViews v, boolean darkTheme, JSONObject exam) {
        if (exam == null) {
            v.setViewVisibility(R.id.widget_exam, View.GONE);
            return;
        }
        long days = exam.optLong("daysUntil", -1);
        String title = exam.optString("title", "");
        String line;
        if (days < 0) line = "";
        else if (days == 0) line = "Exam today · " + title;
        else if (days == 1) line = "Exam tomorrow · " + title;
        else line = "Next exam in " + days + " days · " + title;
        if (line.isEmpty()) {
            v.setViewVisibility(R.id.widget_exam, View.GONE);
        } else {
            v.setTextViewText(R.id.widget_exam, line);
            v.setTextColor(R.id.widget_exam, darkTheme ? EXAM_DARK : EXAM_LIGHT);
            v.setViewVisibility(R.id.widget_exam, View.VISIBLE);
        }
    }

    private static void showEmpty(RemoteViews v, String message) {
        v.removeAllViews(R.id.widget_rows);
        v.setViewVisibility(R.id.widget_empty, View.VISIBLE);
        v.setTextViewText(R.id.widget_empty, message);
        v.setViewVisibility(R.id.widget_exam, View.GONE);
    }

    private static String headerLabel() {
        String date = new SimpleDateFormat("EEE d MMM", Locale.getDefault()).format(new Date());
        return ("TODAY · " + date).toUpperCase(Locale.getDefault());
    }
}
