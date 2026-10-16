'use strict';
const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
const W = 1280, H = 720, cv = $('#cv'), g = cv.getContext('2d');
let media = {}, P = { name: 'Projeto sem título', clips: [] };
let sel = null, t = 0, playing = false, pps = 60, master = 1, last = 0, uid = 1;
let U = [], R = [], lastH = 0, exporting = false, cancelled = false, ctx, dest, rec;

let flt = 'all';
const IC = { video: '🎞', image: '🖼', audio: '🎵', text: 'T' };
const fv = (k, v) => k === 'vol' ? Math.round(v * 100) + '%' : v;
const id = () => 'i' + (uid++) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dur = () => P.clips.reduce((a, c) => Math.max(a, c.start + c.dur), 0);
const fmt = s => { s = Math.max(0, s); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + (s % 60).toFixed(1).padStart(4, '0'); };
const ok = (c, tr) => c.kind === 'text' ? tr === 1 : c.type === 'video' ? tr === 0 : c.type === 'audio' ? tr === 2 : tr < 2;
const toast = m => { const e = $('#toast'); e.textContent = m; e.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => e.classList.remove('on'), 2600); };
const inClip = c => t >= c.start && t < c.start + c.dur;

/* ---------- Histórico (desfazer/refazer) ---------- */
function hist() { U.push(JSON.stringify(P.clips)); if (U.length > 100) U.shift(); R = []; updBtns(); }
function undo() { if (!U.length) return; R.push(JSON.stringify(P.clips)); P.clips = JSON.parse(U.pop()); fix(); renderAll(); }
function redo() { if (!R.length) return; U.push(JSON.stringify(P.clips)); P.clips = JSON.parse(R.pop()); fix(); renderAll(); }
function fix() { if (sel && !P.clips.some(c => c.id === sel)) sel = null; }
function updBtns() { $('#undo').disabled = !U.length; $('#redo').disabled = !R.length; }

/* ---------- Importação de mídia ---------- */
function addFile(f) {
  return new Promise(res => {
    const type = f.type.startsWith('video') ? 'video' : f.type.startsWith('audio') ? 'audio' : f.type.startsWith('image') ? 'image' : null;
    if (!type) { toast('Formato não suportado: ' + f.name); return res(); }
    const url = URL.createObjectURL(f);
    let el;
    if (type === 'image') el = new Image(); else { el = document.createElement(type); el.preload = 'auto'; el.playsInline = true; }
    const done = () => {
      const m = Object.values(media).find(x => x.missing && x.name === f.name && x.type === type) || { id: id(), name: f.name, type };
      const d = type === 'image' ? 5 : (isFinite(el.duration) ? el.duration : 5);
      Object.assign(m, { url, el, missing: false, dur: d });
      media[m.id] = m; res();
    };
    el.onerror = () => { toast('Erro ao ler ' + f.name); res(); };
    if (type === 'image') { el.onload = done; el.src = url; } else { el.onloadedmetadata = done; el.src = url; }
  });
}
$('#import').onclick = () => $('#files').click();
$('#files').onchange = async e => {
  for (const f of e.target.files) await addFile(f);
  e.target.value = ''; renderAll();
};

function renderLib() {
  const L = $('#mediaList'); L.innerHTML = '';
  const all = Object.values(media), ms = all.filter(m => flt === 'all' || m.type === flt);
  if (!all.length) { L.innerHTML = '<div class="empty" id="emptyDrop"><b>＋</b><span>Importe ou solte arquivos aqui</span><small>vídeo · imagem · áudio</small></div>'; $('#emptyDrop').onclick = () => $('#files').click(); return; }
  if (!ms.length) { L.innerHTML = '<p class="hint">Nada nesta categoria.</p>'; return; }
  ms.forEach(m => {
    const d = document.createElement('div');
    d.className = 'item' + (m.missing ? ' miss' : ''); d.draggable = !m.missing;
    const th = m.missing ? '<div class="th">⚠</div>' : m.type === 'image' ? `<img class="th" src="${m.url}">` :
      m.type === 'video' ? `<video class="th" src="${m.url}#t=0.5" preload="metadata" muted playsinline></video>` : '<div class="th">♪</div>';
    d.innerHTML = th + `<div class="nm"><b>${esc(m.name)}</b><small>${m.missing ? 'reimporte este arquivo' : m.type + ' · ' + fmt(m.dur)}</small></div><button class="x" title="Remover">✕</button>`;
    d.onclick = e => { if (e.target.closest('.x')) return rmMedia(m.id); if (!m.missing) addClip(m); };
    d.ondragstart = e => e.dataTransfer.setData('text/plain', m.id);
    L.appendChild(d);
  });
}
function rmMedia(mid) {
  hist(); P.clips = P.clips.filter(c => c.m !== mid);
  const m = media[mid]; if (m) { if (m.el && m.el.pause) m.el.pause(); if (m.url) URL.revokeObjectURL(m.url); }
  delete media[mid]; fix(); renderAll();
}

