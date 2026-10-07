(() => {
'use strict';

const W = 400, H = 720, LINE = H - 92, TAU = Math.PI * 2;
const cv = document.getElementById('c'), ctx = cv.getContext('2d'), gameEl = document.getElementById('game');
const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- Persistenz ---------- */
const ld = (k, d) => { try { const v = localStorage.getItem('gs_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
const sv = (k, v) => { try { localStorage.setItem('gs_' + k, JSON.stringify(v)); } catch (e) {} };
let hi = ld('hi', 0), bestC = ld('bestC', 0), credits = ld('cred', 0), soundOn = ld('snd', true);
const up = Object.assign({ dmg: 0, rate: 0, shield: 0, hp: 0, crit: 0 }, ld('up', {}));
const UPG = [
  ['dmg', 'DAMAGE', '+0.5 Bullet Damage'],
  ['rate', 'FIRE RATE', '+10% Fire Rate'],
  ['shield', 'SHIELD', '+3 s Shield am Start'],
  ['hp', 'MAX HEALTH', '+1 Start-Leben'],
  ['crit', 'CRIT CHANCE', '+5% Critical Hit (x2.5)']
];

/* ---------- Daten ---------- */
const DEF = {
  fighter:  { r: 14, hp: 1, sp: 2.0, pts: 10, c: '#4dd8ff', drop: 0.09 },
  tank:     { r: 24, hp: 6, sp: 0.8, pts: 30, c: '#a98bff', drop: 0.2 },
  shooter:  { r: 17, hp: 2, sp: 1.0, pts: 20, c: '#ff7ad9', drop: 0.12 },
  kamikaze: { r: 12, hp: 1, sp: 3.6, pts: 15, c: '#ff9a3c', drop: 0.05 },
  elite:    { r: 19, hp: 4, sp: 1.5, pts: 40, c: '#ffd23c', drop: 0.45 }
};
const SHAPE = {
  fighter: [[0, 1], [-.95, -.6], [0, -.2], [.95, -.6]],
  kamikaze: [[0, 1.2], [-.6, -.5], [0, -.1], [.6, -.5]],
  shooter: [[0, 1], [-1, 0], [0, -1], [1, 0]],
  elite: [[0, 1], [-1.3, -.2], [-.5, -.8], [0, -.4], [.5, -.8], [1.3, -.2]],
  tank: [0, 1, 2, 3, 4, 5].map(i => [Math.cos(i * TAU / 6), Math.sin(i * TAU / 6)])
};
const PU = {
  rapid: ['#ffe03c', 'R'], triple: ['#3dffa0', 'T'], shield: ['#4df2ff', 'S'], laser: ['#ff3da0', 'L'],
  bomb: ['#ff8a2b', 'B'], dmg: ['#ff3d5a', 'D'], magnet: ['#c77dff', 'M']
};
const PUK = Object.keys(PU);
const SPD = [0.35, 0.9, 2.1];
const mult = c => c >= 20 ? 5 : c >= 10 ? 4 : c >= 5 ? 3 : c >= 2 ? 2 : 1;
const dmgOf = () => (1 + 0.5 * up.dmg) * (run && run.timers.dmg > 0 ? 2 : 1);

/* ---------- Zustand ---------- */
let state = 'menu', run = null, AC = null, noiseBuf = null;
let bullets = [], ebul = [], enemies = [], drops = [], parts = [], pops = [], attract = [];
const pl = { x: W / 2, y: H - 64, tx: W / 2, ty: H - 64 };
const keys = {};
const stars = [0, 1, 2].map(i => Array.from({ length: [70, 45, 24][i] }, () => ({ x: Math.random() * W, y: Math.random() * H, b: 0.3 + Math.random() * 0.7 })));
let planet = { x: 300, y: -120, r: 70 };

/* ---------- Sound (Web Audio, optional) ---------- */
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(f, d, type = 'square', v = 0.05, slide = 0) {
  const a = audio(); if (!a || !soundOn) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + d);
}
function boom(v = 0.25, d = 0.4) {
  const a = audio(); if (!a || !soundOn) return;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 0.6, a.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter(), t = a.currentTime;
  s.buffer = noiseBuf; f.type = 'lowpass';
  f.frequency.setValueAtTime(1200, t); f.frequency.exponentialRampToValueAtTime(80, t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(f).connect(g).connect(a.destination); s.start(t); s.stop(t + d);
}
const SFX = {
  shoot: () => tone(880, 0.05, 'square', 0.012, 0.5),
  pop: () => { tone(520, 0.14, 'sawtooth', 0.04, 0.3); boom(0.12, 0.22); },
  pu: () => tone(660, 0.25, 'sine', 0.08, 2),
  warn: () => tone(200, 0.3, 'sawtooth', 0.05, 0.7),
  boss: () => { boom(0.5, 1.3); tone(90, 0.8, 'sawtooth', 0.08, 0.5); }
};

/* ---------- Effekte ---------- */
function addP(p) { if (parts.length > 450) parts.splice(0, 50); parts.push(p); }
function explode(x, y, r, c, big) {
  const n = big ? 70 : Math.min(26, 8 + r);
  addP({ x, y, vx: 0, vy: 0, life: 14, max: 14, c: '#fff', s: r * 1.1, k: 'f' });
  addP({ x, y, vx: 0, vy: 0, life: 24, max: 24, c, s: r * 1.3, k: 'r' });
  if (big) addP({ x, y, vx: 0, vy: 0, life: 40, max: 40, c: '#ffb35c', s: r * 2.4, k: 'r' });
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, sp = rnd(1, 5) * (big ? 1.6 : 1), L = rnd(18, 42);
    addP({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: L, max: L, c: Math.random() < 0.5 ? c : '#ffd27a', s: rnd(1.5, 4), k: 'p' });
  }
  for (let i = 0; i < (big ? 20 : 5); i++) {
    const a = Math.random() * TAU, sp = rnd(0.3, 1.2), L = rnd(30, 55);
    addP({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.4, life: L, max: L, c: 'rgba(160,170,200,.5)', s: rnd(5, 11), k: 's' });
  }
}
function popup(x, y, t, c) { pops.push({ x, y, t, c, life: 50, max: 50 }); }
function shakeAdd(v) { if (run) run.shake = Math.max(run.shake, v); }

/* ---------- Gegner ---------- */
function pickType() {
  const w = run.wave, pool = [['fighter', 10]];
  if (w >= 2) pool.push(['tank', 3]);
  if (w >= 3) pool.push(['shooter', 4], ['kamikaze', 4]);
  if (w >= 4) pool.push(['elite', 2]);
  const tot = pool.reduce((a, p) => a + p[1], 0);
  let x = Math.random() * tot;
  for (const [n, v] of pool) { if ((x -= v) < 0) return n; }
  return 'fighter';
}
function spawnEnemy(t) {
  const d = DEF[t], sect = Math.floor((run.wave - 1) / 5), hp = Math.ceil(d.hp * (1 + sect * 0.5));
  enemies.push({ t, x: rnd(30, W - 30), y: -30, r: d.r, c: d.c, hp, mhp: hp, sp: d.sp * run.speedK * (1 + sect * 0.1),
    age: 0, ph: Math.random() * TAU, fire: rnd(40, 100), flash: 0, dying: 0, dead: false });
}
function spawnBoss() {
  const hp = 60 + run.wave * 25;
  enemies.push({ t: 'boss', x: W / 2, y: -90, tx: W / 2, r: 58, c: '#ff3d5a', hp, mhp: hp, age: 0, fire: 60, flash: 0, dying: 0, dead: false });
  SFX.boss(); shakeAdd(10);
}
function aimed(x, y, spd, n, spread) {
  const a0 = Math.atan2(pl.y - y, pl.x - x);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i - (n - 1) / 2) * spread;
    ebul.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd });
  }
}
function ring(x, y, spd, n, off) {
  for (let i = 0; i < n; i++) { const a = off + i * TAU / n; ebul.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd }); }
}
function updEnemy(e, dt) {
  e.age += dt; e.flash = Math.max(0, e.flash - dt);
  if (e.t === 'boss') {
    if (e.dying > 0) {
      e.dying -= dt;
      if (Math.random() < 0.4 * dt) explode(e.x + rnd(-e.r, e.r), e.y + rnd(-e.r * 0.6, e.r * 0.6), rnd(14, 26), Math.random() < 0.5 ? '#ff8a2b' : '#ff3d5a', false);
      shakeAdd(6);
      if (e.dying <= 0) {
        e.dead = true; explode(e.x, e.y, e.r * 1.4, '#ffd23c', true); SFX.boss(); shakeAdd(28);
        run.score += 500; run.cred += 50; popup(e.x, e.y, 'BOSS DOWN +500', '#ffd23c');
        for (let i = 0; i < 3; i++) drops.push({ x: e.x + rnd(-40, 40), y: e.y + rnd(-20, 20), t: PUK[(Math.random() * PUK.length) | 0], a: 0 });
      }
      return;
    }
    if (e.y < 130) e.y += 1.6 * dt; else e.y = 130 + Math.sin(e.age * 0.02) * 14;
    if (Math.abs(e.tx - e.x) < 6) e.tx = rnd(60, W - 60);
    e.x += (e.tx - e.x) * 0.02 * dt;
    const f = e.hp / e.mhp; e.fire -= dt;
    if (e.fire <= 0 && e.y >= 120) {
      if (f > 0.66) { aimed(e.x, e.y + 40, 4, 3, 0.22); e.fire = 75; }
      else if (f > 0.33) { aimed(e.x, e.y + 40, 4.6, 5, 0.2); e.fire = 55; }
      else { ring(e.x, e.y, 3.4, 12, e.age * 0.05); e.fire = 46; }
    }
    return;
  }
  if (e.t === 'kamikaze') { e.y += e.sp * dt; e.x += (pl.x - e.x) * 0.025 * dt; }
  else if (e.t === 'elite') { e.y += e.sp * 0.6 * dt; e.x += Math.sin(e.age * 0.05) * 2.5 * dt; }
  else if (e.t === 'shooter') { e.y += e.sp * 0.7 * dt; e.x += Math.sin(e.age * 0.04 + e.ph) * 2.2 * dt; }
  else { e.y += e.sp * dt; e.x += Math.sin(e.age * 0.03 + e.ph) * 1.2 * dt; }
  e.x = clamp(e.x, 24, W - 24);
  if ((e.t === 'shooter' || e.t === 'elite') && e.y > 40 && e.y < LINE - 200) {
    e.fire -= dt;
    if (e.fire <= 0) {
      e.fire = Math.max(55, 120 - run.wave * 3);
      if (e.t === 'shooter') aimed(e.x, e.y + e.r, 4.2, 1, 0);
      else aimed(e.x, e.y + e.r, 4, 3, 0.25);
    }
  }
}
function hurt(e, d) {
  if (e.dead || e.dying > 0) return;
  e.hp -= d;
  if (e.flash <= 0) for (let i = 0; i < 2; i++) addP({ x: e.x + rnd(-4, 4), y: e.y + rnd(-4, 4), vx: rnd(-2, 2), vy: rnd(-2, 2), life: 12, max: 12, c: '#fff', s: 1.8, k: 'p' });
  e.flash = 5;
  if (e.hp <= 0) {
    if (e.t === 'boss') { e.dying = 110; e.hp = 0; SFX.boss(); shakeAdd(14); }
    else kill(e);
  }
}
function kill(e) {
  e.dead = true;
  run.combo++; run.comboT = 150; run.bestC = Math.max(run.bestC, run.combo);
  const m = mult(run.combo), base = DEF[e.t].pts, pts = base * m;
  run.score += pts; run.cred += Math.ceil(base / 10);
  popup(e.x, e.y - 8, '+' + pts, m > 1 ? '#ffd23c' : '#e8f6ff');
  explode(e.x, e.y, e.r, e.c, false); SFX.pop();
  if (Math.random() < DEF[e.t].drop) drops.push({ x: e.x, y: e.y, t: PUK[(Math.random() * PUK.length) | 0], a: 0 });
  if ([2, 5, 10, 20].includes(run.combo)) popup(W / 2, 150, 'COMBO x' + m + '!', '#ff8a2b');
}
function takeHit(x, y, line) {
  if (run.timers.shield > 0) { explode(x, y, 20, '#4df2ff', false); popup(x, y - 16, 'BLOCKED', '#4df2ff'); return; }
  run.lives--; run.combo = 0; run.red = 1; shakeAdd(line ? 16 : 12);
  explode(x, y, line ? 44 : 28, '#ff5a2a', line);
  popup(W / 2, LINE - 60, '-1 LIFE', '#ff5a2a'); SFX.warn();
  if (run.lives <= 0) gameOver();
}
function gameOver() {
  state = 'over';
  hi = Math.max(hi, Math.floor(run.score)); bestC = Math.max(bestC, run.bestC); credits += run.cred;
  sv('hi', hi); sv('bestC', bestC); sv('cred', credits);
  $('stats').innerHTML = `Score: <b>${Math.floor(run.score)}</b><br>Wave: <b>${run.wave}</b><br>Highscore: <b>${hi}</b><br>Best Combo: <b>x${run.bestC}</b><br>Credits: <b>+${run.cred}</b>`;
  show('over');
}

