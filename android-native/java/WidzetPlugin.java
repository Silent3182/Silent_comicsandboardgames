package pl.silent.mojekolekcje;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Most między aplikacją (JS) a widżetem: ustaw(kolejka) i odbierz(odznaczone na widżecie). */
@CapacitorPlugin(name = "Widzet")
public class WidzetPlugin extends Plugin {
    @PluginMethod
    public void ustaw(PluginCall call) {
        String lista = call.getString("lista", "[]");
        WidzetCzytanie.prefs(getContext()).edit().putString("lista", lista).apply();
        WidzetCzytanie.odswiez(getContext());
        call.resolve();
    }

    @PluginMethod
    public void odbierz(PluginCall call) {
        JSObject r = new JSObject();
        r.put("przeczytane", WidzetCzytanie.odbierz(getContext()));
        WidzetCzytanie.odswiez(getContext());
        call.resolve(r);
    }
}