/* ---------- Clipes ---------- */
function addClip(m, track, start) {
  if (track == null) track = m.type === 'audio' ? 2 : m.type === 'video' ? 0 : 1;
  if (start == null) start = track === 1 ? t : P.clips.filter(c => c.track === track).reduce((a, c) => Math.max(a, c.start + c.dur), 0);
  hist();
  const c = { id: id(), kind: 'media', m: m.id, type: m.type, track, start, dur: m.dur, in: 0, vol: 1, x: 50, y: 50, sc: m.type === 'image' && track === 1 ? 40 : 100 };
  P.clips.push(c); sel = c.id; renderAll();
}
$('#addText').onclick = () => {
  hist();
  const c = { id: id(), kind: 'text', type: 'text', track: 1, start: t, dur: 3, in: 0, vol: 1, text: 'Seu texto aqui', size: 64, color: '#ffffff', x: 50, y: 85 };
  P.clips.push(c); sel = c.id; renderAll();
};
function split() {
  let c = P.clips.find(x => x.id === sel);
  if (!c || t <= c.start + .05 || t >= c.start + c.dur - .05) c = [...P.clips].reverse().find(x => t > x.start + .05 && t < x.start + x.dur - .05);
  if (!c) return toast('Posicione o cursor sobre um clipe para dividir');
  hist();
  const n = { ...c, id: id(), start: t, in: c.in + (t - c.start), dur: c.start + c.dur - t };
  c.dur = t - c.start; P.clips.push(n); sel = n.id; renderAll();
}
function del() {
  if (!sel) return toast('Selecione um clipe');
  hist(); P.clips = P.clips.filter(c => c.id !== sel); sel = null; renderAll();
}
$('#split').onclick = split; $('#del').onclick = del;
$('#undo').onclick = undo; $('#redo').onclick = redo;
function select(i) { sel = i; renderTL(); renderProps(); }

/* ---------- Timeline ---------- */
function snap(s, c) {
  const th = 8 / pps, pts = [t, ...P.clips.filter(x => x !== c).flatMap(x => [x.start, x.start + x.dur])];
  for (const p of pts) { if (Math.abs(s - p) < th) return p; if (Math.abs(s + c.dur - p) < th) return p - c.dur; }
  return s;
}
function place(c) {
  const d = document.querySelector(`.clip[data-id="${c.id}"]`); if (!d) return;
  d.style.left = c.start * pps + 'px'; d.style.width = Math.max(8, c.dur * pps) + 'px';
  const l = document.querySelector(`.lane[data-t="${c.track}"]`); if (d.parentNode !== l) l.appendChild(d);
}
function drag(e, c, mode) {
  e.preventDefault(); e.stopPropagation(); select(c.id);
  const x0 = e.clientX, o = { ...c }, m = media[c.m];
  const lim = (c.type === 'video' || c.type === 'audio') && m ? m.dur : 1e9;
  let did = false;
  const mv = ev => {
    if (!did) { if (Math.abs(ev.clientX - x0) < 3 && mode !== 'move') return; hist(); did = true; }
    const dx = (ev.clientX - x0) / pps;
    if (mode === 'move') {
      c.start = Math.max(0, snap(o.start + dx, c));
      const l = document.elementFromPoint(ev.clientX, ev.clientY);
      const lane = l && l.closest('.lane');
      if (lane && ok(c, +lane.dataset.t)) c.track = +lane.dataset.t;
    } else if (mode === 'l') {
      let d = Math.min(o.dur - .2, Math.max(dx, -o.start));
      if (lim < 1e9) d = Math.max(d, -o.in);
      c.start = o.start + d; c.in = o.in + d; c.dur = o.dur - d;
    } else c.dur = Math.max(.2, Math.min(o.dur + dx, lim - c.in));
    place(c);
  };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); if (did) renderAll(); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}
