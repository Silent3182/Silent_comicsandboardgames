package pl.silent.mojekolekcje;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.graphics.Point;
import android.graphics.RectF;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

/**
 * Odczyt napisów ze zdjęcia półki (ML Kit, na telefonie, bez internetu).
 * Zdjęcie czytane w 3 obrotach (0°, 90°, 270°), żeby złapać też pionowe napisy na grzbietach.
 * Wynik: teksty = [{t, x0, y0, x1, y1, obrot}] – prostokąty w ułamkach (0–1) oryginalnego zdjęcia.
 */
@CapacitorPlugin(name = "Ocr")
public class OcrPlugin extends Plugin {
    @PluginMethod
    public void rozpoznaj(PluginCall call) {
        String b64 = call.getString("obraz");
        if (b64 == null) { call.reject("Brak zdjęcia"); return; }
        int k = b64.indexOf(',');
        if (k >= 0) b64 = b64.substring(k + 1);
        Bitmap src;
        try {
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            src = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Exception e) { call.reject("Złe zdjęcie"); return; }
        if (src == null) { call.reject("Złe zdjęcie"); return; }
        int w = src.getWidth(), h = src.getHeight();
        TextRecognizer rec = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        JSArray out = new JSArray();
        try {
            for (int deg : new int[]{0, 90, 270}) {
                Matrix m = new Matrix();
                m.postRotate(deg);
                RectF r = new RectF(0, 0, w, h);
                m.mapRect(r);
                m.postTranslate(-r.left, -r.top);
                Bitmap bmp = deg == 0 ? src : Bitmap.createBitmap(src, 0, 0, w, h, m, true);
                Matrix inv = new Matrix();
                m.invert(inv);
                Text t = Tasks.await(rec.process(InputImage.fromBitmap(bmp, 0)));
                for (Text.TextBlock b : t.getTextBlocks()) {
                    for (Text.Line l : b.getLines()) dodaj(out, l.getText(), l.getCornerPoints(), inv, w, h, deg);
                    if (b.getLines().size() > 1) dodaj(out, b.getText().replace('\n', ' '), b.getCornerPoints(), inv, w, h, deg);
                }
                if (bmp != src) bmp.recycle();
            }
            JSObject res = new JSObject();
            res.put("teksty", out);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("Rozpoznawanie nie powiodło się: " + e.getMessage());
        } finally {
            rec.close();
        }
    }

    private static void dodaj(JSArray out, String txt, Point[] pts, Matrix inv, int w, int h, int deg) {
        if (txt == null || pts == null || pts.length == 0) return;
        float[] p = new float[pts.length * 2];
        for (int i = 0; i < pts.length; i++) { p[2 * i] = pts[i].x; p[2 * i + 1] = pts[i].y; }
        inv.mapPoints(p);
        float x0 = Float.MAX_VALUE, y0 = Float.MAX_VALUE, x1 = -Float.MAX_VALUE, y1 = -Float.MAX_VALUE;
        for (int i = 0; i < pts.length; i++) {
            x0 = Math.min(x0, p[2 * i]); x1 = Math.max(x1, p[2 * i]);
            y0 = Math.min(y0, p[2 * i + 1]); y1 = Math.max(y1, p[2 * i + 1]);
        }
        JSObject o = new JSObject();
        o.put("t", txt);
        o.put("x0", Math.max(0, x0 / w));
        o.put("y0", Math.max(0, y0 / h));
        o.put("x1", Math.min(1, x1 / w));
        o.put("y1", Math.min(1, y1 / h));
        o.put("obrot", deg);
        out.put(o);
    }
}
