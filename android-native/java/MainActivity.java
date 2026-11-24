package pl.silent.mojekolekcje;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidzetPlugin.class); // widżet „Następny komiks”
        super.onCreate(savedInstanceState);
    }
}