/* ---------- Power-Ups ---------- */
function collect(t) {
  SFX.pu(); popup(pl.x, pl.y - 44, PU[t][1] + ' ' + t.toUpperCase(), PU[t][0]);
  const T = run.timers;
  if (t === 'bomb') {
    shakeAdd(14); explode(pl.x, pl.y - 120, 90, '#ff8a2b', true);
    for (const e of enemies) if (!e.dead && e.dying <= 0) { if (e.t === 'boss') hurt(e, 8); else kill(e); }
  } else {
    T[t] = { rapid: 420, triple: 480, shield: 360, laser: 300, dmg: 480, magnet: 480 }[t];
  }
}

/* ---------- Wellen ---------- */
function startWave() {
  const r = run;
  r.phase = 'banner'; r.bannerT = 130;
  r.spawnQ = r.wave % 5 === 0 ? 4 + r.wave : 6 + r.wave * 3;
  r.spawnT = 40; r.speedK = Math.min(2.4, 1 + (r.wave - 1) * 0.06);
  r.bannerText = r.wave % 5 === 0 ? 'BOSS WAVE' : 'WAVE ' + r.wave;
}

/* ---------- Update ---------- */
function update(dt) {
  const r = run, T = r.timers;
  for (const k in T) if (T[k] > 0) T[k] -= dt;
  r.shake = Math.max(0, r.shake - dt * 0.9);
  r.red = Math.max(0, r.red - dt * 0.04);
  r.warnCd -= dt;
  r.disp += (r.score - r.disp) * Math.min(1, dt * 0.2);
  r.cool -= dt; r.sfx -= dt;

  if (r.combo > 0) {
    r.comboT -= dt;
    if (r.comboT <= 0) { r.combo = Math.max(0, r.combo - 3); r.comboT = 60; }
  }

  if (r.phase === 'banner') {
    r.bannerT -= dt;
    if (r.bannerT <= 0) { r.phase = 'fight'; if (r.wave % 5 === 0) spawnBoss(); }
  } else if (r.spawnQ > 0) {
    r.spawnT -= dt;
    if (r.spawnT <= 0) { r.spawnQ--; r.spawnT = Math.max(16, 60 - r.wave * 3) * rnd(0.7, 1.2); spawnEnemy(pickType()); }
  } else if (!enemies.some(e => !e.dead)) {
    r.wave++; r.cred += 20; startWave();
  }

  // Spieler bewegen
  const kx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  const ky = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
  pl.tx += kx * 7 * dt; pl.ty += ky * 5 * dt;
  pl.tx = clamp(pl.tx, 24, W - 24); pl.ty = clamp(pl.ty, LINE + 16, H - 26);
  const f = 1 - Math.pow(0.75, dt);
  pl.x += (pl.tx - pl.x) * f; pl.y += (pl.ty - pl.y) * f;

  // Automatisches Feuer
  if (r.cool <= 0) {
    r.cool = (T.rapid > 0 ? 5 : 11) * Math.pow(0.9, up.rate);
    for (const a of (T.triple > 0 ? [-0.2, 0, 0.2] : [0])) {
      const crit = Math.random() < 0.05 * up.crit;
      bullets.push({ x: pl.x, y: pl.y - 20, vx: Math.sin(a) * 7, vy: -Math.cos(a) * 13, dmg: dmgOf() * (crit ? 2.5 : 1), crit });
    }
    if (r.sfx <= 0) { SFX.shoot(); r.sfx = 7; }
  }

  // Gegner
  for (const e of enemies) {
    if (e.dead) continue;
    updEnemy(e, dt);
    if (e.t !== 'boss' && !e.dead) {
      if (e.y + e.r >= LINE) { e.dead = true; takeHit(e.x, LINE, true); }
      else if (Math.hypot(e.x - pl.x, e.y - pl.y) < e.r + 16) { e.dead = true; explode(e.x, e.y, e.r, e.c, false); takeHit(e.x, e.y, false); }
    }
  }

  // Spielerprojektile
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt;
    let hit = false;
    for (const e of enemies) {
      if (e.dead || e.dying > 0) continue;
      const dx = b.x - e.x, dy = b.y - e.y, rr = e.r + 8;
      if (dx * dx + dy * dy < rr * rr) {
        hurt(e, b.dmg);
        if (b.crit) popup(e.x, e.y - 22, 'CRIT', '#ff3d5a');
        hit = true; break;
      }
    }
    if (hit || b.y < -20) bullets.splice(i, 1);
  }

  // Laser
  if (T.laser > 0) {
    const dm = dmgOf() * 0.45 * dt;
    for (const e of enemies) if (!e.dead && Math.abs(e.x - pl.x) < e.r + 8 && e.y < pl.y) hurt(e, dm);
  }

  // Gegnerische Projektile
  for (let i = ebul.length - 1; i >= 0; i--) {
    const b = ebul[i]; b.x += b.vx * dt; b.y += b.vy * dt;
    if (Math.hypot(b.x - pl.x, b.y - pl.y) < 20) { ebul.splice(i, 1); takeHit(b.x, b.y, false); }
    else if (b.y > H + 20 || b.y < -60 || b.x < -30 || b.x > W + 30) ebul.splice(i, 1);
  }

  // Power-Ups am Boden
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i]; d.a += dt; d.y += 1.1 * dt;
    const dist = Math.hypot(d.x - pl.x, d.y - pl.y);
    if (T.magnet > 0 && dist < 220) { d.x += (pl.x - d.x) * 0.12 * dt; d.y += (pl.y - d.y) * 0.12 * dt; }
    if (dist < 30) { collect(d.t); drops.splice(i, 1); }
    else if (d.y > H + 20) drops.splice(i, 1);
  }

  // Partikel und Texte
  for (const p of parts) {
    const k = Math.pow(0.95, dt);
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= k; p.vy *= k; p.life -= dt;
  }
  parts = parts.filter(p => p.life > 0);
  for (const p of pops) { p.life -= dt; p.y -= 0.6 * dt; }
  pops = pops.filter(p => p.life > 0);

  // Warnung der Verteidigungslinie
  let wv = 0;
  for (const e of enemies) if (!e.dead && e.t !== 'boss') wv = Math.max(wv, (e.y - (LINE - 220)) / 220);
  r.warn = clamp(wv, 0, 1);
  if (r.warn > 0.5 && r.warnCd <= 0) { SFX.warn(); r.warnCd = 110; }

  enemies = enemies.filter(e => !e.dead);

  // HUD
  $('score').textContent = Math.floor(r.disp);
  $('hi').textContent = 'HI ' + Math.max(hi, Math.floor(r.score));
  $('wave').textContent = 'WAVE ' + r.wave;
  $('lives').textContent = '♥'.repeat(Math.max(0, r.lives));
  $('combo').textContent = r.combo >= 2 ? 'COMBO ' + r.combo + '  x' + mult(r.combo) : '';
  $('combo').classList.toggle('pulse', r.combo >= 5);
}

