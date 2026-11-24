package pl.silent.mojekolekcje;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

/**
 * Widżet „Następny komiks” (Master Reading Order).
 * Dane w SharedPreferences "widzet_czytanie":
 *   lista        – JSON [{id, i, sec, title, info}] – kolejka od aplikacji
 *   przeczytane  – JSON [{id, i, sec, title, at}]   – odznaczone na widżecie, czekają na aplikację
 */
public class WidzetCzytanie extends AppWidgetProvider {
    static final String PREFS = "widzet_czytanie";
    static final String OK = "pl.silent.mojekolekcje.WIDZET_PRZECZYTANE";
    static final String COFNIJ = "pl.silent.mojekolekcje.WIDZET_COFNIJ";

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONArray arr(Context c, String key) {
        try { return new JSONArray(prefs(c).getString(key, "[]")); } catch (JSONException e) { return new JSONArray(); }
    }

    /** Zwraca [następny, kolejny] (bez pozycji już odznaczonych na widżecie). */
    static synchronized JSONObject[] nastepne(Context c) {
        JSONArray lista = arr(c, "lista"), done = arr(c, "przeczytane");
        Set<String> ids = new HashSet<>();
        for (int k = 0; k < done.length(); k++) ids.add(done.optJSONObject(k).optString("id"));
        JSONObject[] out = new JSONObject[2];
        int n = 0;
        for (int k = 0; k < lista.length() && n < 2; k++) {
            JSONObject o = lista.optJSONObject(k);
            if (o != null && !ids.contains(o.optString("id"))) out[n++] = o;
        }
        return out;
    }

    static synchronized void oznacz(Context c) {
        JSONObject n = nastepne(c)[0];
        if (n == null) return;
        JSONArray done = arr(c, "przeczytane");
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            JSONObject x = new JSONObject();
            x.put("id", n.optString("id"));
            x.put("i", n.optInt("i"));
            x.put("sec", n.optString("sec"));
            x.put("title", n.optString("title"));
            x.put("at", f.format(new Date()));
            done.put(x);
        } catch (JSONException e) { return; }
        prefs(c).edit().putString("przeczytane", done.toString()).commit();
    }

    static synchronized void cofnij(Context c) {
        JSONArray done = arr(c, "przeczytane");
        if (done.length() == 0) return;
        done.remove(done.length() - 1);
        prefs(c).edit().putString("przeczytane", done.toString()).commit();
    }

    static synchronized String odbierz(Context c) {
        String s = prefs(c).getString("przeczytane", "[]");
        prefs(c).edit().putString("przeczytane", "[]").commit();
        return s;
    }

    static void odswiez(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, WidzetCzytanie.class));
        for (int id : ids) m.updateAppWidget(id, widok(c));
    }

    static RemoteViews widok(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widzet_czytanie);
        JSONObject[] n = nastepne(c);
        int odznaczone = arr(c, "przeczytane").length();
        if (n[0] == null) {
            v.setTextViewText(R.id.wz_tytul, arr(c, "lista").length() == 0 ? "Otwórz aplikację, żeby wczytać kolejkę" : "Koniec kolejki – otwórz aplikację");
            v.setTextViewText(R.id.wz_info, "");
            v.setTextViewText(R.id.wz_dalej, "");
            v.setViewVisibility(R.id.wz_ok, View.GONE);
        } else {
            v.setTextViewText(R.id.wz_tytul, n[0].optString("title"));
            v.setTextViewText(R.id.wz_info, n[0].optString("info"));
            v.setTextViewText(R.id.wz_dalej, n[1] != null ? "Dalej: " + n[1].optString("title") : "");
            v.setViewVisibility(R.id.wz_ok, View.VISIBLE);
        }
        v.setViewVisibility(R.id.wz_cofnij, odznaczone > 0 ? View.VISIBLE : View.GONE);
        int fl = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        v.setOnClickPendingIntent(R.id.wz_ok, PendingIntent.getBroadcast(c, 1, new Intent(c, WidzetCzytanie.class).setAction(OK), fl));
        v.setOnClickPendingIntent(R.id.wz_cofnij, PendingIntent.getBroadcast(c, 2, new Intent(c, WidzetCzytanie.class).setAction(COFNIJ), fl));
        Intent open = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setOnClickPendingIntent(R.id.wz_tresc, PendingIntent.getActivity(c, 3, open, fl));
        return v;
    }

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, widok(c));
    }

    @Override
    public void onReceive(Context c, Intent i) {
        super.onReceive(c, i);
        if (OK.equals(i.getAction())) { oznacz(c); odswiez(c); }
        else if (COFNIJ.equals(i.getAction())) { cofnij(c); odswiez(c); }
    }
}