function renderTL() {
  const T = Math.max(dur() + 5, 15), w = Math.max(T * pps, $('#tlScroll').clientWidth);
  $('#tlInner').style.width = w + 'px';
  const step = pps >= 100 ? 1 : pps >= 50 ? 2 : pps >= 25 ? 5 : 10; let r = '';
  for (let s = 0; s * pps < w; s += step) r += `<i style="left:${s * pps}px">${fmt(s).slice(0, 5)}</i>`;
  $('#ruler').innerHTML = r;
  $$('.lane').forEach(l => l.innerHTML = '');
  P.clips.forEach(c => {
    const d = document.createElement('div');
    d.className = 'clip ' + (c.kind === 'text' ? 'text' : c.type) + (c.id === sel ? ' sel' : '');
    d.dataset.id = c.id;
    d.style.left = c.start * pps + 'px'; d.style.width = Math.max(8, c.dur * pps) + 'px';
    const nm = c.kind === 'text' ? c.text : (media[c.m] ? media[c.m].name : '?');
    d.innerHTML = `<div class="h l"></div><span>${IC[c.kind === 'text' ? 'text' : c.type]} ${esc(nm)}</span><div class="h r"></div>`;
    d.onpointerdown = e => drag(e, c, e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move');
    document.querySelector(`.lane[data-t="${c.track}"]`).appendChild(d);
  });
}
$$('.lane').forEach(l => {
  l.ondragover = e => e.preventDefault();
  l.ondrop = e => {
    e.preventDefault();
    const m = media[e.dataTransfer.getData('text/plain')], tr = +l.dataset.t;
    if (!m) return;
    if (!ok({ type: m.type }, tr)) return toast('Esse tipo de mídia não cabe nessa faixa');
    addClip(m, tr, Math.max(0, (e.clientX - l.getBoundingClientRect().left) / pps));
  };
  l.onpointerdown = e => { if (e.target === l) select(null); };
});
const seek = e => { t = Math.max(0, Math.min((e.clientX - $('#tlInner').getBoundingClientRect().left) / pps, dur())); };
$('#ruler').onpointerdown = e => {
  e.preventDefault(); seek(e);
  const up = () => { removeEventListener('pointermove', seek); removeEventListener('pointerup', up); };
  addEventListener('pointermove', seek); addEventListener('pointerup', up);
};
$('#zoom').oninput = e => { pps = +e.target.value; renderTL(); };
addEventListener('resize', renderTL);

/* ---------- Propriedades ---------- */
function renderProps() {
  const c = P.clips.find(x => x.id === sel), p = $('#propBody');
  if (!c) { p.innerHTML = '<p class="hint">Selecione um clipe na timeline para editar.</p>'; return; }
  const f = (k, l, min, max, st = 1) => `<label><span class="lb">${l}<em>${fv(k, c[k])}</em></span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${st}" value="${c[k]}"></label>`;
  let h = `<p><b>${esc(c.kind === 'text' ? 'Texto' : (media[c.m] ? media[c.m].name : ''))}</b></p>`;
  if (c.kind === 'text') h += `<label>Texto<textarea data-k="text" rows="3">${esc(c.text)}</textarea></label>` + f('size', 'Tamanho', 16, 200) + `<label>Cor<input type="color" data-k="color" value="${c.color}"></label>`;
  if (c.track === 1) h += (c.kind === 'text' ? '' : f('sc', 'Escala (%)', 5, 100)) + f('x', 'Posição X (%)', 0, 100) + f('y', 'Posição Y (%)', 0, 100);
  if (c.type === 'video' || c.type === 'audio') h += f('vol', 'Volume do clipe', 0, 1, .01);
  h += `<label>Duração (s)<input type="number" data-k="dur" min="0.2" step="0.1" value="${c.dur.toFixed(2)}"></label>`;
  p.innerHTML = h;
  p.querySelectorAll('[data-k]').forEach(i => i.oninput = () => {
    const k = i.dataset.k; let v = (i.type === 'range' || i.type === 'number') ? parseFloat(i.value) : i.value;
    if (k === 'dur') { const m = media[c.m]; if (!(v >= .2)) return; if ((c.type === 'video' || c.type === 'audio') && m) v = Math.min(v, m.dur - c.in); }
    if (Date.now() - lastH > 800) hist(); lastH = Date.now();
    c[k] = v; renderTL();
    const em = i.parentNode.querySelector('em'); if (em) em.textContent = fv(k, v);
  });
}

/* ---------- Renderização e reprodução ---------- */
function put(m, c, ov) {
  const e = m.el, w = e.videoWidth || e.naturalWidth, h = e.videoHeight || e.naturalHeight;
  if (!w || (m.type === 'video' && e.readyState < 2)) return;
  let bw, bh;
  if (ov) { bw = W * c.sc / 100; bh = bw * h / w; } else { const r = Math.min(W / w, H / h); bw = w * r; bh = h * r; }
  const cx = ov ? W * c.x / 100 : W / 2, cy = ov ? H * c.y / 100 : H / 2;
  g.drawImage(e, cx - bw / 2, cy - bh / 2, bw, bh);
}
function draw() {
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.textAlign = 'center'; g.textBaseline = 'middle';
  const vs = P.clips.filter(c => c.track === 0 && inClip(c)), v = vs[vs.length - 1];
  if (v) { const m = media[v.m]; if (m && !m.missing) put(m, v); }
  else if (!P.clips.length) { g.fillStyle = '#555'; g.font = '30px system-ui'; g.fillText('Importe mídia e adicione à timeline', W / 2, H / 2); }
  P.clips.filter(c => c.track === 1 && inClip(c)).forEach(c => {
    if (c.kind === 'text') {
      g.font = `700 ${c.size}px system-ui,sans-serif`; g.lineWidth = c.size / 8; g.strokeStyle = 'rgba(0,0,0,.7)'; g.fillStyle = c.color;
      const ls = c.text.split('\n'), lh = c.size * 1.2;
      ls.forEach((l, i) => { const y = H * c.y / 100 + (i - (ls.length - 1) / 2) * lh; g.strokeText(l, W * c.x / 100, y); g.fillText(l, W * c.x / 100, y); });
    } else { const m = media[c.m]; if (m && !m.missing) put(m, c, true); }
  });
}
function sync() {
  const act = {};
  P.clips.forEach(c => { if ((c.type === 'video' && c.track === 0 || c.track === 2) && inClip(c)) act[c.m] = c; });
  Object.values(media).forEach(m => {
    if (m.missing || m.type === 'image') return;
    const c = act[m.id], e = m.el;
    if (!c) { if (!e.paused) e.pause(); return; }
    const tg = c.in + t - c.start; e.volume = Math.min(1, Math.max(0, c.vol * master));
    if (playing) { if (Math.abs(e.currentTime - tg) > .3) e.currentTime = tg; if (e.paused) e.play().catch(() => {}); }
    else { if (!e.paused) e.pause(); if (Math.abs(e.currentTime - tg) > .04) e.currentTime = tg; }
  });
}
function ui() {
  $('#tc').textContent = fmt(t) + ' / ' + fmt(dur());
  $('#play').textContent = playing ? '⏸' : '▶';
  $('#ph').style.left = t * pps + 'px';
  if (playing) { const s = $('#tlScroll'), x = t * pps; if (x > s.scrollLeft + s.clientWidth - 30 || x < s.scrollLeft) s.scrollLeft = Math.max(0, x - 60); }
  if (exporting) $('#pg').value = dur() ? t / dur() : 0;
  $('#barf').style.width = (dur() ? t / dur() * 100 : 0) + '%';
  $('#bigplay').style.display = (playing || exporting || !dur()) ? 'none' : 'flex';
}
function play() {
  if (exporting) return;
  if (!dur()) return toast('Adicione clipes à timeline primeiro');
  if (t >= dur() - .05) t = 0;
  playing = true;
}
function pause() { playing = false; }
const toggle = () => playing ? pause() : play();
$('#play').onclick = toggle;
$('#home').onclick = () => { if (!exporting) t = 0; };
$('#master').oninput = e => master = +e.target.value;

function loop(ts) {
  const dt = Math.min(.1, (ts - last) / 1000 || 0); last = ts;
  if (playing) {
    t += dt; const T = dur();
    if (t >= T) { t = T; pause(); if (exporting) setTimeout(() => rec && rec.state !== 'inactive' && rec.stop(), 300); }
  }
  sync(); draw(); ui(); requestAnimationFrame(loop);
}

/* ---------- Exportação ---------- */
function initAudio() {
  if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); dest = ctx.createMediaStreamDestination(); }
  Object.values(media).forEach(m => {
    if (m.type === 'image' || m.missing || m.node) return;
    m.node = ctx.createMediaElementSource(m.el); m.node.connect(ctx.destination); m.node.connect(dest);
  });
}
async function exportV() {
  if (exporting) return;
  if (!dur()) return toast('Adicione clipes à timeline primeiro');
  if (!window.MediaRecorder || !cv.captureStream) return toast('Este navegador não suporta exportação');
  pause(); initAudio(); await ctx.resume();
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(x => MediaRecorder.isTypeSupported(x)) || '';
  const st = cv.captureStream(30); dest.stream.getAudioTracks().forEach(a => st.addTrack(a));
  const ch = [];
  rec = new MediaRecorder(st, mime ? { mimeType: mime, videoBitsPerSecond: 6e6 } : {});
  rec.ondataavailable = e => e.data.size && ch.push(e.data);
  rec.onstop = () => {
    exporting = false; $('#ov').hidden = true;
    if (!cancelled) { dl(new Blob(ch, { type: rec.mimeType }), (P.name || 'video') + (rec.mimeType.includes('mp4') ? '.mp4' : '.webm')); toast('Vídeo exportado!'); }
  };
  cancelled = false; exporting = true; $('#ov').hidden = false; t = 0;
  rec.start(500); playing = true;
}
$('#export').onclick = exportV;
$('#cancel').onclick = () => { cancelled = true; pause(); if (rec && rec.state !== 'inactive') rec.stop(); };

