// SPOR uygulaması - mantık. Veriler telefonun hafızasında (localStorage) tutulur.
(function () {
  'use strict';
  const KEY = 'spor.v1';
  const APP_VERSION = '11';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const slug = s => s.toLowerCase().replace(/[^a-z0-9ğüşıöç]+/g, '-');

  /* ---------- durum ---------- */
  const blank = () => ({ next: 0, days: {}, water: {}, meals: {}, picks: {}, supps: {}, logs: {}, weights: [], walk: {} });
  let S;
  try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { S = blank(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

  const pad = n => String(n).padStart(2, '0');
  const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dkey(new Date());
  const addDays = (k, n) => { const d = new Date(k + 'T12:00'); d.setDate(d.getDate() + n); return dkey(d); };
  const fmtDate = k => new Date(k + 'T12:00').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtShort = k => new Date(k + 'T12:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

  /* ---------- gün tipi ---------- */
  const T = () => today();
  const isOff = () => S.days[T()]?.type === 'off';
  const doneToday = () => S.days[T()]?.type === 'workout';
  const currentWorkoutIdx = () => doneToday() ? S.days[T()].w : S.next;
  function streak() { // bugünden önce art arda antrenman günü sayısı (boş gün = sayım biter)
    let n = 0, k = addDays(T(), -1);
    while (S.days[k]?.type === 'workout') { n++; k = addDays(k, -1); }
    return n;
  }

  /* ---------- tarif seçimi ---------- */
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  function makeLunch(avoid) {
    let r;
    for (let i = 0; i < 20; i++) {
      r = Math.random() < 0.45 ? { k: rnd(LUNCH_COMBOS).id } : { p: rnd(LUNCH_PROTEINS).id, c: rnd(LUNCH_CARBS).id };
      if (!avoid.includes(JSON.stringify(r))) break;
    }
    return r;
  }
  function makeDinner(avoid) {
    let r;
    for (let i = 0; i < 20; i++) {
      r = { p: rnd(DINNER_PROTEINS).id, t: Math.floor(Math.random() * DINNER_POTATOES.length), v: Math.floor(Math.random() * DINNER_VEG.length) };
      if (!avoid.some(a => JSON.parse(a).p === r.p)) break;
    }
    return r;
  }
  function makeBreakfast(avoid) {
    let r;
    for (let i = 0; i < 20; i++) { r = { b: rnd(BREAKFASTS).id }; if (!avoid.includes(JSON.stringify(r))) break; }
    return r;
  }
  const MAKERS = { kahvalti: makeBreakfast, ogle: makeLunch, ucuncu: makeLunch, aksam: makeDinner };

  function picks(slot) {
    const t = T();
    S.picks[t] = S.picks[t] || {};
    let p = S.picks[t][slot];
    if (!p) {
      const others = Object.entries(S.picks[t]).filter(([k]) => k !== slot).map(([, v]) => JSON.stringify(v.list[v.i]));
      p = S.picks[t][slot] = { list: [MAKERS[slot](others)], i: 0 };
      save();
    }
    return p;
  }
  function swipe(slot, dir) {
    const p = picks(slot);
    if (dir > 0) { // yeni tarif
      if (p.i < p.list.length - 1) p.i++;
      else { p.list.push(MAKERS[slot](p.list.map(x => JSON.stringify(x)))); p.i = p.list.length - 1; if (p.list.length > 15) { p.list.shift(); p.i--; } }
    } else if (p.i > 0) p.i--;
    save();
  }

  const byId = (arr, id) => arr.find(x => x.id === id);
  function resolve(slot) {
    const sel = picks(slot);
    const r = sel.list[sel.i];
    const off = isOff();
    const A = off ? CARB.off : CARB.train;
    if (slot === 'kahvalti') {
      const b = byId(BREAKFASTS, r.b);
      return { name: b.name, book: [b.book], ing: [...b.ing, ...(b.side ? b.side.ing : [])], steps: [...b.steps, ...(b.side ? b.side.steps : [])], tip: b.tip };
    }
    if (slot === 'aksam') {
      const p = byId(DINNER_PROTEINS, r.p), t = DINNER_POTATOES[r.t], v = DINNER_VEG[r.v];
      const ing = [...p.ing, `100 g ${v}`], steps = [...p.steps, `Yanına: 100 g ${v}'u buharda veya haşlayarak 8–12 dk pişir.`];
      let book = [p.book], sub = `+ ${v}`;
      if (!off) { ing.push(...t.ing); steps.push(`Patates (${t.name.toLowerCase()}): ` + t.steps.join(' ')); book.push(t.book); sub += ` · ${t.name.toLowerCase()}`; }
      ing.push(...DINNER_EXTRAS);
      return { name: p.name, sub, book, ing, steps, tip: p.tip, offNote: off ? 'Off gün: patates yok.' : '' };
    }
    // öğle & 3. öğün
    let o;
    if (r.k) { const k = byId(LUNCH_COMBOS, r.k); o = { name: k.name, book: [k.book], ing: k.ing(A), steps: k.steps, tip: k.tip }; }
    else {
      const p = byId(LUNCH_PROTEINS, r.p), c = byId(LUNCH_CARBS, r.c);
      o = { name: p.name, sub: '+ ' + c.name.toLowerCase(), book: [p.book, c.book], ing: [...p.ing, ...c.ing(A)], steps: [...p.steps, 'Yanına: ' + c.steps.join(' ')], tip: p.tip };
    }
    o.ing = [...o.ing, ...LUNCH_EXTRAS];
    o.offNote = off ? `Off gün: karbonhidrat ${CARB.off} g (antrenman gününde ${CARB.train} g).` : '';
    return o;
  }

  /* ---------- öğün planı ---------- */
  const SLOTS = [
    { id: 'kahvalti', label: 'Kahvaltı', no: '1. öğün', from: 7, to: 11, supp: 'morning' },
    { id: 'ara', label: 'Ara öğün', no: 'Ara', from: 11, to: 13 },
    { id: 'ogle', label: 'Öğle', no: '2. öğün', from: 13, to: 15 },
    { id: 'ucuncu', label: 'İkindi', no: '3. öğün', from: 15, to: 17 },
    { id: 'aksam', label: 'Akşam', no: '4. öğün', from: 16, to: 20, supp: 'evening' },
  ];
  const ate = id => !!S.meals[T()]?.[id];

  /* ---------- görünüm ---------- */
  let view = 'bugun', wView = null, openMeal = null;
  const app = $('#app');

  function render() {
    document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-current', b.dataset.v === view ? 'page' : 'false'));
    app.innerHTML = view === 'bugun' ? vToday() : view === 'antrenman' ? vWorkout() : view === 'liste' ? vShop() : vWeight();
    bind();
  }

  function dayCard() {
    const t = T(), off = isOff(), w = WORKOUTS[currentWorkoutIdx()], done = doneToday();
    const st = streak();
    if (off) {
      const walked = !!S.walk[t];
      return `<section class="day off">
        <div class="day-top"><span class="pill pill-off">Off gün</span><span class="muted">Sıradaki: ${WORKOUTS[S.next].name}</span></div>
        <h2>Rampa yürüyüşü</h2><p class="big">${OFF_WALK}</p>
        <div class="row">
          <button class="btn ${walked ? 'ok' : 'primary'}" data-act="walk">${walked ? '✓ Yürüdüm' : 'Yürüyüşü bitirdim'}</button>
          <button class="btn ghost" data-act="unoff">Off'u kaldır</button>
        </div></section>`;
    }
    return `<section class="day">
        <div class="day-top"><span class="pill ${done ? 'pill-ok' : 'pill-train'}">${done ? 'Tamamlandı' : 'Bugünkü antrenman'}</span><span class="muted">${w.name}</span></div>
        <h2>${esc(w.focus)}</h2>
        <p class="muted small">${w.main.length} hareket · sonunda ${esc(w.cardio)}</p>
        ${!done && st >= 2 ? `<p class="hint">Son ${st} gün antrenman yaptın. Programa göre bugün off günü.</p>` : ''}
        ${done ? '' : `<label class="check"><input type="checkbox" id="offbox" data-act="off"> Bugün off</label>`}
      </section>`;
  }

  function vToday() {
    const t = T(), off = isOff(), done = doneToday();
    const h = new Date().getHours();
    const status = off ? `<span class="pill pill-off">Off gün</span>` : `<span class="pill ${done ? 'pill-ok' : 'pill-train'}">${done ? 'Antrenman tamam' : 'Antrenman günü'}</span>`;
    const ml = S.water[t] || 0, pct = Math.min(1, ml / WATER_GOAL);
    // Su rengi: 0-1 L kırmızı · 1-2 L sarı · 2-3 L turuncu · 3-4 L açık yeşil · 4-6 L koyu yeşil · 6 L üstü kırmızı
    const wcol = ml > 6000 ? '#ff4d4d' : ml >= 4000 ? '#1f9d55' : ml >= 3000 ? '#7ee081' : ml >= 2000 ? '#ff9a3c' : ml >= 1000 ? '#ffd43b' : '#ff4d4d';
    const water = `<section class="card water">
      <div class="ring" style="--p:${pct};--wc:${wcol}"><span><b>${(ml / 1000).toFixed(ml % 1000 ? 2 : 0).replace('.', ',')}</b> / 4 L</span></div>
      <div class="wbody"><h3>Su</h3><p class="muted small">${ml > 6000 ? 'Çok fazla su içtin, bugünlük yeter.' : ml >= WATER_GOAL ? 'Hedef tamam.' : `${((WATER_GOAL - ml) / 1000).toFixed(2).replace('.', ',')} L kaldı`}</p>
      <div class="row"><button class="btn sm" data-water="250">+ 250 ml</button><button class="btn sm" data-water="500">+ 500 ml</button><button class="btn sm ghost" data-water="-250" aria-label="250 ml geri al">−</button></div></div>
    </section>`;

    const meals = SLOTS.map(s => {
      const now = h >= s.from && h < s.to, a = ate(s.id);
      const time = `${pad(s.from)}:00–${pad(s.to)}:00`;
      if (s.id === 'ara') return `<li class="meal ${now ? 'now' : ''} ${a ? 'ate' : ''}">
        <div class="tl"><span class="time">${time}</span></div>
        <div class="mc"><div class="mh"><div><span class="eyebrow">${s.no}</span><h3>${SNACK.name}</h3></div>${ateBtn(s.id, a)}</div>
        <p class="muted">${SNACK.ing.join(' · ')}</p></div></li>`;
      const r = resolve(s.id), open = openMeal === s.id, sel = picks(s.id);
      const supp = s.supp ? suppBlock(s.supp) : '';
      return `<li class="meal ${now ? 'now' : ''} ${a ? 'ate' : ''}">
        <div class="tl"><span class="time">${time}</span></div>
        <div class="mc swipe" data-slot="${s.id}">
          <div class="mh"><div><span class="eyebrow">${s.no} · ${s.label}</span><h3>${esc(r.name)}</h3>${r.sub ? `<p class="sub">${esc(r.sub)}</p>` : ''}</div>${ateBtn(s.id, a)}</div>
          ${r.offNote ? `<p class="hint">${esc(r.offNote)}</p>` : ''}
          <div class="mrow"><button class="link" data-open="${s.id}">${open ? 'Tarifi gizle' : 'Tarifi göster'}</button>
            <span class="swipe-ctl"><button class="btn sm ghost" data-prev="${s.id}" ${sel.i === 0 ? 'disabled' : ''} aria-label="Önceki tarif">‹</button><button class="btn sm ghost" data-next="${s.id}" aria-label="Başka tarif">Başka ›</button></span></div>
          ${open ? `<div class="recipe">
            <h4>Malzemeler</h4><ul>${r.ing.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
            <h4>Yapılışı</h4><ol>${r.steps.map(i => `<li>${esc(i)}</li>`).join('')}</ol>
            ${r.tip ? `<p class="tip">${esc(r.tip)}</p>` : ''}
            <p class="muted small">Tarif kitabı no: ${r.book.join(', ')}</p></div>` : ''}
          ${supp}
        </div></li>`;
    }).join('');

    return `<header class="top"><p class="eyebrow">${esc(fmtDate(t))}</p><div class="hrow"><h1>Bugün</h1>${status}</div></header>
      ${progressCard()}
      <h2 class="sec">Öğünler <span class="muted small">kaydırarak başka tarif</span></h2>
      <ol class="timeline">${meals}</ol>
      ${water}
      <details class="card rules"><summary>Beslenme kuralları</summary><ul>${DIET_RULES.map(r => `<li>${esc(r)}</li>`).join('')}</ul></details>`;
  }
  /* ---------- günlük görev yüzdesi + çizgi adam ---------- */
  function progress() {
    const t = T(), m = S.meals[t] || {}, sp = S.supps[t] || {};
    const meals = SLOTS.filter(x => m[x.id]).length;
    const suppKeys = [...SUPPS.morning.map(n => 'morning:' + n), ...SUPPS.evening.map(n => 'evening:' + n)];
    const supps = suppKeys.filter(k => sp[k]).length;
    const water = Math.min(1, (S.water[t] || 0) / WATER_GOAL);
    const sport = isOff() ? !!S.walk[t] : doneToday();
    const total = SLOTS.length + suppKeys.length + 2;
    const pct = Math.round((meals + supps + water + (sport ? 1 : 0)) / total * 100);
    return { pct, meals, supps, suppN: suppKeys.length, water, sport };
  }
  function stickman(pct) {
    // Seviyeler: 0 bükük · 25 kollar aşağı · 50 eller belde · 75 kollar yukarı · 100 kollar tam havada + zıplama. Kollar seviyeyle kalınlaşır.
    const lv = pct >= 100 ? 4 : pct >= 75 ? 3 : pct >= 50 ? 2 : pct >= 25 ? 1 : 0;
    const arms = [
      'M30 44 L22 64 M30 44 L38 64',
      'M30 42 L19 60 M30 42 L41 60',
      'M30 42 L20 52 L24 60 M30 42 L40 52 L36 60',
      'M30 42 L16 34 L14 24 M30 42 L44 34 L46 24',
      'M30 42 L13 30 L6 12 M30 42 L47 30 L54 12',
    ][lv];
    const legs = lv === 4 ? 'M30 66 L19 90 M30 66 L41 90' : 'M30 66 L22 92 M30 66 L38 92';
    const body = lv === 0 ? 'M30 33 L31 66' : 'M30 33 L30 66';
    const armW = [3.2, 3.6, 4.4, 5.2, 6.2][lv];
    return `<svg class="stick lv${lv}" viewBox="0 0 60 96" role="img" aria-label="Çizgi adam, günlük görevler yüzde ${pct}">
      <g class="fig"><path d="${body} ${legs}" class="limbs"/><path d="${arms}" class="limbs" style="stroke-width:${armW}"/>
      <image href="yuz.png" x="16.5" y="0" width="27" height="34"/></g></svg>`;
  }
  function progressCard() {
    const p = progress();
    const msg = p.pct >= 100 ? 'Bugünü tamamladın!' : p.pct >= 75 ? 'Az kaldı!' : p.pct >= 50 ? 'Yarıyı geçtin, devam.' : p.pct > 0 ? 'Güzel başlangıç.' : 'Haydi, ilk görevle başla.';
    return `<section class="card prog">${stickman(p.pct)}
      <div class="pbody"><div class="phead"><span class="eyebrow">Günlük görevler</span><b class="pnum">%${p.pct}</b></div>
        <div class="barwrap"><div class="bar" role="progressbar" aria-valuenow="${p.pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p.pct}%"></span>${[25, 50, 75].map(m => `<i style="left:${m}%"></i>`).join('')}</div>
          <div class="marks">${[25, 50, 75, 100].map(m => `<b class="${p.pct >= m ? 'hit' : ''}" style="left:${m}%">%${m}</b>`).join('')}</div></div>
        <p class="small muted">${msg}</p>
        <p class="pparts">Öğün ${p.meals}/${SLOTS.length} · Vitamin ${p.supps}/${p.suppN} · Su ${(p.water * 4).toFixed(1).replace('.', ',')}/4 L · Spor ${p.sport ? '✓' : '–'}</p></div></section>`;
  }
  const ateBtn = (id, a) => `<button class="tick ${a ? 'on' : ''}" data-ate="${id}" aria-pressed="${a}" aria-label="Yedim">${a ? '✓' : ''}</button>`;
  function suppBlock(which) {
    const got = S.supps[T()] || {};
    return `<div class="supps"><span class="eyebrow">${which === 'morning' ? 'Sabah vitaminleri' : 'Akşam vitaminleri'}</span>
      <div class="chips">${SUPPS[which].map(n => { const k = which + ':' + n; return `<button class="chip ${got[k] ? 'on' : ''}" data-supp="${esc(k)}">${got[k] ? '✓ ' : ''}${esc(n)}</button>`; }).join('')}</div></div>`;
  }

  /* ---------- antrenman ---------- */
  function lastLog(exId, before) {
    const ds = Object.keys(S.logs).filter(d => d < before && S.logs[d][exId]).sort();
    return ds.length ? S.logs[ds[ds.length - 1]][exId] : null;
  }
  function vWorkout() {
    const t = T(), idx = wView ?? currentWorkoutIdx(), w = WORKOUTS[idx], done = doneToday() && S.days[t].w === idx;
    const isCurrent = idx === currentWorkoutIdx() && !isOff();
    const logT = S.logs[t] || {};
    const list = (arr, cls) => `<ul class="simple ${cls}">${arr.map(e => `<li><span>${esc(e.n)}</span><span class="muted">${esc(e.s)}</span>${e.v ? `<a class="vid" href="${e.v}" target="_blank" rel="noopener" aria-label="${esc(e.n)} videosu">▶</a>` : ''}</li>`).join('')}</ul>`;
    let prevSS = null;
    const main = w.main.map(e => {
      const id = slug(e.n), prev = lastLog(id, t), cur = logT[id] || [];
      const ssHead = e.ss && e.ss !== prevSS ? `<li class="ss-head">Süperset: iki hareketi dinlenmeden arka arkaya yap</li>` : '';
      prevSS = e.ss || null;
      const rows = Array.from({ length: e.sets }, (_, i) => {
        const c = cur[i] || {}, p = prev?.[i] || {};
        return `<div class="set"><span class="sn">${i + 1}</span>
          <input id="kg-${id}-${i}" inputmode="decimal" placeholder="${p.kg ?? 'kg'}" value="${c.kg ?? ''}" data-log="${id}" data-i="${i}" data-f="kg" aria-label="${i + 1}. set kilo"><span class="u">kg</span>
          <input id="r-${id}-${i}" inputmode="numeric" placeholder="${p.r ?? (e.unit || 'tekrar')}" value="${c.r ?? ''}" data-log="${id}" data-i="${i}" data-f="r" aria-label="${i + 1}. set ${e.unit || 'tekrar'}"><span class="u">${e.unit || 'tkr'}</span></div>`;
      }).join('');
      return `${ssHead}<li class="ex ${e.ss ? 'ss' : ''}">
        <div class="exh"><div><h3>${esc(e.n)}</h3><span class="target">${esc(e.s)}</span></div>${e.v ? `<a class="vid big" href="${e.v}" target="_blank" rel="noopener">▶ Video</a>` : ''}</div>
        ${e.note ? `<p class="note">${esc(e.note)}</p>` : ''}
        ${prev ? `<p class="muted small">Geçen sefer: ${prev.filter(x => x.kg || x.r).map(x => `${x.kg || '–'}×${x.r || '–'}`).join(', ')}</p>` : ''}
        <div class="sets">${rows}</div></li>`;
    }).join('');

    const hist = Object.entries(S.days).filter(([, v]) => v.type).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8)
      .map(([d, v]) => `<li><span>${fmtShort(d)}</span><span>${v.type === 'off' ? 'Off' : WORKOUTS[v.w].name + ' · ' + WORKOUTS[v.w].focus}</span></li>`).join('');

    return `<header class="top"><p class="eyebrow">Program · 2 gün antrenman, 1 gün off</p><h1>Spor</h1></header>
      ${dayCard()}
      <div class="seg" role="tablist">${WORKOUTS.map((x, i) => `<button role="tab" aria-selected="${i === idx}" data-w="${i}">${x.name}${i === currentWorkoutIdx() && !isOff() ? ' •' : ''}</button>`).join('')}</div>
      <section class="card"><h2>${esc(w.focus)}</h2><ul class="notes">${PROGRAM_NOTES.map(n => `<li>${esc(n)}</li>`).join('')}</ul></section>
      <h2 class="sec">Isınma</h2>${list(w.warm, 'warm')}
      <h2 class="sec">Ana antrenman</h2><ol class="exlist">${main}</ol>
      <section class="card cardio"><span class="eyebrow">Antrenman sonu</span><p class="big">${esc(w.cardio)}</p></section>
      <h2 class="sec">Soğuma</h2>${list(w.cool, 'cool')}
      <div class="finish">${done ? `<p class="okmsg">✓ Bugün ${w.name} tamamlandı. Sıradaki: ${WORKOUTS[S.next].name}</p><button class="btn ghost" data-act="undo">Geri al</button>`
        : isCurrent ? `<button class="btn primary wide" data-act="done">Antrenmanı bitirdim</button>` : `<p class="muted small">Sıradaki antrenmanın ${WORKOUTS[currentWorkoutIdx()].name}. Bu günü sadece inceliyorsun.</p>`}</div>
      ${hist ? `<h2 class="sec">Son günler</h2><ul class="simple hist">${hist}</ul>` : ''}`;
  }

  /* ---------- malzeme listesi ---------- */
  let shopOpen = null;
  function vShop() {
    const got = S.shop || {};
    const cards = SHOP_PACKS.map((p, i) => {
      const all = p.items.flatMap(g => g[1]), n = all.filter(x => got[x]).length, open = shopOpen === i;
      return `<section class="card pack ${open ? 'open' : ''}">
        <button class="packhead" data-pack="${i}" aria-expanded="${open}">
          <span class="packno">${i + 1}</span>
          <span class="packtxt"><b>${i + 1}. paket</b><span class="muted small">Tariflerin %${p.pct}'i · ${p.recipes}/${SHOP_TOTAL} tarif · ${all.length} malzeme</span></span>
          <span class="packcnt ${n === all.length ? 'good' : ''}">${n}/${all.length}</span></button>
        <div class="bar thin"><span style="width:${all.length ? n / all.length * 100 : 0}%"></span></div>
        ${open ? `<div class="packbody">
          ${i > 0 ? `<p class="muted small">${i === 1 ? '1. paketin' : `1–${i}. paketlerin`} üstüne alınacaklar.</p>` : ''}
          ${p.items.map(([cat, list]) => `<h4>${esc(cat)}</h4><ul class="shoplist">${list.map(x => `<li><label class="${got[x] ? 'got' : ''}"><input type="checkbox" data-shop="${esc(x)}" ${got[x] ? 'checked' : ''}> ${esc(x)}</label></li>`).join('')}</ul>`).join('')}
          <details><summary class="small">Bu paketle açılan ${p.unlocks.length} tarif</summary><p class="muted small">${p.unlocks.map(esc).join(' · ')}</p></details>
          ${n ? `<button class="link" data-shopclear="${i}">İşaretleri temizle</button>` : ''}
        </div>` : ''}
      </section>`;
    }).join('');
    return `<header class="top"><p class="eyebrow">Tarif kitabından · en çok kullanılandan aza</p><h1>Malzeme listesi</h1></header>
      <p class="muted small">Paketler üst üste eklenir. 1. paketle tariflerin %25'ini yapabilirsin, 4 paketin hepsiyle tamamını. Aldıklarını işaretle.</p>
      ${cards}`;
  }

  /* ---------- kilo ---------- */
  function vWeight() {
    const ws = [...S.weights].sort((a, b) => a.d.localeCompare(b.d));
    const last = ws[ws.length - 1], first = ws[0];
    const since = last ? Math.round((new Date(T() + 'T12:00') - new Date(last.d + 'T12:00')) / 864e5) : null;
    const due = since === null || since >= 7;
    const diff = last && first && ws.length > 1 ? (last.kg - first.kg) : null;
    return `<header class="top"><p class="eyebrow">Haftada bir tartıl</p><h1>Kilo</h1></header>
      <section class="card stats">
        <div><span class="eyebrow">Şu an</span><b class="num">${last ? last.kg.toFixed(1).replace('.', ',') : '–'}</b><span class="muted small">kg</span></div>
        <div><span class="eyebrow">Toplam</span><b class="num ${diff < 0 ? 'good' : ''}">${diff === null ? '–' : (diff > 0 ? '+' : '') + diff.toFixed(1).replace('.', ',')}</b><span class="muted small">kg</span></div>
        <div><span class="eyebrow">Son tartı</span><b class="num">${since === null ? '–' : since}</b><span class="muted small">gün önce</span></div>
      </section>
      ${due ? `<p class="hint">${since === null ? 'İlk kilonu gir, takip buradan başlasın.' : 'Tartılma zamanı geldi.'}</p>` : ''}
      <form class="card wform" id="wform"><label for="wkg">Bugünkü kilon</label>
        <div class="row"><input id="wkg" inputmode="decimal" placeholder="örn. 82,4" required><span class="u">kg</span><button class="btn primary">Kaydet</button></div></form>
      ${ws.length > 1 ? chart(ws) : ''}
      ${ws.length ? `<h2 class="sec">Kayıtlar</h2><ul class="simple hist">${[...ws].reverse().map((x, i, arr) => {
        const prev = arr[i + 1]; const d = prev ? x.kg - prev.kg : null;
        return `<li><span>${fmtShort(x.d)}</span><span class="num">${x.kg.toFixed(1).replace('.', ',')} kg ${d !== null ? `<small class="${d < 0 ? 'good' : 'bad'}">${d > 0 ? '+' : ''}${d.toFixed(1).replace('.', ',')}</small>` : ''}</span><button class="x" data-delw="${x.d}" aria-label="Sil">×</button></li>`;
      }).join('')}</ul>` : ''}
      <section class="card backup"><h3>Yedek</h3><p class="muted small">Verilerin bu telefonda saklanıyor. Ara sıra yedeği kopyalayıp bilgisayarındaki Spor/veriler klasörüne kaydet.</p>
        <div class="row"><button class="btn sm" data-act="export">Yedeği kopyala</button><button class="btn sm ghost" data-act="import">Yedek yükle</button></div>
        <textarea id="bk" hidden rows="4" placeholder="Yedek metnini buraya yapıştır"></textarea><p id="bkmsg" class="muted small"></p></section>
      <p class="muted small" style="text-align:center">SpORN sürüm ${APP_VERSION}</p>`;
  }
  function chart(ws) {
    const W = 340, H = 150, P = 28;
    const ks = ws.map(x => x.kg), min = Math.floor(Math.min(...ks) - 1), max = Math.ceil(Math.max(...ks) + 1);
    const t0 = new Date(ws[0].d).getTime(), t1 = new Date(ws[ws.length - 1].d).getTime() || t0 + 1;
    const X = d => P + (new Date(d).getTime() - t0) / Math.max(1, t1 - t0) * (W - P - 10);
    const Y = k => 10 + (max - k) / (max - min) * (H - 30);
    const pts = ws.map(x => `${X(x.d).toFixed(1)},${Y(x.kg).toFixed(1)}`);
    const lx = ws[ws.length - 1];
    return `<section class="card"><svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Kilo grafiği">
      ${[max, (max + min) / 2, min].map(v => `<line x1="${P}" x2="${W - 6}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${P - 6}" y="${Y(v) + 4}" text-anchor="end" class="ax">${Math.round(v)}</text>`).join('')}
      <polygon points="${P},${Y(min)} ${pts.join(' ')} ${X(lx.d)},${Y(min)}" class="area"/>
      <polyline points="${pts.join(' ')}" class="line"/>
      <circle cx="${X(lx.d)}" cy="${Y(lx.kg)}" r="4.5" class="dot"/>
      <text x="${P}" y="${H - 4}" class="ax">${fmtShort(ws[0].d)}</text><text x="${W - 6}" y="${H - 4}" text-anchor="end" class="ax">${fmtShort(lx.d)}</text>
    </svg></section>`;
  }

  /* ---------- olaylar ---------- */
  function act(a) {
    const t = T();
    if (a === 'off') { S.days[t] = { type: 'off' }; }
    else if (a === 'unoff') { delete S.days[t]; }
    else if (a === 'walk') { S.walk[t] = !S.walk[t]; }
    else if (a === 'done') { S.days[t] = { type: 'workout', w: S.next }; S.next = (S.next + 1) % WORKOUTS.length; wView = null; }
    else if (a === 'undo') { const d = S.days[t]; if (d?.type === 'workout') { S.next = d.w; delete S.days[t]; } }
    else if (a === 'export') {
      const txt = JSON.stringify(S);
      const ta = $('#bk'); ta.hidden = false; ta.value = txt; ta.select();
      (navigator.clipboard?.writeText(txt) || Promise.reject()).then(() => { $('#bkmsg').textContent = 'Kopyalandı. Notlar veya dosyaya yapıştırıp kaydedebilirsin.'; }, () => { $('#bkmsg').textContent = 'Metni seçip kopyala.'; });
      return;
    }
    else if (a === 'import') {
      const ta = $('#bk');
      if (ta.hidden || !ta.value.trim()) { ta.hidden = false; ta.value = ''; ta.focus(); $('#bkmsg').innerHTML = 'Yedeği yapıştır, sonra tekrar "Yedek yükle"ye bas.'; return; }
      try { S = Object.assign(blank(), JSON.parse(ta.value)); save(); $('#bkmsg').textContent = 'Yüklendi.'; } catch (e) { $('#bkmsg').textContent = 'Bu metin geçerli bir yedek değil.'; return; }
    }
    save(); render();
  }

  function bind() {
    app.querySelectorAll('[data-act]').forEach(b => b.addEventListener(b.type === 'checkbox' ? 'change' : 'click', () => act(b.dataset.act)));
    app.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { view = b.dataset.go; render(); scrollTo(0, 0); }));
    app.querySelectorAll('[data-water]').forEach(b => b.addEventListener('click', () => { const t = T(); S.water[t] = Math.max(0, (S.water[t] || 0) + +b.dataset.water); save(); render(); }));
    app.querySelectorAll('[data-ate]').forEach(b => b.addEventListener('click', () => { const t = T(); S.meals[t] = S.meals[t] || {}; S.meals[t][b.dataset.ate] = !S.meals[t][b.dataset.ate]; save(); render(); }));
    app.querySelectorAll('[data-supp]').forEach(b => b.addEventListener('click', () => { const t = T(); S.supps[t] = S.supps[t] || {}; S.supps[t][b.dataset.supp] = !S.supps[t][b.dataset.supp]; save(); render(); }));
    app.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { openMeal = openMeal === b.dataset.open ? null : b.dataset.open; render(); }));
    app.querySelectorAll('[data-next]').forEach(b => b.addEventListener('click', () => { swipe(b.dataset.next, 1); render(); }));
    app.querySelectorAll('[data-prev]').forEach(b => b.addEventListener('click', () => { swipe(b.dataset.prev, -1); render(); }));
    app.querySelectorAll('[data-w]').forEach(b => b.addEventListener('click', () => { wView = +b.dataset.w; render(); }));
    app.querySelectorAll('[data-log]').forEach(inp => inp.addEventListener('input', () => {
      const t = T(), id = inp.dataset.log, i = +inp.dataset.i;
      S.logs[t] = S.logs[t] || {}; S.logs[t][id] = S.logs[t][id] || [];
      S.logs[t][id][i] = Object.assign({}, S.logs[t][id][i], { [inp.dataset.f]: inp.value.replace(',', '.') });
      save();
    }));
    app.querySelectorAll('[data-pack]').forEach(b => b.addEventListener('click', () => { const i = +b.dataset.pack; shopOpen = shopOpen === i ? null : i; render(); }));
    app.querySelectorAll('[data-shop]').forEach(c => c.addEventListener('change', () => { S.shop = S.shop || {}; S.shop[c.dataset.shop] = c.checked; save(); render(); }));
    app.querySelectorAll('[data-shopclear]').forEach(b => b.addEventListener('click', () => { const p = SHOP_PACKS[+b.dataset.shopclear]; p.items.flatMap(g => g[1]).forEach(x => { if (S.shop) delete S.shop[x]; }); save(); render(); }));
    app.querySelectorAll('[data-delw]').forEach(b => b.addEventListener('click', () => { S.weights = S.weights.filter(x => x.d !== b.dataset.delw); save(); render(); }));
    const wf = $('#wform');
    if (wf) wf.addEventListener('submit', e => {
      e.preventDefault();
      const kg = parseFloat($('#wkg').value.replace(',', '.'));
      if (!(kg > 20 && kg < 300)) { $('#wkg').setCustomValidity('Geçerli bir kilo gir'); $('#wkg').reportValidity(); return; }
      S.weights = S.weights.filter(x => x.d !== T()); S.weights.push({ d: T(), kg }); save(); render();
    });
    // kaydırma ile tarif değiştirme
    app.querySelectorAll('.swipe').forEach(el => {
      let x0 = null, y0 = 0, dx = 0;
      el.addEventListener('touchstart', e => { if (e.target.closest('button,a,input')) return; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; }, { passive: true });
      el.addEventListener('touchmove', e => {
        if (x0 === null) return;
        dx = e.touches[0].clientX - x0;
        if (Math.abs(dx) > Math.abs(e.touches[0].clientY - y0)) el.style.transform = `translateX(${dx * 0.6}px)`;
      }, { passive: true });
      el.addEventListener('touchend', () => {
        if (x0 === null) return;
        el.style.transform = '';
        if (Math.abs(dx) > 60) { swipe(el.dataset.slot, dx < 0 ? 1 : -1); render(); }
        x0 = null;
      });
    });
  }

  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { view = b.dataset.v; wView = null; render(); scrollTo(0, 0); }));
  // gece yarısı geçince ekranı yenile
  let lastDay = T();
  setInterval(() => { if (T() !== lastDay) { lastDay = T(); render(); } }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  render();
})();
