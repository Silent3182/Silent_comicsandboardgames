/* Skaner kodów kreskowych (EAN-13 / ISBN / EAN-8 / UPC) aparatem telefonu albo kamerką komputera.
 *   const kod = await Skaner.open({ title:'Skanuj kod' })   -> '9788328106614' | '9771234567003+05' | null
 * Najpierw próbuje wbudowanego BarcodeDetector (Chrome na Androidzie), a gdy go nie ma (np. Windows),
 * dociąga bibliotekę ZXing (zxing.min.js, MIT) z tego samego folderu – działa offline.
 * Kody czasopism (977…, np. kolekcje Hachette) mają obok małe 2–5 cyfr z numerem tomu; ZXing umie je
 * odczytać i dopisuje jako „+NN”.
 * Zawsze można też wpisać kod ręcznie albo zrobić zdjęcie (gdy aparat w podglądzie nie działa).
 */
(function () {
  const BASE = (document.currentScript && document.currentScript.src) ? document.currentScript.src.replace(/skaner\.js.*$/, '') : 'moduly/sklep/';
  let zxp = null;
  function loadZXing() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    if (!zxp) zxp = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = BASE + 'zxing.min.js';
      s.onload = () => res(window.ZXing); s.onerror = () => { zxp = null; rej(new Error('Nie mogę wczytać czytnika kodów')); };
      document.head.appendChild(s);
    });
    return zxp;
  }

  /* Suma kontrolna EAN-8/EAN-13/UPC-A – odrzuca błędne odczyty. */
  function validEan(code) {
    const d = String(code || '').split('+')[0];
    if (!/^(\d{8}|\d{12}|\d{13})$/.test(d)) return false;
    const n = d.padStart(13, '0').split('').map(Number);
    const sum = n.slice(0, 12).reduce((a, x, i) => a + x * (i % 2 ? 3 : 1), 0);
    return (10 - sum % 10) % 10 === n[12];
  }
  /* ISBN-10 → EAN-13 (ludzie czasem przepisują ISBN z tyłu książki). */
  function normCode(raw) {
    let s = String(raw || '').toUpperCase().replace(/[^0-9X+]/g, '');
    const [main, ext] = s.split('+');
    let m = main;
    if (/^\d{9}[\dX]$/.test(m)) { const b = '978' + m.slice(0, 9); const sum = b.split('').reduce((a, x, i) => a + +x * (i % 2 ? 3 : 1), 0); m = b + ((10 - sum % 10) % 10); }
    if (/^\d{12}$/.test(m) && !validEan(m)) m = '0' + m; // UPC-A zapisany bez zera
    return ext ? m + '+' + ext : m;
  }
  const isIsbn = c => /^97[89]\d{10}$/.test(String(c).split('+')[0]);
  const isIssn = c => /^977\d{10}$/.test(String(c).split('+')[0]);

  let zxReader = null;
  function zxDecode(Z, canvas) {
    if (!zxReader) {
      zxReader = new Z.MultiFormatReader();
      const hints = new Map();
      hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
      hints.set(Z.DecodeHintType.TRY_HARDER, true);
      zxReader.setHints(hints);
    }
    try {
      const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
      const r = zxReader.decodeWithState(bmp);
      let txt = r.getText();
      const md = r.getResultMetadata && r.getResultMetadata();
      const ext = md && md.get && md.get(Z.ResultMetadataType.UPC_EAN_EXTENSION);
      if (ext) txt += '+' + ext;
      return txt;
    } catch (e) { return null; }
  }

  let bdp = null;
  function nativeDetector() {
    if (!bdp) bdp = (async () => {
      if (!('BarcodeDetector' in window)) return null;
      try {
        const f = await window.BarcodeDetector.getSupportedFormats();
        if (!f.includes('ean_13')) return null;
        return new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'].filter(x => f.includes(x)) });
      } catch (e) { return null; }
    })();
    return bdp;
  }

  /* Odczyt kodu ze zdjęcia (plik). */
  async function decodeImage(file) {
    const img = await createImageBitmap(file);
    const det = await nativeDetector();
    if (det) { try { const r = await det.detect(img); const ok = r.map(x => x.rawValue).find(validEan); if (ok) { if (!isIssn(ok)) return ok; } } catch (e) { /* dalej ZXing */ } }
    const Z = await loadZXing();
    const c = document.createElement('canvas');
    const sc = Math.min(1, 1600 / Math.max(img.width, img.height));
    c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const t = zxDecode(Z, c);
    return t && validEan(t) ? t : null;
  }

  function css() {
    if (document.getElementById('skn-css')) return;
    const st = document.createElement('style'); st.id = 'skn-css';
    st.textContent = `
.skn{position:fixed;inset:0;z-index:1000;background:#000;color:#fff;display:flex;flex-direction:column}
.skn video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.skn .frame{position:absolute;left:50%;top:42%;width:min(82vw,420px);height:min(34vw,170px);transform:translate(-50%,-50%);border-radius:14px;box-shadow:0 0 0 9999px rgba(0,0,0,.45);border:2px solid rgba(255,255,255,.85)}
.skn .frame::after{content:"";position:absolute;left:8%;right:8%;top:50%;height:2px;background:#ff5a4a;box-shadow:0 0 8px #ff5a4a;animation:skn 1.6s ease-in-out infinite alternate}
@keyframes skn{from{transform:translateY(-38px)}to{transform:translateY(38px)}}
.skn .top{position:relative;padding:calc(14px + env(safe-area-inset-top)) 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(rgba(0,0,0,.6),transparent)}
.skn .top h3{margin:0;font-size:17px;flex:1;color:#fff}
.skn .msg{position:absolute;left:16px;right:16px;top:calc(42% + min(17vw,85px) + 18px);text-align:center;font-size:14px;color:#eee;text-shadow:0 1px 3px #000}
.skn .bot{position:absolute;left:0;right:0;bottom:0;padding:12px 16px calc(16px + env(safe-area-inset-bottom));display:flex;gap:8px;flex-wrap:wrap;justify-content:center;background:linear-gradient(transparent,rgba(0,0,0,.7))}
.skn button,.skn label.b{background:rgba(255,255,255,.16);color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:10px 16px;font-size:15px;cursor:pointer;min-height:44px;display:inline-flex;align-items:center;gap:6px}
.skn button.on{background:#fff;color:#000}
.skn form{display:flex;gap:8px;width:100%;max-width:460px}
.skn form input{flex:1;min-width:0;font-size:18px;padding:10px 12px;border-radius:10px;border:0;letter-spacing:1px}
.skn.nocam .frame{display:none}
.skn [hidden]{display:none!important}
`;
    document.head.appendChild(st);
  }

  function open(opt = {}) {
    css();
    return new Promise(resolve => {
      const ov = document.createElement('div');
      ov.className = 'skn';
      ov.innerHTML = `<video playsinline muted></video><div class="frame"></div>
        <div class="top"><h3>${App.ui.esc(opt.title || 'Skanuj kod kreskowy')}</h3><button class="x" aria-label="Zamknij">✕</button></div>
        <div class="msg">Uruchamiam aparat…</div>
        <div class="bot">
          <form class="man"><input inputmode="numeric" autocomplete="off" placeholder="albo wpisz kod / ISBN" enterkeyhint="search"><button>OK</button></form>
          <label class="b">🖼 Zdjęcie<input type="file" accept="image/*" capture="environment" hidden></label>
          <button class="torch" hidden>🔦 Latarka</button>
        </div>`;
      document.body.appendChild(ov);
      const video = ov.querySelector('video'), msg = ov.querySelector('.msg');
      let stream = null, done = false, timer = null;
      const canvas = document.createElement('canvas');

      const finish = code => {
        if (done) return; done = true;
        clearTimeout(timer);
        if (stream) stream.getTracks().forEach(t => t.stop());
        ov.remove();
        window.removeEventListener('popstate', onBack);
        if (code && navigator.vibrate) navigator.vibrate(80);
        resolve(code ? normCode(code) : null);
      };
      const onBack = () => finish(null);
      window.addEventListener('popstate', onBack);
      ov.querySelector('.x').onclick = () => finish(null);
      ov.querySelector('form.man').onsubmit = e => {
        e.preventDefault();
        const v = normCode(ov.querySelector('form.man input').value);
        if (!v) return;
        if (/^\d{8,13}(\+\d{2,5})?$/.test(v) && !validEan(v)) { msg.textContent = 'Ten kod ma błędną cyfrę kontrolną – sprawdź go jeszcze raz.'; return; }
        finish(v);
      };
      ov.querySelector('input[type=file]').onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        msg.textContent = 'Szukam kodu na zdjęciu…';
        try { const c = await decodeImage(f); if (c) return finish(c); msg.textContent = 'Nie widzę kodu na zdjęciu. Zrób zdjęcie bliżej, tylko samego kodu.'; }
        catch (err) { msg.textContent = 'Nie udało się odczytać zdjęcia: ' + App.ui.komunikat(err); }
      };

      (async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          ov.classList.add('nocam'); msg.textContent = 'Aparat niedostępny – wpisz kod albo zrób zdjęcie.'; return;
        }
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
        } catch (e) {
          ov.classList.add('nocam');
          msg.textContent = e && e.name === 'NotAllowedError' ? 'Brak zgody na aparat. Zezwól w ustawieniach albo wpisz kod ręcznie.' : 'Nie mogę włączyć aparatu – wpisz kod albo zrób zdjęcie.';
          return;
        }
        if (done) { stream.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = stream;
        try { await video.play(); } catch (e) { /* autoplay */ }
        const track = stream.getVideoTracks()[0];
        try {
          const caps = track.getCapabilities ? track.getCapabilities() : {};
          if (caps.torch) {
            const tb = ov.querySelector('.torch'); tb.hidden = false; let on = false;
            tb.onclick = async () => { on = !on; try { await track.applyConstraints({ advanced: [{ torch: on }] }); tb.classList.toggle('on', on); } catch (e) { /* brak */ } };
          }
          if (caps.focusMode && caps.focusMode.includes('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        } catch (e) { /* brak */ }
        msg.textContent = 'Nakieruj kod kreskowy w ramkę';
        const det = await nativeDetector();
        let Z = null;
        if (!det) { try { Z = await loadZXing(); } catch (e) { msg.textContent = App.ui.komunikat(e) + ' – wpisz kod ręcznie.'; return; } }
        let last = null, hits = 0;
        const grab = () => {
          // środek obrazu (tam jest ramka) – szybciej i pewniej
          const vw = video.videoWidth, vh = video.videoHeight;
          if (!vw) return null;
          const cw = Math.round(vw * 0.9), ch = Math.round(vh * 0.5);
          canvas.width = Math.min(cw, 1000); canvas.height = Math.round(canvas.width * ch / cw);
          canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, (vw - cw) / 2, (vh - ch) * 0.42, cw, ch, 0, 0, canvas.width, canvas.height);
          return canvas;
        };
        const tick = async () => {
          if (done) return;
          let code = null;
          try {
            if (det) {
              const r = await det.detect(video);
              code = (r.map(x => x.rawValue).find(validEan)) || null;
              if (code && isIssn(code)) {
                // kod czasopisma: spróbuj doczytać numer z małego kodu obok (ZXing)
                try { Z = Z || await loadZXing(); const c = grab(); const t = c && zxDecode(Z, c); if (t && t.startsWith(code + '+')) code = t; } catch (e) { /* zostaje bez numeru */ }
              }
            } else {
              const c = grab(); const t = c && zxDecode(Z, c);
              code = t && validEan(t) ? t : null;
            }
          } catch (e) { /* klatka bez kodu */ }
          if (code) {
            // dwa takie same odczyty z rzędu = pewny wynik
            if (code === last) hits++; else { last = code; hits = 1; }
            if (hits >= 2 || (det && !isIssn(code))) return finish(code);
          }
          timer = setTimeout(tick, det ? 120 : 60);
        };
        tick();
      })();
    });
  }

  window.Skaner = { open, validEan, normCode, isIsbn, isIssn, decodeImage, loadZXing };
})();