function updBg(dt) {
  stars.forEach((L, i) => L.forEach(s => { s.y += SPD[i] * dt; if (s.y > H) { s.y -= H; s.x = Math.random() * W; } }));
  planet.y += 0.22 * dt;
  if (planet.y > H + planet.r + 10) planet = { x: rnd(60, W - 60), y: -planet.r - 20, r: rnd(40, 90) };
  for (const a of attract) { a.y += a.vy * dt; a.x += Math.sin(a.y * 0.02) * 0.8 * dt; }
  attract = attract.filter(a => a.y < H + 40);
  if (state !== 'play' && attract.length < 5 && Math.random() < 0.012 * dt) {
    const t = ['fighter', 'tank', 'elite', 'kamikaze'][(Math.random() * 4) | 0];
    attract.push({ x: rnd(40, W - 40), y: -30, vy: rnd(0.6, 1.2), t, r: DEF[t].r, c: DEF[t].c, hp: 1, mhp: 1, flash: 0 });
  }
}

/* ---------- Rendering ---------- */
function nebula(x, y, r, c) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function drawBg(t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#05071a'); g.addColorStop(0.6, '#0c0930'); g.addColorStop(1, '#1d0a30');
  ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40);
  nebula(90 + Math.sin(t * 0.07) * 25, 190, 190, 'rgba(60,130,255,.16)');
  nebula(330, 470, 220, 'rgba(180,70,255,.13)');
  const pg = ctx.createRadialGradient(planet.x - planet.r * 0.35, planet.y - planet.r * 0.35, planet.r * 0.1, planet.x, planet.y, planet.r);
  pg.addColorStop(0, '#ffc27a'); pg.addColorStop(0.5, '#c2446e'); pg.addColorStop(1, '#1a0722');
  ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(planet.x, planet.y, planet.r, 0, TAU); ctx.fill();
  const cols = ['#9fc2ff', '#c8dcff', '#ffffff'];
  stars.forEach((L, i) => {
    ctx.fillStyle = cols[i];
    for (const s of L) {
      ctx.globalAlpha = s.b;
      if (i === 2) ctx.fillRect(s.x, s.y, 1.8, 3 + SPD[i] * 2);
      else ctx.fillRect(s.x, s.y, i + 0.9, i + 0.9);
    }
  });
  ctx.globalAlpha = 1;
}
function drawLine(t) {
  const wv = run ? run.warn : 0;
  const col = wv > 0.2 ? '255,90,40' : '77,242,255';
  const pulse = 0.5 + 0.5 * Math.sin(t * (4 + wv * 12));
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(' + col + ',0)'); g.addColorStop(0.5, 'rgba(' + col + ',1)'); g.addColorStop(1, 'rgba(' + col + ',0)');
  ctx.fillStyle = 'rgba(' + col + ',' + (0.05 + wv * 0.12) + ')';
  ctx.fillRect(0, LINE, W, H - LINE);
  ctx.fillStyle = g; ctx.globalAlpha = 0.3 + 0.4 * pulse * (0.3 + wv);
  ctx.fillRect(0, LINE - 6, W, 12);
  ctx.globalAlpha = 0.9; ctx.fillStyle = '#fff'; ctx.fillRect(0, LINE - 1, W, 2);
  ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(' + col + ',0.9)';
  for (let i = 0; i < 6; i++) {
    const x = (t * 60 + i * W / 6) % W;
    ctx.beginPath(); ctx.arc(x, LINE, 2.5, 0, TAU); ctx.fill();
  }
}
function drawDrop(d) {
  const [c, l] = PU[d.t];
  ctx.save(); ctx.translate(d.x, d.y + Math.sin(d.a * 0.08) * 3);
  ctx.shadowColor = c; ctx.shadowBlur = 16;
  ctx.fillStyle = '#0a0f22'; ctx.strokeStyle = c; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = c; ctx.font = '700 13px Orbitron, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(l, 0, 1);
  ctx.restore();
}
function drawEnemy(e) {
  const r = e.r, c = e.flash > 0 ? '#ffffff' : e.c;
  ctx.save(); ctx.translate(e.x, e.y);
  ctx.shadowColor = e.c; ctx.shadowBlur = 12;
  ctx.fillStyle = '#0c1430'; ctx.strokeStyle = c; ctx.lineWidth = 2;
  ctx.beginPath();
  SHAPE[e.t].forEach(([x, y], i) => i ? ctx.lineTo(x * r, y * r) : ctx.moveTo(x * r, y * r));
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = c;
  ctx.beginPath(); ctx.arc(0, r * 0.15, r * 0.22, 0, TAU); ctx.fill();
  if (e.t === 'shooter') ctx.fillRect(-2, r * 0.9, 4, 7);
  if (e.mhp > 1) {
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, e.hp / e.mhp)); ctx.stroke();
  }
  ctx.restore();
}
function drawBoss(e) {
  const f = e.hp / e.mhp, pulse = 0.5 + 0.5 * Math.sin(e.age * 0.18), R = e.r;
  const col = e.flash > 0 ? '#ffffff' : f > 0.66 ? '#ff3d5a' : f > 0.33 ? '#ff8a2b' : '#ff3dd8';
  const j = e.dying > 0 ? rnd(-5, 5) : 0, jy = e.dying > 0 ? rnd(-3, 3) : 0;
  ctx.save(); ctx.translate(e.x + j, e.y + jy);
  ctx.shadowColor = col; ctx.shadowBlur = 22;
  ctx.fillStyle = '#14102e'; ctx.strokeStyle = col; ctx.lineWidth = 3;
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(s * 28, -8); ctx.lineTo(s * R * 1.5, -R * 0.45); ctx.lineTo(s * R * 1.25, R * 0.6); ctx.lineTo(s * 28, 18);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.beginPath(); ctx.ellipse(0, 0, R * 0.9, R * 0.72, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = col; ctx.globalAlpha = 0.5 + 0.5 * pulse;
  ctx.beginPath(); ctx.arc(0, 4, R * 0.26 + pulse * 4, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = '#222';
  for (const x of [-30, 0, 30]) ctx.fillRect(x - 5, R * 0.55, 10, 16);
  ctx.restore();
  if (e.dying <= 0) {
    const bw = 260, bx = W / 2 - bw / 2, by = 84;
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(bx, by, bw, 8);
    ctx.fillStyle = col; ctx.fillRect(bx, by, bw * f, 8);
  }
}
function drawPlayer(t) {
  const flick = 8 + Math.sin(t * 38) * 2.5 + Math.random() * 3;
  const sh = state === 'play' && run && run.timers.shield > 0;
  ctx.save(); ctx.translate(pl.x, pl.y);
  for (const ex of [-9, 9]) {
    const g = ctx.createRadialGradient(ex, 14, 0, ex, 14, flick * 2);
    g.addColorStop(0, 'rgba(140,240,255,1)'); g.addColorStop(1, 'rgba(140,240,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex, 14, flick * 2, 0, TAU); ctx.fill();
  }
  const hg = ctx.createLinearGradient(0, -26, 0, 20);
  hg.addColorStop(0, '#eaf7ff'); hg.addColorStop(0.5, '#4a6fd0'); hg.addColorStop(1, '#1a1f4a');
  ctx.shadowColor = '#4df2ff'; ctx.shadowBlur = 14;
  ctx.fillStyle = hg; ctx.strokeStyle = '#7fe7ff'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -28); ctx.lineTo(16, 6); ctx.lineTo(26, 20); ctx.lineTo(9, 15);
  ctx.lineTo(0, 21); ctx.lineTo(-9, 15); ctx.lineTo(-26, 20); ctx.lineTo(-16, 6);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = '#4df2ff';
  ctx.beginPath(); ctx.ellipse(0, -4, 4.5, 8, 0, 0, TAU); ctx.fill();
  if (sh) {
    const a = 0.35 + 0.15 * Math.sin(t * 10);
    ctx.shadowColor = '#4df2ff'; ctx.shadowBlur = 18;
    ctx.strokeStyle = 'rgba(77,242,255,' + (a + 0.2) + ')'; ctx.fillStyle = 'rgba(77,242,255,' + (a * 0.25) + ')';
    ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 2, 38, 0, TAU); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
function drawDropsAndEnemies() {
  for (const d of drops) drawDrop(d);
  for (const e of enemies) (e.t === 'boss' ? drawBoss : drawEnemy)(e);
}
function drawProjectiles() {
  ctx.globalCompositeOperation = 'lighter';
  for (const b of ebul) {
    ctx.fillStyle = 'rgba(255,60,90,.3)'; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd0d8'; ctx.beginPath(); ctx.arc(b.x, b.y, 2.2, 0, TAU); ctx.fill();
  }
  for (const b of bullets) {
    ctx.fillStyle = 'rgba(77,242,255,.25)'; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = b.crit ? '#ff3d5a' : '#dffbff'; ctx.fillRect(b.x - 1.5, b.y - 7, 3, 14);
  }
  if (run.timers.laser > 0) {
    const g = ctx.createLinearGradient(pl.x - 10, 0, pl.x + 10, 0);
    g.addColorStop(0, 'rgba(255,61,160,0)'); g.addColorStop(0.5, 'rgba(255,61,160,.75)'); g.addColorStop(1, 'rgba(255,61,160,0)');
    ctx.fillStyle = g; ctx.fillRect(pl.x - 12, 0, 24, pl.y);
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(pl.x - 1.5, 0, 3, pl.y);
  }
  ctx.globalCompositeOperation = 'source-over';
}
function drawParts() {
  ctx.globalCompositeOperation = 'lighter';
  for (const p of parts) {
    const a = p.life / p.max;
    ctx.globalAlpha = a; ctx.fillStyle = p.c; ctx.strokeStyle = p.c;
    ctx.beginPath();
    if (p.k === 'r') { ctx.lineWidth = 2 + 3 * a; ctx.arc(p.x, p.y, p.s * (1.2 - a), 0, TAU); ctx.stroke(); continue; }
    if (p.k === 'f') ctx.arc(p.x, p.y, p.s * (1.3 - a * 0.5), 0, TAU);
    else if (p.k === 's') ctx.arc(p.x, p.y, p.s * (1.4 - a), 0, TAU);
    else ctx.arc(p.x, p.y, p.s * (0.4 + a * 0.6), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
function drawPops() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const p of pops) {
    const a = p.life / p.max, sc = 0.7 + Math.min(0.5, (1 - a) * 3);
    ctx.save(); ctx.globalAlpha = Math.min(1, a * 2); ctx.translate(p.x, p.y); ctx.scale(sc, sc);
    ctx.font = '700 18px Orbitron, sans-serif';
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3; ctx.strokeText(p.t, 0, 0);
    ctx.fillStyle = p.c; ctx.fillText(p.t, 0, 0);
    ctx.restore();
  }
}
function drawBanner() {
  const bt = run.bannerT, a = clamp(Math.min((130 - bt) / 12, bt / 20), 0, 1);
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '900 34px Orbitron, sans-serif'; ctx.shadowColor = '#4df2ff'; ctx.shadowBlur = 18;
  ctx.fillStyle = '#fff'; ctx.fillText(run.bannerText, W / 2, H * 0.36);
  ctx.font = '700 12px Orbitron, sans-serif'; ctx.fillStyle = '#7fe7ff';
  ctx.fillText('GET READY', W / 2, H * 0.36 + 34);
  ctx.restore();
}
function render(now) {
  const t = now / 1000, playing = state === 'play';
  ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  ctx.save();
  const sh = playing ? run.shake : 0;
  if (sh > 0) ctx.translate(rnd(-1, 1) * sh * 0.6, rnd(-1, 1) * sh * 0.6);
  drawBg(t);
  if (!playing) for (const a of attract) drawEnemy(a);
  drawLine(t);
  if (playing) {
    drawDropsAndEnemies();
    drawProjectiles();
  }
  drawPlayer(t);
  if (playing) { drawParts(); drawPops(); if (run.phase === 'banner') drawBanner(); }
  if (playing && run.red > 0) { ctx.fillStyle = 'rgba(255,40,60,' + (run.red * 0.35) + ')'; ctx.fillRect(-20, -20, W + 40, H + 40); }
  ctx.restore();
}

/* ---------- Screens & Start ---------- */
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('show', s.id === id));
  $('hud').classList.toggle('show', id === null);
}
function startRun() {
  audio();
  state = 'play';
  run = {
    wave: 1, phase: 'banner', bannerT: 130, bannerText: 'WAVE 1', spawnQ: 0, spawnT: 40, speedK: 1,
    score: 0, disp: 0, lives: 3 + up.hp, combo: 0, comboT: 0, bestC: 0, cred: 0,
    shake: 0, red: 0, warn: 0, warnCd: 0, cool: 0, sfx: 0,
    timers: { rapid: 0, triple: 0, laser: 0, dmg: 0, magnet: 0, shield: up.shield * 180 }
  };
  bullets = []; ebul = []; enemies = []; drops = []; parts = []; pops = [];
  pl.x = pl.tx = W / 2; pl.y = pl.ty = H - 64;
  startWave(); show(null);
}
function renderUps() {
  $('cred').textContent = 'CREDITS: ' + credits;
  $('upList').innerHTML = UPG.map(([k, n, d]) => {
    const lv = up[k], cost = 40 + lv * 40, maxed = lv >= 5;
    return `<div class="row"><div><b>${n}</b> <small>Lv ${lv}/5</small><p>${d}</p></div>` +
      `<button class="btn sm" data-k="${k}" ${maxed || credits < cost ? 'disabled' : ''}>${maxed ? 'MAX' : cost + ' CR'}</button></div>`;
  }).join('');
}
function setTarget(e) {
  const rc = cv.getBoundingClientRect();
  pl.tx = (e.clientX - rc.left) / rc.width * W;
  const y = (e.clientY - rc.top) / rc.height * H;
  pl.ty = e.pointerType === 'touch' ? y - 44 : y;
}
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const sc = Math.min(window.innerWidth / W, window.innerHeight / H);
  const cw = Math.floor(W * sc), ch = Math.floor(H * sc);
  gameEl.style.width = cw + 'px'; gameEl.style.height = ch + 'px';
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
}

/* ---------- Eingaben ---------- */
const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
addEventListener('keydown', e => { if (KEYS.includes(e.code)) { keys[e.code] = true; e.preventDefault(); } });
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
cv.addEventListener('pointerdown', e => { if (state === 'play') setTarget(e); });
cv.addEventListener('pointermove', e => { if (state === 'play' && (e.pointerType === 'mouse' || e.buttons)) setTarget(e); });
addEventListener('resize', resize);

$('bPlay').onclick = startRun;
$('again').onclick = startRun;
$('bUp').onclick = () => { state = 'menu'; renderUps(); show('ups'); };
$('bHow').onclick = () => { state = 'menu'; show('how'); };
$('toMenu').onclick = () => { state = 'menu'; show('menu'); };
document.querySelectorAll('.back').forEach(b => b.onclick = () => { state = 'menu'; show('menu'); });
$('upList').onclick = e => {
  const k = e.target.dataset && e.target.dataset.k;
  if (!k) return;
  const lv = up[k], cost = 40 + lv * 40;
  if (lv < 5 && credits >= cost) {
    credits -= cost; up[k]++;
    sv('cred', credits); sv('up', up); SFX.pu(); renderUps();
  }
};
$('snd').textContent = soundOn ? '♪' : '×';
$('snd').onclick = () => {
  soundOn = !soundOn; sv('snd', soundOn);
  $('snd').textContent = soundOn ? '♪' : '×';
  if (soundOn) audio();
};

/* ---------- Loop ---------- */
resize();
let last = performance.now();
function frame(now) {
  const dt = Math.min(2.5, Math.max(0, (now - last) / 16.667));
  last = now;
  updBg(dt);
  if (state === 'play') update(dt);
  render(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