/* ---------- Salvar / abrir projeto ---------- */
function dl(b, n) { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = n; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
$('#projName').oninput = e => P.name = e.target.value;
$('#save').onclick = () => {
  const data = { v: 1, name: P.name, clips: P.clips, media: Object.values(media).map(m => ({ id: m.id, name: m.name, type: m.type, dur: m.dur })) };
  dl(new Blob([JSON.stringify(data)], { type: 'application/json' }), (P.name || 'projeto') + '.json'); toast('Projeto salvo');
};
$('#open').onclick = () => $('#openFile').click();
$('#openFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text()); if (!Array.isArray(d.clips) || !Array.isArray(d.media)) throw 0;
    pause(); const old = Object.values(media); media = {};
    d.media.forEach(m => {
      const o = old.find(x => !x.missing && x.name === m.name && x.type === m.type && !Object.values(media).some(y => y.el === x.el));
      media[m.id] = o ? { ...o, id: m.id } : { ...m, missing: true };
    });
    old.forEach(o => { if (o.url && !Object.values(media).some(y => y.el === o.el)) URL.revokeObjectURL(o.url); });
    P = { name: d.name || 'Projeto', clips: d.clips }; $('#projName').value = P.name;
    U = []; R = []; sel = null; t = 0; renderAll();
    toast(Object.values(media).some(m => m.missing) ? 'Projeto aberto — reimporte as mídias marcadas com ⚠' : 'Projeto aberto');
  } catch { toast('Arquivo de projeto inválido'); }
  e.target.value = '';
};

/* ---------- Atalhos ---------- */
addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range') return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (k === ' ') { e.preventDefault(); toggle(); }
  else if (k === 'delete' || k === 'backspace') del();
  else if (k === 's' && !mod) split();
  else if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && k === 'y') { e.preventDefault(); redo(); }
});

cv.onclick = toggle; $('#bigplay').onclick = toggle;
$('#bar').onpointerdown = e => {
  const r = $('#bar').getBoundingClientRect(), f = ev => { t = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * dur(); };
  f(e); const up = () => { removeEventListener('pointermove', f); removeEventListener('pointerup', up); };
  addEventListener('pointermove', f); addEventListener('pointerup', up);
};
$$('#chips button').forEach(b => b.onclick = () => { flt = b.dataset.f; $$('#chips button').forEach(x => x.classList.toggle('on', x === b)); renderLib(); });
$('#lib').ondragover = e => e.preventDefault();
$('#lib').ondrop = async e => { e.preventDefault(); for (const f of e.dataTransfer.files) await addFile(f); renderAll(); };

function renderAll() { renderLib(); renderTL(); renderProps(); updBtns(); }
renderAll(); requestAnimationFrame(loop);
