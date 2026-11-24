/* Skróty: szybkie przejście do Board Game Arena i forów (menu „Więcej” → Skróty).
 * Własne skróty zapisane w ustawieniu 'skroty' (synchronizują się jak reszta danych).
 * Android (APK): link https otwiera Android – jeśli zainstalowana aplikacja BGA obsługuje swoje linki,
 * otworzy się ona, inaczej przeglądarka. Windows: zwykła karta przeglądarki. */
(function () {
  const STALE = [
    { id: 'bga', title: 'Board Game Arena', opis: 'Dołącz do gry', url: 'https://pl.boardgamearena.com/join', ikona: '🎲' },
    { id: 'komikspec', title: 'Forum Komikspec', opis: 'komikspec.pl', url: 'https://komikspec.pl/', ikona: '💬' },
    { id: 'gry-planszowe', title: 'Forum Gry-Planszowe', opis: 'forum.gry-planszowe.pl', url: 'https://forum.gry-planszowe.pl/', ikona: '🧩' },
  ];
  const css = `
.sk-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin-top:12px}
.sk-a{display:flex;gap:14px;align-items:center;padding:16px;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);color:var(--text);text-decoration:none;box-shadow:var(--shadow);min-height:72px}
.sk-a:active{transform:scale(.98)}
.sk-a .i{font-size:28px;width:44px;height:44px;display:grid;place-items:center;border-radius:12px;background:var(--accent-soft,rgba(127,127,127,.12))}
.sk-a .t{font-weight:700}.sk-a .s{font-size:13px;color:var(--muted);word-break:break-all}
.sk-a .x{margin-left:auto;border:0;background:none;color:var(--muted);font-size:18px;padding:6px;cursor:pointer}`;

  const esc = s => App.ui.esc(s);
  async function wlasne() { return (await DB.setting('skroty')) || []; }

  function otworz(url) {
    const w = window.open(url, '_blank', 'noopener');
    if (!w) location.href = url;
  }

  async function render(el) {
    const moje = await wlasne();
    const all = STALE.concat(moje);
    el.innerHTML = `<style>${css}</style>
      <div class="row"><h1 style="margin:0">Skróty</h1><span class="spacer"></span><button class="primary" id="skAdd">+ Dodaj skrót</button></div>
      <div class="sk-list">${all.map(s => `<a class="sk-a" href="${esc(s.url)}" target="_blank" rel="noopener" data-url="${esc(s.url)}">
        <span class="i">${esc(s.ikona || '🔗')}</span><span><div class="t">${esc(s.title)}</div><div class="s">${esc(s.opis || s.url.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</div></span>
        ${s.wlasny ? `<button class="x" data-del="${esc(s.id)}" title="Usuń skrót">✕</button>` : ''}</a>`).join('')}</div>
      <p class="muted" style="margin-top:14px">Na telefonie Board Game Arena otwiera się w aplikacji BGA, jeśli Android ją do tego przypisał (przy pierwszym razie może zapytać, czym otworzyć – wybierz „Board Game Arena” i „Zawsze”).</p>`;
    el.querySelectorAll('.sk-a').forEach(a => a.onclick = e => { if (e.target.closest('[data-del]')) return; e.preventDefault(); otworz(a.dataset.url); });
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = async e => {
      e.preventDefault(); e.stopPropagation();
      const s = moje.find(x => x.id === b.dataset.del);
      if (!s || !(await App.ui.confirm(`Usunąć skrót „${s.title}”?`))) return;
      await DB.setting('skroty', moje.filter(x => x.id !== s.id)); App.refresh();
    });
    el.querySelector('#skAdd').onclick = async () => {
      const f = await App.ui.form('Nowy skrót', [
        { name: 'title', label: 'Nazwa', placeholder: 'np. Egmont – zapowiedzi' },
        { name: 'url', label: 'Adres strony', type: 'url', placeholder: 'https://…' },
        { name: 'ikona', label: 'Ikona (emoji, opcjonalnie)', placeholder: '🔗' }]);
      if (!f) return;
      let url = (f.url || '').trim();
      if (!url) return App.ui.toast('Podaj adres strony');
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      try { new URL(url); } catch (e) { return App.ui.toast('To nie wygląda na adres strony'); }
      await DB.setting('skroty', moje.concat([{ id: 'w' + Date.now(), title: f.title || url.replace(/^https?:\/\//, ''), url, ikona: f.ikona || '🔗', wlasny: true }]));
      App.ui.toast('Dodano skrót'); App.refresh();
    };
  }

  if (window.IKONY) window.IKONY.skroty = '<path class="f" d="M13.5 3.5 6 13.5h5.5l-1 7L18 10.5h-5.5z"/>';
  App.registerModule({ id: 'skroty', title: 'Skróty', icon: '⚡', order: 60, render });
})();
