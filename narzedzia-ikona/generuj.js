// Generuje wszystkie ikony aplikacji z jednego pliku SVG (grupy #bg = tło, #fg = rysunek).
// Użycie: node narzedzia-ikona/generuj.js narzedzia-ikona/propozycja-b.svg
// Tworzy: icons/icon.svg, icons/icon-192.png, icons/icon-512.png, icons/icon-maskable-512.png
// oraz ikony Androida (adaptive icon) w android-native/res/mipmap-*.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const src = process.argv[2] || path.join(__dirname, 'ikona.svg');
const svg = fs.readFileSync(src, 'utf8').replace(/<\?xml[^>]*>/, '');
const DPI = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  // size = wymiar PNG; scale = jaka część kanwy zajmuje rysunek; radius = zaokrąglenie; hide = ukryta warstwa
  async function png(out, size, { scale = 1, radius = '0', hide = '' } = {}) {
    const inner = size * scale;
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<style>html,body{margin:0;background:transparent}
      #k{width:${size}px;height:${size}px;border-radius:${radius};overflow:hidden;display:flex;align-items:center;justify-content:center}
      svg{width:${inner}px;height:${inner}px;flex:none} ${hide ? '#' + hide + '{display:none}' : ''}</style><div id="k">${svg}</div>`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await p.screenshot({ path: out, omitBackground: true });
  }
  const I = (f) => path.join(ROOT, 'icons', f);
  await png(I('icon-192.png'), 192, { radius: '22%' });
  await png(I('icon-512.png'), 512, { radius: '22%' });
  // maskable: tło na całość, rysunek zmniejszony do bezpiecznej strefy (koło 80%)
  await png(I('icon-maskable-512.png'), 512, { hide: 'fg' });
  const bgOnly = fs.readFileSync(I('icon-maskable-512.png'));
  await png(path.join(__dirname, '.fg.png'), 512, { scale: 0.84, hide: 'bg' });
  await p.setViewportSize({ width: 512, height: 512 });
  await p.setContent(`<style>body{margin:0}img{position:absolute;top:0;left:0;width:512px}</style>
    <img src="data:image/png;base64,${bgOnly.toString('base64')}"><img src="data:image/png;base64,${fs.readFileSync(path.join(__dirname, '.fg.png')).toString('base64')}">`);
  await p.screenshot({ path: I('icon-maskable-512.png') });
  fs.unlinkSync(path.join(__dirname, '.fg.png'));
  // SVG dla przeglądarki: zaokrąglone rogi
  fs.writeFileSync(I('icon.svg'), svg.replace(/(<svg[^>]*>)/, '$1<clipPath id="zaokr"><rect width="512" height="512" rx="112"/></clipPath><g clip-path="url(#zaokr)">').replace(/<\/svg>\s*$/, '</g></svg>\n'));

  const RES = path.join(ROOT, 'android-native', 'res');
  for (const [d, k] of Object.entries(DPI)) {
    const M = (f) => path.join(RES, 'mipmap-' + d, f);
    await png(M('ic_launcher.png'), 48 * k, { radius: '22%' });            // starsze Androidy
    await png(M('ic_launcher_round.png'), 48 * k, { radius: '50%' });
    await png(M('ic_launcher_foreground.png'), 108 * k, { scale: 72 / 108, hide: 'bg' }); // Android 8+
    await png(M('ic_launcher_background.png'), 108 * k, { hide: 'fg' });
  }
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
  fs.mkdirSync(path.join(RES, 'mipmap-anydpi-v26'), { recursive: true });
  fs.writeFileSync(path.join(RES, 'mipmap-anydpi-v26', 'ic_launcher.xml'), xml);
  fs.writeFileSync(path.join(RES, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), xml);
  await b.close();
  console.log('Ikony gotowe z', path.basename(src));
})();
