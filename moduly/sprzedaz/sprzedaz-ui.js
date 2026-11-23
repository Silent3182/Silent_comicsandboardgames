/* Zakładka „Sprzedaż” w aplikacji Moje kolekcje.
 * Wymaga: core/db.js, core/app.js, moduly/sprzedaz/sprzedaz.js (window.Sprzedaz).
 * Trasy:  #/sprzedaz                         – lista ogłoszeń + statystyki
 *         #/sprzedaz?itemType=game&itemId=…  – nowe ogłoszenie dla pozycji
 *         #/sprzedaz?listing=…               – edycja ogłoszenia
 *         #/sprzedaz?wybierz=1               – wybór pozycji do sprzedaży
 * Usługa:  App.call('sprzedaz.wystaw', {itemType:'game'|'comic', itemId})
 */
(function () {
  var S = window.Sprzedaz;
  var STORE = { game: "games", comic: "comics" };
  var PLAT_NAZWA = { forum: "Forum" };
  var STATUS_PL = { draft: "Szkic", active: "Wystawione", sold: "Sprzedane" };

  function css() {
    if (document.getElementById("spr-css")) return;
    var st = document.createElement("style");
    st.id = "spr-css";
    st.textContent = [
      ".spr{max-width:1100px;margin:0 auto;padding:12px 16px 80px}",
      ".spr h2{font-size:20px;margin:4px 0 12px}",
      ".spr h3{font-size:13px;text-transform:uppercase;letter-spacing:.04em;opacity:.7;margin:16px 0 8px}",
      ".spr .box{border:1px solid rgba(127,127,127,.3);border-radius:12px;padding:14px;margin-bottom:14px}",
      ".spr .cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}",
      "@media(max-width:820px){.spr .cols{grid-template-columns:1fr}}",
      ".spr label{display:block;font-size:13px;opacity:.75;margin:10px 0 4px}",
      ".spr input,.spr select,.spr textarea{width:100%;box-sizing:border-box;font:inherit;padding:8px 10px;border-radius:8px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit}",
      ".spr textarea{min-height:56px}",
      ".spr .two{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
      ".spr .seg{display:flex;flex-wrap:wrap;gap:6px}",
      ".spr .seg button{border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;border-radius:999px;padding:6px 12px;font:inherit;font-size:14px;cursor:pointer}",
      ".spr .seg button.on{background:var(--accent,#1f6f5c);border-color:var(--accent,#1f6f5c);color:#fff}",
      ".spr .links{display:flex;flex-wrap:wrap;gap:6px}",
      ".spr .links a{font-size:13px;border:1px solid rgba(127,127,127,.4);border-radius:6px;padding:4px 8px;color:inherit;text-decoration:none}",
      ".spr .prices{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}",
      ".spr .price{border:1px solid rgba(127,127,127,.4);border-radius:10px;padding:10px;text-align:center;background:transparent;color:inherit;font:inherit;cursor:pointer}",
      ".spr .price b{display:block;font-size:19px}.spr .price span{font-size:12px;opacity:.7}",
      ".spr .price.on{outline:2px solid var(--accent,#1f6f5c)}",
      ".spr .hint{font-size:12px;opacity:.7;margin-top:6px}",
      ".spr pre{white-space:pre-wrap;word-break:break-word;font:inherit;border:1px solid rgba(127,127,127,.3);border-radius:8px;padding:12px;margin:0}",
      ".spr .ttl{font-weight:600;border:1px solid rgba(127,127,127,.3);border-radius:8px;padding:10px}",
      ".spr .warn{background:rgba(240,160,40,.15);border-radius:8px;padding:8px 10px;font-size:13px;margin-top:8px}",
      ".spr .acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}",
      ".spr .btn{border:0;background:var(--accent,#1f6f5c);color:#fff;border-radius:8px;padding:9px 14px;font:inherit;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}",
      ".spr .btn.ghost{background:transparent;color:inherit;border:1px solid rgba(127,127,127,.5)}",
      ".spr .head{display:flex;gap:12px;align-items:center}",
      ".spr .head img{width:64px;height:64px;object-fit:cover;border-radius:8px}",
      ".spr .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}",
      "@media(max-width:600px){.spr .stats{grid-template-columns:repeat(2,1fr)}}",
      ".spr .stat{border:1px solid rgba(127,127,127,.3);border-radius:10px;padding:10px}.spr .stat b{display:block;font-size:20px}.spr .stat span{font-size:12px;opacity:.7}",
      ".spr .item{display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid rgba(127,127,127,.2);cursor:pointer}",
      ".spr .item img{width:44px;height:44px;object-fit:cover;border-radius:6px}",
      ".spr .item .grow{flex:1;min-width:0}.spr .item small{opacity:.7;display:block}",
      ".spr .pill{font-size:12px;border-radius:999px;padding:2px 8px;border:1px solid rgba(127,127,127,.4);white-space:nowrap}"
    ].join("\n");
    document.head.appendChild(st);
  }

  var esc = function (s) { return App.ui.esc(s); };
  function liczby(s) { return String(s || "").replace(/,/g, ".").split(/[\s;]+/).map(Number).filter(function (x) { return x > 0; }); }
  function zl(n) { return n == null ? "–" : (Math.round(n * 100) / 100).toLocaleString("pl-PL") + " zł"; }
  function nazwa(item, t) { return t === "game" ? item.title : [item.series, item.volume, item.title].filter(Boolean).join(" "); }

  async function ustawienia() {
    var u = (await DB.setting("sprzedaz")) || {};
    return Object.assign({ miasto: "", paczkomatGabaryt: "B", platforma: "olx" }, u);
  }

  // ---------- Lista ogłoszeń ----------
  async function lista(el, ctx) {
    var listings = await DB.all("listings");
    var items = {};
    for (var i = 0; i < listings.length; i++) {
      var l = listings[i];
      items[l.id] = await DB.get(STORE[l.itemType], l.itemId);
    }
    var sold = listings.filter(function (l) { return l.status === "sold"; });
    var active = listings.filter(function (l) { return l.status === "active"; });
    var suma = sold.reduce(function (a, l) { return a + (l.soldPrice || 0); }, 0);
    var wart = active.reduce(function (a, l) { return a + (l.price || 0); }, 0);

    var html = '<div class="spr"><h2>Sprzedaż</h2>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + active.length + '</b><span>wystawione</span></div>' +
      '<div class="stat"><b>' + zl(wart) + '</b><span>wartość wystawionych</span></div>' +
      '<div class="stat"><b>' + sold.length + '</b><span>sprzedane</span></div>' +
      '<div class="stat"><b>' + zl(suma) + '</b><span>zarobione</span></div></div>' +
      '<div class="acts" style="margin:0 0 14px"><button class="btn" id="sprNowe">+ Nowe ogłoszenie</button><button class="btn ghost" id="sprZb">Ogłoszenie zbiorcze (tytuł – cena)</button><button class="btn ghost" id="sprUst">Ustawienia wysyłki</button></div>';
    ["draft", "active", "sold"].forEach(function (st) {
      var arr = listings.filter(function (l) { return l.status === st; }).sort(function (a, b) { return (b.updatedAt || "").localeCompare(a.updatedAt || ""); });
      if (!arr.length) return;
      html += "<h3>" + STATUS_PL[st] + " (" + arr.length + ")</h3><div class=\"box\" style=\"padding:0 14px\">";
      arr.forEach(function (l) {
        var it = items[l.id];
        var img = it && (it.thumb || it.image);
        html += '<div class="item" data-id="' + esc(l.id) + '">' + (img ? '<img src="' + esc(img) + '" alt="">' : "") +
          '<div class="grow"><div>' + esc(it ? nazwa(it, l.itemType) : l.title) + "</div><small>" +
          esc((S.PLATFORMY[l.platform] || {}).nazwa || PLAT_NAZWA[l.platform] || l.platform) + (l.batch ? " (zbiorczo)" : "") + " · " + (st === "sold" ? "sprzedane za " + zl(l.soldPrice) + " · " + App.ui.fmtDate(l.soldAt) : zl(l.price)) +
          '</small></div><span class="pill">' + STATUS_PL[st] + "</span></div>";
      });
      html += "</div>";
    });
    if (!listings.length) html += '<p class="hint" style="font-size:14px">Nie masz jeszcze ogłoszeń. Wybierz grę lub komiks i kliknij „Wystaw na sprzedaż”, albo użyj przycisku powyżej.</p>';
    html += "</div>";
    el.innerHTML = html;
    el.querySelectorAll(".item").forEach(function (r) { r.onclick = function () { ctx.go("sprzedaz", { listing: r.dataset.id }); }; });
    el.querySelector("#sprNowe").onclick = function () { ctx.go("sprzedaz", { wybierz: 1 }); };
    el.querySelector("#sprZb").onclick = function () { ctx.go("sprzedaz", { zbiorcze: 1 }); };
    el.querySelector("#sprUst").onclick = async function () {
      var u = await ustawienia();
      var f = await App.ui.form("Ustawienia sprzedaży", [
        { name: "miasto", label: "Miasto odbioru osobistego (puste = bez odbioru)", value: u.miasto },
        { name: "paczkomatGabaryt", label: "Domyślny gabaryt paczkomatu", type: "select", value: u.paczkomatGabaryt, options: [["A", "A – mała (np. komiks)"], ["B", "B – średnia (większość gier)"], ["C", "C – duża (duże pudła)"]] },
        { name: "platforma", label: "Domyślny serwis", type: "select", value: u.platforma, options: Object.keys(S.PLATFORMY).map(function (k) { return [k, S.PLATFORMY[k].nazwa]; }) }
      ]);
      if (f) { await DB.setting("sprzedaz", f); App.ui.toast("Zapisano"); }
    };
  }

  // ---------- Wybór pozycji ----------
  async function wybor(el, ctx) {
    var games = (await DB.all("games")).filter(function (g) { return g.status !== "sold" && g.status !== "wishlist"; }).map(function (g) { return { t: "game", it: g }; });
    var comics = (await DB.all("comics")).filter(function (c) { return c.status !== "sold" && c.status !== "missing"; }).map(function (c) { return { t: "comic", it: c }; });
    var all = games.concat(comics);
    el.innerHTML = '<div class="spr"><h2>Co sprzedajesz?</h2><input id="sprSzukaj" placeholder="Szukaj gry lub komiksu…" autofocus><div class="box" style="padding:0 14px;margin-top:10px" id="sprWyn"></div></div>';
    function pokaz() {
      var q = el.querySelector("#sprSzukaj").value.toLowerCase();
      var hit = all.filter(function (x) { return nazwa(x.it, x.t).toLowerCase().indexOf(q) >= 0; }).slice(0, 60);
      el.querySelector("#sprWyn").innerHTML = hit.length ? hit.map(function (x, i) {
        var img = x.it.thumb || x.it.image;
        return '<div class="item" data-i="' + i + '">' + (img ? '<img src="' + esc(img) + '" alt="">' : "") + '<div class="grow">' + esc(nazwa(x.it, x.t)) + "<small>" + (x.t === "game" ? "Gra" : "Komiks") + "</small></div></div>";
      }).join("") : '<p class="hint">Brak wyników' + (all.length ? "" : " – kolekcja jest pusta") + ".</p>";
      el.querySelectorAll("#sprWyn .item").forEach(function (r) { r.onclick = function () { var x = hit[+r.dataset.i]; ctx.go("sprzedaz", { itemType: x.t, itemId: x.it.id }); }; });
    }
    el.querySelector("#sprSzukaj").oninput = pokaz;
    pokaz();
  }

  // ---------- Edytor ogłoszenia ----------
  async function edytor(el, params, ctx) {
    var u = await ustawienia();
    var l;
    if (params.listing) {
      l = await DB.get("listings", params.listing);
      if (!l) { el.innerHTML = '<div class="spr"><p>Nie znaleziono ogłoszenia.</p></div>'; return; }
    } else {
      var istn = (await DB.all("listings")).find(function (x) { return x.itemId === params.itemId && x.status !== "sold"; });
      l = istn || { itemType: params.itemType, itemId: params.itemId, platform: u.platform || u.platforma, condition: "bardzoDobry", status: "draft",
        features: params.itemType === "game" ? ["kompletna"] : ["czytany1"], pricesNew: "", pricesUsed: "", notes: "", negotiable: false,
        shipping: params.itemType === "comic" ? "A" : u.paczkomatGabaryt };
    }
    if (!S.PLATFORMY[l.platform]) l.platform = "facebook";
    var item = await DB.get(STORE[l.itemType], l.itemId);
    if (!item) { el.innerHTML = '<div class="spr"><p>Ta pozycja nie istnieje już w kolekcji.</p></div>'; return; }
    var poz = S.zRekordu(item, l.itemType);
    var typ = poz.typ;
    if (l.blurb != null) poz.opisKrotki = l.blurb;
    var cenaRecznie = l.price != null;
    var wynik;

    var img = item.thumb || item.image;
    el.innerHTML = '<div class="spr">' +
      '<a href="#/sprzedaz" style="color:inherit;opacity:.7;font-size:14px">← Wszystkie ogłoszenia</a>' +
      '<div class="head" style="margin:10px 0 14px">' + (img ? '<img src="' + esc(img) + '" alt="">' : "") + '<div><h2 style="margin:0">' + esc(nazwa(item, l.itemType)) + '</h2><span class="pill">' + STATUS_PL[l.status] + "</span></div></div>" +
      '<div class="cols"><div class="box">' +
        "<h3 style=\"margin-top:0\">Stan</h3><div class=\"seg\" id=\"sStan\"></div>" +
        '<label>Szczegóły</label><div class="seg" id="sCechy"></div>' +
        '<label>Uwagi (brakujący element, dodatki, promki…)</label><input id="sUwagi">' +
        '<label>Kilka słów o ' + (typ === "gra" ? "grze" : "komiksie") + ' (zostaw puste, by użyć danych z kolekcji)</label><textarea id="sBlurb"></textarea>' +
        '<div class="hint" id="sAuto"></div>' +
      '</div><div class="box">' +
        '<h3 style="margin-top:0">Cena</h3><div class="hint" style="margin:0 0 8px">Otwórz wyszukiwania, wpisz kilka cen (spacja między nimi) – dostaniesz 3 propozycje.</div>' +
        '<div class="links" id="sLinki"></div>' +
        '<div class="two"><div><label>Ceny nowych (zł)</label><input id="sNowe" inputmode="decimal"></div><div><label>Ceny używanych (zł)</label><input id="sUzyw" inputmode="decimal"></div></div>' +
        '<div class="prices" id="sProp"></div><div class="hint" id="sPodst"></div>' +
        '<div class="two"><div><label>Twoja cena (zł)</label><input id="sCena" inputmode="decimal"></div><div><label>&nbsp;</label><label style="opacity:1"><input type="checkbox" id="sNeg" style="width:auto"> do negocjacji</label></div></div>' +
        '<h3>Gdzie</h3><div class="seg" id="sPlat"></div>' +
        '<div class="two"><div><label>Paczkomat</label><select id="sGab"><option value="A">A – mała</option><option value="B">B – średnia</option><option value="C">C – duża</option></select></div><div><label>Odbiór osobisty</label><input id="sMiasto" placeholder="miasto lub puste"></div></div>' +
      "</div></div>" +
      '<div class="box"><h3 style="margin-top:0">Ogłoszenie</h3><div class="ttl" id="oT"></div><div class="hint" id="oM"></div><label>Opis</label><pre id="oO"></pre><div id="oW"></div>' +
      '<div class="acts"><button class="btn" id="bKT">Kopiuj tytuł</button><button class="btn" id="bKO">Kopiuj opis</button><a class="btn ghost" id="bOtw" target="_blank" rel="noopener">Otwórz serwis</a></div>' +
      '<div class="acts" id="sAkcje"></div></div></div>';

    var $ = function (id) { return el.querySelector("#" + id); };
    $("sUwagi").value = l.notes || "";
    $("sBlurb").value = l.blurb || "";
    $("sNowe").value = l.pricesNew || "";
    $("sUzyw").value = l.pricesUsed || "";
    $("sCena").value = l.price != null ? l.price : "";
    $("sNeg").checked = !!l.negotiable;
    $("sGab").value = l.shipping || u.paczkomatGabaryt;
    $("sMiasto").value = l.city != null ? l.city : u.miasto;
    $("sAuto").textContent = "Z danych kolekcji: " + S.kilkaSlow(Object.assign({}, poz, { opisKrotki: "" }));
    $("sLinki").innerHTML = S.linkiCen(poz).map(function (x) { return '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.zrodlo) + "</a>"; }).join("");

    function seg(box, items, cur, multi, onPick) {
      box.innerHTML = "";
      items.forEach(function (it) {
        var b = document.createElement("button");
        b.type = "button"; b.textContent = it[1];
        if (multi ? cur.indexOf(it[0]) >= 0 : cur === it[0]) b.className = "on";
        b.onclick = function () { onPick(it[0]); };
        box.appendChild(b);
      });
    }

    function zbierz() {
      l.notes = $("sUwagi").value.trim();
      l.blurb = $("sBlurb").value.trim();
      l.pricesNew = $("sNowe").value.trim();
      l.pricesUsed = $("sUzyw").value.trim();
      var c = parseFloat($("sCena").value.replace(",", "."));
      l.price = isNaN(c) ? null : c;
      l.negotiable = $("sNeg").checked;
      l.shipping = $("sGab").value;
      l.city = $("sMiasto").value.trim();
    }

    function odswiez() {
      zbierz();
      seg($("sStan"), Object.keys(S.STANY).map(function (k) { return [k, S.STANY[k].etykieta]; }), l.condition, false, function (v) { l.condition = v; odswiez(); });
      var cs = S.CECHY_STANU[typ];
      seg($("sCechy"), Object.keys(cs).map(function (k) { return [k, cs[k]]; }), l.features || [], true, function (v) {
        l.features = l.features || [];
        var i = l.features.indexOf(v); if (i >= 0) l.features.splice(i, 1); else l.features.push(v);
        odswiez();
      });
      seg($("sPlat"), Object.keys(S.PLATFORMY).map(function (k) { return [k, S.PLATFORMY[k].nazwa.replace(/ \(.*\)/, "")]; }), l.platform, false, function (v) { l.platform = v; odswiez(); });

      var pr = S.proponujCeny({ nowe: liczby(l.pricesNew), uzywane: liczby(l.pricesUsed), stan: l.condition });
      var box = $("sProp"); box.innerHTML = "";
      if (pr) {
        if (!cenaRecznie) { l.price = pr.rynkowa; $("sCena").value = pr.rynkowa; }
        [["szybka", "Szybka sprzedaż"], ["rynkowa", "Rynkowa"], ["maks", "Maksymalna"]].forEach(function (o) {
          var b = document.createElement("button");
          b.type = "button"; b.className = "price" + (l.price === pr[o[0]] ? " on" : "");
          b.innerHTML = "<b>" + pr[o[0]] + " zł</b><span>" + o[1] + "</span>";
          b.onclick = function () { cenaRecznie = true; $("sCena").value = pr[o[0]]; odswiez(); };
          box.appendChild(b);
        });
        $("sPodst").textContent = "Podstawa: " + pr.podstawa + ".";
      } else $("sPodst").textContent = "Wpisz przynajmniej jedną cenę, by dostać propozycje.";

      var p2 = Object.assign({}, poz, { opisKrotki: l.blurb || poz.opisKrotki });
      wynik = S.generujOgloszenie(p2, {
        platforma: l.platform, stan: l.condition, cechy: l.features, uwagi: l.notes, cena: l.price, negocjacja: l.negotiable,
        ustawienia: { paczkomatGabaryt: l.shipping, miasto: l.city, odbiorOsobisty: !!l.city }
      });
      $("oT").textContent = wynik.tytul;
      $("oM").textContent = wynik.platformaNazwa + " · tytuł " + wynik.tytul.length + "/" + S.PLATFORMY[l.platform].maxTytul + " znaków · stan w formularzu: " + wynik.parametry.stan + " · kategoria: " + wynik.parametry.kategoria;
      $("oO").textContent = wynik.opis;
      $("oW").innerHTML = wynik.ostrzezenia.map(function (w) { return '<div class="warn">' + esc(w) + "</div>"; }).join("");
      $("bOtw").href = wynik.linkWystaw;
      $("bOtw").textContent = "Otwórz " + wynik.platformaNazwa.replace(/ \(.*\)/, "");
      akcje();
    }

    async function zapisz(status) {
      zbierz();
      l.title = wynik.tytul; l.text = wynik.opis;
      if (status) l.status = status;
      l = await DB.put("listings", l);
      return l;
    }
    async function ustawStatusPozycji(st) {
      var it = await DB.get(STORE[l.itemType], l.itemId);
      if (it) { it.status = st; await DB.put(STORE[l.itemType], it); }
    }

    function akcje() {
      var a = $("sAkcje");
      var b = [];
      if (l.status === "draft") b.push(["Zapisz szkic", "ghost", async function () { await zapisz(); App.ui.toast("Zapisano szkic"); ctx.go("sprzedaz", { listing: l.id }); }],
                                        ["Oznacz jako wystawione", "", async function () { await zapisz("active"); await ustawStatusPozycji("forSale"); App.ui.toast("Wystawione – pozycja ma status „na sprzedaż”"); ctx.go("sprzedaz", { listing: l.id }); }]);
      if (l.status === "active") b.push(["Zapisz zmiany", "ghost", async function () { await zapisz(); App.ui.toast("Zapisano"); }],
                                         ["Sprzedane!", "", async function () {
                                           var f = await App.ui.form("Sprzedane", [{ name: "soldPrice", label: "Cena sprzedaży (zł)", type: "number", step: "0.01", value: l.price }, { name: "soldAt", label: "Data", type: "date", value: App.ui.today() }], { ok: "Zapisz" });
                                           if (!f) return;
                                           l.soldPrice = f.soldPrice; l.soldAt = f.soldAt;
                                           await zapisz("sold"); await ustawStatusPozycji("sold");
                                           App.ui.toast("Gratulacje! Zapisano sprzedaż"); ctx.go("sprzedaz");
                                         }],
                                         ["Wycofaj ogłoszenie", "ghost", async function () {
                                           if (!(await App.ui.confirm("Wycofać ogłoszenie? Pozycja wróci do kolekcji."))) return;
                                           await ustawStatusPozycji("owned"); l.status = "draft"; await zapisz(); App.ui.toast("Wycofano – zostaje jako szkic"); ctx.go("sprzedaz", { listing: l.id });
                                         }]);
      if (l.status === "sold") b.push(["Cofnij sprzedaż", "ghost", async function () { l.status = "active"; l.soldPrice = null; l.soldAt = null; await zapisz(); await ustawStatusPozycji("forSale"); ctx.go("sprzedaz", { listing: l.id }); }]);
      if (l.id) b.push(["Usuń", "ghost", async function () {
        if (!(await App.ui.confirm("Usunąć to ogłoszenie?"))) return;
        if (l.status === "active") await ustawStatusPozycji("owned");
        await DB.remove("listings", l.id); ctx.go("sprzedaz");
      }]);
      a.innerHTML = "";
      b.forEach(function (x) { var bt = document.createElement("button"); bt.className = "btn " + x[1]; bt.textContent = x[0]; bt.onclick = x[2]; a.appendChild(bt); });
    }

    function kopiuj(txt, btn) {
      var done = function () { var t = btn.textContent; btn.textContent = "Skopiowano ✓"; setTimeout(function () { btn.textContent = t; }, 1200); };
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, function () { App.ui.toast("Zaznacz tekst i skopiuj ręcznie"); });
    }
    $("bKT").onclick = function () { kopiuj(wynik.tytul, this); };
    $("bKO").onclick = function () { kopiuj(wynik.opis, this); };
    $("bOtw").addEventListener("click", function () { if (l.status === "draft") App.ui.toast("Po wystawieniu wróć i kliknij „Oznacz jako wystawione”", 4000); });
    $("sCena").addEventListener("input", function () { cenaRecznie = true; });
    // Tylko "input" (nie "change"), żeby opuszczenie pola nie przebudowywało przycisków pod kursorem.
    el.querySelectorAll("input:not([type=checkbox]),textarea").forEach(function (x) { x.addEventListener("input", odswiez); });
    el.querySelectorAll("select,input[type=checkbox]").forEach(function (x) { x.addEventListener("change", odswiez); });
    odswiez();
  }

  // ---------- Ogłoszenie zbiorcze (Facebook / forum): „tytuł – cena” ----------
  async function zbiorcze(el, ctx) {
    var u = await ustawienia();
    var listings = await DB.all("listings");
    var poId = {};
    listings.forEach(function (l) { if (l.status !== "sold") poId[l.itemId] = l; });
    var games = (await DB.all("games")).filter(function (g) { return g.status !== "sold" && g.status !== "wishlist"; }).map(function (g) { return { t: "game", it: g }; });
    var comics = (await DB.all("comics")).filter(function (c) { return c.status !== "sold" && c.status !== "missing"; }).map(function (c) { return { t: "comic", it: c }; });
    var all = games.concat(comics);
    all.forEach(function (x) {
      x.nazwa = nazwa(x.it, x.t);
      var l = poId[x.it.id];
      x.cena = l && l.price != null ? l.price : null;
      x.stan = l ? l.condition : "bardzoDobry";
      x.uwagi = "";
      x.wyb = x.it.status === "forSale";
    });
    var st = { platforma: "facebook", pokazStan: false, numeruj: false, negocjacja: true, tylkoZazn: false, q: "" };

    el.innerHTML = '<div class="spr"><a href="#/sprzedaz" style="color:inherit;opacity:.7;font-size:14px">← Wszystkie ogłoszenia</a>' +
      '<h2 style="margin-top:10px">Ogłoszenie zbiorcze</h2>' +
      '<div class="hint" style="margin:-6px 0 12px;font-size:13px">Zaznacz pozycje i wpisz ceny – powstanie lista „tytuł - cena” do wklejenia na Facebooka lub forum.</div>' +
      '<div class="cols"><div class="box">' +
        '<h3 style="margin-top:0">Pozycje <span id="zLicz"></span></h3>' +
        '<input id="zSzukaj" placeholder="Szukaj…"><label style="opacity:1"><input type="checkbox" id="zTylko" style="width:auto"> pokaż tylko zaznaczone</label>' +
        '<div id="zLista" style="max-height:520px;overflow:auto;margin-top:6px"></div>' +
      '</div><div class="box">' +
        '<h3 style="margin-top:0">Gdzie i jak</h3><div class="seg" id="zPlat"></div>' +
        '<label style="opacity:1"><input type="checkbox" id="zStan" style="width:auto"> pokaż stan przy tytule</label>' +
        '<label style="opacity:1"><input type="checkbox" id="zNum" style="width:auto"> numeruj</label>' +
        '<label style="opacity:1"><input type="checkbox" id="zNeg" style="width:auto" checked> ceny do negocjacji / rabat przy kilku</label>' +
        '<label>Nagłówek (puste = „Sprzedam gry planszowe:”)</label><input id="zNagl">' +
        '<div class="two"><div><label>Paczkomat</label><select id="zGab"><option value="A">A – mała</option><option value="B">B – średnia</option><option value="C">C – duża</option></select></div><div><label>Odbiór osobisty</label><input id="zMiasto" placeholder="miasto lub puste"></div></div>' +
        '<h3>Podgląd</h3><pre id="zOut"></pre><div class="hint" id="zSuma"></div>' +
        '<div class="acts"><button class="btn" id="zKop">Kopiuj</button><button class="btn ghost" id="zOzn">Oznacz zaznaczone jako wystawione</button></div>' +
      '</div></div></div>';
    var $ = function (id) { return el.querySelector("#" + id); };
    $("zGab").value = u.paczkomatGabaryt; $("zMiasto").value = u.miasto || "";

    function plat() {
      var b = $("zPlat"); b.innerHTML = "";
      [["facebook", "Facebook"], ["forum", "Forum / inne"]].forEach(function (x) {
        var bt = document.createElement("button"); bt.type = "button"; bt.textContent = x[1];
        if (st.platforma === x[0]) bt.className = "on";
        bt.onclick = function () { st.platforma = x[0]; plat(); podglad(); };
        b.appendChild(bt);
      });
    }

    function lista() {
      var q = st.q.toLowerCase();
      var hit = all.filter(function (x) { return (!st.tylkoZazn || x.wyb) && x.nazwa.toLowerCase().indexOf(q) >= 0; })
        .sort(function (a, b) { return (b.wyb - a.wyb) || a.nazwa.localeCompare(b.nazwa, "pl"); }).slice(0, 200);
      var box = $("zLista");
      box.innerHTML = hit.length ? "" : '<p class="hint">Brak pozycji.</p>';
      hit.forEach(function (x) {
        var r = document.createElement("div");
        r.className = "item"; r.style.cursor = "default";
        r.innerHTML = '<input type="checkbox" style="width:auto"' + (x.wyb ? " checked" : "") + '>' +
          '<div class="grow">' + esc(x.nazwa) + "<small>" + (x.t === "game" ? "Gra" : "Komiks") + (x.it.status === "forSale" ? " · już wystawiona" : "") + "</small></div>" +
          (x.wyb && $("zStan").checked ? '<select style="width:120px">' + Object.keys(S.STANY).map(function (k) { return '<option value="' + k + '"' + (k === x.stan ? " selected" : "") + ">" + esc(S.STANY[k].etykieta.replace(/ \(.*\)/, "")) + "</option>"; }).join("") + "</select>" : "") +
          '<input inputmode="decimal" placeholder="zł" style="width:80px" value="' + (x.cena != null ? x.cena : "") + '"' + (x.wyb ? "" : " disabled") + ">";
        var cb = r.querySelector("input[type=checkbox]"), pr = r.querySelectorAll("input")[1], sel = r.querySelector("select");
        if (sel) sel.onchange = function () { x.stan = sel.value; podglad(); };
        cb.onchange = function () { x.wyb = cb.checked; pr.disabled = !cb.checked; if (cb.checked && $("zStan").checked) lista(); else if (cb.checked) pr.focus(); podglad(); };
        pr.oninput = function () { var c = parseFloat(pr.value.replace(",", ".")); x.cena = isNaN(c) ? null : c; podglad(); };
        box.appendChild(r);
      });
    }

    var wynik, wybrane;
    function podglad() {
      wybrane = all.filter(function (x) { return x.wyb; });
      var typy = wybrane.reduce(function (a, x) { a[x.t] = 1; return a; }, {});
      var typ = typy.game && typy.comic ? "mix" : typy.comic ? "komiks" : "gra";
      wynik = S.generujZbiorcze(wybrane.map(function (x) { return { tytul: x.nazwa, cena: x.cena, stan: x.stan }; }), {
        platforma: st.platforma, pokazStan: $("zStan").checked, numeruj: $("zNum").checked, negocjacja: $("zNeg").checked,
        naglowek: $("zNagl").value, typ: typ,
        ustawienia: { paczkomatGabaryt: $("zGab").value, miasto: $("zMiasto").value.trim(), odbiorOsobisty: !!$("zMiasto").value.trim(), hashtagi: st.platforma === "facebook" }
      });
      $("zOut").textContent = wybrane.length ? wynik.tekst : "Zaznacz pozycje po lewej.";
      $("zLicz").textContent = "(" + wybrane.length + " zaznaczonych)";
      var bez = wybrane.filter(function (x) { return !x.cena; }).length;
      $("zSuma").textContent = wybrane.length ? "Razem: " + zl(wynik.suma) + (bez ? " · bez ceny: " + bez : "") : "";
    }

    $("zSzukaj").oninput = function () { st.q = this.value; lista(); };
    $("zTylko").onchange = function () { st.tylkoZazn = this.checked; lista(); };
    ["zNum", "zNeg", "zGab"].forEach(function (id) { $(id).addEventListener("change", podglad); });
    $("zStan").addEventListener("change", function () { lista(); podglad(); });
    ["zNagl", "zMiasto"].forEach(function (id) { $(id).addEventListener("input", podglad); });
    $("zKop").onclick = function () {
      var b = this;
      if (navigator.clipboard) navigator.clipboard.writeText(wynik.tekst).then(function () { var t = b.textContent; b.textContent = "Skopiowano ✓"; setTimeout(function () { b.textContent = t; }, 1200); }, function () { App.ui.toast("Zaznacz tekst i skopiuj ręcznie"); });
    };
    $("zOzn").onclick = async function () {
      if (!wybrane.length) { App.ui.toast("Nic nie zaznaczono"); return; }
      for (var i = 0; i < wybrane.length; i++) {
        var x = wybrane[i];
        var l = poId[x.it.id] || { itemType: x.t, itemId: x.it.id, condition: x.stan, features: [], notes: "" };
        l.platform = st.platforma; l.price = x.cena; l.status = "active"; l.title = x.nazwa; l.text = wynik.tekst; l.batch = true;
        poId[x.it.id] = await DB.put("listings", l);
        var it = await DB.get(STORE[x.t], x.it.id);
        if (it && it.status !== "forSale") { it.status = "forSale"; await DB.put(STORE[x.t], it); x.it = it; }
      }
      App.ui.toast("Wystawiono " + wybrane.length + " pozycji – znajdziesz je w zakładce Sprzedaż");
      lista();
    };
    plat(); lista(); podglad();
  }

  App.registerModule({
    id: "sprzedaz", title: "Sprzedaż", icon: "💰", order: 50,
    render: function (el, params, ctx) {
      css();
      if (params.listing || (params.itemType && params.itemId)) return edytor(el, params, ctx);
      if (params.wybierz) return wybor(el, ctx);
      if (params.zbiorcze) return zbiorcze(el, ctx);
      return lista(el, ctx);
    }
  });

  App.provide("sprzedaz.wystaw", function (o) {
    var t = o.itemType === "comic" ? "comic" : "game";
    App.go("sprzedaz", { itemType: t, itemId: o.itemId });
  });
})();
