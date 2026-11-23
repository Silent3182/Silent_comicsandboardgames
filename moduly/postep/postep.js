/* Moduł „Postęp czytania”: statystyki Master Reading Order – ile procent za Tobą, tempo czytania i prognoza.
 * Dane bierze z modułu komiksów (usługa 'komiksy.mro'). Tempo liczone z dat odznaczenia w aplikacji (readAt);
 * odznaczenia hurtowe („do tego miejsca”, import z arkusza) nie liczą się do tempa, bo zawyżałyby je.
 */
(function () {
  const { esc } = App.ui;
  const DZIEN = 864e5;
  const pl = (n, one, few, many) => n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? few : many;
  const fmt = n => n.toLocaleString('pl-PL', { maximumFractionDigits: 1 });
  const data = d => d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
  const zaIle = dni => dni < 14 ? `${Math.max(1, Math.round(dni))} ${pl(Math.max(1, Math.round(dni)), 'dzień', 'dni', 'dni')}` : dni < 60 ? `${Math.round(dni / 7)} tyg.` : dni < 730 ? `${Math.round(dni / 30.4)} mies.` : `${fmt(dni / 365)} lat`;

  function css() {
    if (document.getElementById('pp-css')) return;
    const st = document.createElement('style'); st.id = 'pp-css';
    st.textContent = `
#main .pp-big{height:14px;background:var(--surface2);border-radius:7px;overflow:hidden;margin:6px 0}
#main .pp-big > i{display:block;height:100%;background:var(--ok);border-radius:7px}
#main .pp-sec{display:grid;grid-template-columns:minmax(120px,1.2fr) 2fr auto;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line);font-size:14px}
#main .pp-sec:last-child{border-bottom:0}
#main .pp-sec.cur{font-weight:650}
#main .pp-sec .hbar > i{background:var(--ok)}
#main .pp-sec .n{font-variant-numeric:tabular-nums;color:var(--muted);font-size:13px;text-align:right;white-space:nowrap}
#main .pp-tl td.d{white-space:nowrap}
#main .bars .b.now{background:var(--accent-2)}`;
    document.head.appendChild(st);
  }

  async function render(el) {
    css();
    if (!App.has('komiksy.mro')) { el.innerHTML = '<p class="muted">Moduł komiksów nie jest dostępny.</p>'; return; }
    el.innerHTML = '<p class="muted">Liczę postęp…</p>';
    const { list, secs, S } = await App.call('komiksy.mro');
    const licz = list.filter(S.counts);
    const tot = licz.length, done = licz.filter(S.isRead).length, pct = done / Math.max(1, tot) * 100;
    const pozostalo = tot - done;

    // odczyty z datami (bez hurtowych i bez „pominiętych”)
    const byId = new Map(list.map(x => [x.id, x]));
    const odcz = [...S.ov.values()].filter(r => r.read && r.readAt && !r.skipped && byId.has(r.id) && S.counts(byId.get(r.id)));
    const grupy = new Map(); odcz.forEach(r => grupy.set(r.readAt, (grupy.get(r.readAt) || 0) + 1));
    const pojedyncze = odcz.filter(r => grupy.get(r.readAt) <= 5).map(r => new Date(r.readAt)).sort((a, b) => a - b);
    const hurtem = odcz.length - pojedyncze.length;
    const teraz = Date.now();
    const ile = dni => pojedyncze.filter(d => teraz - d < dni * DZIEN).length;
    const rok = pojedyncze.filter(d => d.getFullYear() === new Date().getFullYear()).length;
    // tempo: ostatnie 90 dni (albo od pierwszego odczytu, min. 14 dni)
    let tempo = 0;
    if (pojedyncze.length >= 3) {
      const okno = Math.min(90, Math.max(14, (teraz - pojedyncze[0]) / DZIEN));
      tempo = pojedyncze.filter(d => teraz - d < okno * DZIEN).length / okno;
    }
    const prognoza = n => tempo > 0 ? new Date(teraz + n / tempo * DZIEN) : null;

    // wykres: ostatnie 12 tygodni
    const pon = new Date(); pon.setHours(0, 0, 0, 0); pon.setDate(pon.getDate() - ((pon.getDay() + 6) % 7));
    const tyg = []; for (let i = 11; i >= 0; i--) { const od = new Date(pon - i * 7 * DZIEN); tyg.push({ od, n: pojedyncze.filter(d => d >= od && d < new Date(+od + 7 * DZIEN)).length }); }
    const maxT = Math.max(1, ...tyg.map(t => t.n));

    // części: postęp i prognoza ukończenia (licząc nieprzeczytane w kolejności do końca części)
    const czesci = secs.map(sec => { const its = licz.filter(x => x.sec === sec); return { sec, tot: its.length, done: its.filter(S.isRead).length, last: its.length ? its[its.length - 1].i : -1 }; }).filter(c => c.tot);
    const curSec = S.next ? S.next.sec : null;
    let narast = 0; const doKonca = new Map();
    licz.forEach(x => { if (!S.isRead(x)) narast++; doKonca.set(x.i, narast); });
    // kamienie milowe
    const progi = [25, 50, 75, 90, 100].filter(p => p > pct).map(p => ({ p, n: Math.ceil(tot * p / 100) - done }));

    el.innerHTML = `
      <h2>Postęp czytania</h2>
      <div class="card">
        <div class="row" style="align-items:baseline"><b style="font-size:28px">${fmt(pct)}%</b><span class="muted">Master Reading Order · przeczytane ${done.toLocaleString('pl-PL')} z ${tot.toLocaleString('pl-PL')}</span></div>
        <div class="pp-big"><i style="width:${pct.toFixed(2)}%"></i></div>
        ${S.next ? `<p class="muted" style="margin:6px 0 0">Teraz: <b>${esc(S.next.title)}</b> · ${esc(S.next.sec)} · zostało ${pozostalo.toLocaleString('pl-PL')} ${pl(pozostalo, 'pozycja', 'pozycje', 'pozycji')}</p>` : '<p>Wszystko przeczytane! 🎉</p>'}
      </div>
      <div class="stats">
        <div class="stat"><div class="v">${ile(7)}</div><div class="l">ostatnie 7 dni</div></div>
        <div class="stat"><div class="v">${ile(30)}</div><div class="l">ostatnie 30 dni</div></div>
        <div class="stat"><div class="v">${rok}</div><div class="l">w ${new Date().getFullYear()} r.</div></div>
        <div class="stat"><div class="v">${tempo ? fmt(tempo * 7) : '–'}</div><div class="l">tempo: zeszytów na tydzień</div></div>
      </div>
      ${tempo ? `<div class="card"><h3 style="margin-top:0">Prognoza</h3>
        <p>W tym tempie skończysz całą listę około <b>${data(prognoza(pozostalo))}</b> (za ${zaIle(pozostalo / tempo)}).</p>
        ${progi.length ? `<table class="tbl pp-tl"><tr><th>Etap</th><th class="n">Brakuje</th><th>Kiedy</th></tr>${progi.map(m => `<tr><td>${m.p}%</td><td class="n">${m.n.toLocaleString('pl-PL')}</td><td class="d">${data(prognoza(m.n))}</td></tr>`).join('')}</table>` : ''}
        </div>`
      : `<div class="card"><h3 style="margin-top:0">Prognoza</h3><p class="muted">Tempo i prognoza pojawią się, gdy odznaczysz w aplikacji kilka przeczytanych pozycji (co najmniej 3, każdą osobno). Arkusz nie zawiera dat czytania${hurtem ? `, a ${hurtem} ${pl(hurtem, 'pozycja odznaczona hurtem się nie liczy', 'pozycje odznaczone hurtem się nie liczą', 'pozycji odznaczonych hurtem się nie liczy')}` : ''}.</p></div>`}
      <div class="card"><h3 style="margin-top:0">Ostatnie 12 tygodni</h3>
        <div class="bars">${tyg.map((t, i) => `<div class="b ${i === 11 ? 'now' : ''}" style="height:${(t.n / maxT * 100).toFixed(1)}%" title="od ${t.od.toLocaleDateString('pl-PL')}: ${t.n}"></div>`).join('')}</div>
        <div class="bars-l">${tyg.map(t => `<span>${t.od.getDate()}.${t.od.getMonth() + 1}</span>`).join('')}</div>
      </div>
      <div class="card"><h3 style="margin-top:0">Części</h3>
        ${czesci.map(c => { const p = c.done / c.tot * 100; const zost = doKonca.get(c.last) || 0; const kiedy = c.done < c.tot && tempo ? prognoza(zost) : null;
          return `<div class="pp-sec ${c.sec === curSec ? 'cur' : ''}"><div>${c.sec === curSec ? '▶ ' : ''}${esc(c.sec)}${c.done === c.tot ? ' ✓' : ''}</div><div class="hbar"><i style="width:${p.toFixed(1)}%"></i></div>
            <div class="n">${c.done}/${c.tot}${kiedy ? ` · ${kiedy.toLocaleDateString('pl-PL', { month: 'short', year: 'numeric' })}` : ''}</div></div>`; }).join('')}
        <p class="muted" style="margin-bottom:0">${tempo ? 'Data przy części = przewidywane ukończenie, czytając po kolei w obecnym tempie. ' : ''}Liczone bez pozycji wyłączonych w ustawieniach czytania (np. Star Wars, „do pominięcia”).</p>
      </div>
      <p class="row"><button id="ppGo">📖 Przejdź do czytania</button></p>`;
    el.querySelector('#ppGo').onclick = () => App.go('czytanie');
  }

  App.registerModule({ id: 'postep', title: 'Postęp czytania', icon: '📈', order: 22, render });
})();
