'use strict';
/* =====================================================================
   Rub4Race – colour sliding-puzzle race
   Rebuild the 3x3 target pattern in the centre of the 5x5 board.
   Modes: solo, vs computer, 2 players, 4 players (any mix of human / CPU).
   ===================================================================== */

const N = 5;                                   // board is N x N
const CENTER = [6, 7, 8, 11, 12, 13, 16, 17, 18];   // board index of each target cell
const DELTA = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const SYMBOLS = ['●', '▲', '■', '◆', '★', '✚'];

const SEATS = [
  { name: 'Player 1', accent: '#0046ad', hint: '↑ ← ↓ →', keys: { up: 'ArrowUp', left: 'ArrowLeft', down: 'ArrowDown', right: 'ArrowRight' } },
  { name: 'Player 2', accent: '#b71234', hint: 'W A S D', keys: { up: 'KeyW', left: 'KeyA', down: 'KeyS', right: 'KeyD' } },
  { name: 'Player 3', accent: '#009b48', hint: 'I J K L', keys: { up: 'KeyI', left: 'KeyJ', down: 'KeyK', right: 'KeyL' } },
  { name: 'Player 4', accent: '#ff5800', hint: 'T F G H', keys: { up: 'KeyT', left: 'KeyF', down: 'KeyG', right: 'KeyH' } },
];
const CPU_NAMES = ['Bot Alpha', 'Bot Bravo', 'Bot Charlie', 'Bot Delta'];

// ms between CPU moves, and chance (0-1) that it blunders a move
const DIFFICULTY = {
  easy:   { delay: 1050, slip: 0.18 },
  medium: { delay: 620,  slip: 0.07 },
  hard:   { delay: 360,  slip: 0.0 },
  insane: { delay: 190,  slip: 0.0 },
};

const PRESETS = {
  solo: ['human', 'off', 'off', 'off'],
  cpu:  ['human', 'cpu', 'off', 'off'],
  two:  ['human', 'human', 'off', 'off'],
  four: ['human', 'human', 'human', 'human'],
};
const PRESET_LABEL = { solo: 'Solo', cpu: 'vs Computer', two: '2 Players', four: '4 Players' };

/* ---------------------------------------------------------------- pure puzzle logic */

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function neighbors(p) {
  const r = (p / N) | 0, c = p % N, out = [];
  if (r > 0) out.push([p - N, 'up']);
  if (r < N - 1) out.push([p + N, 'down']);
  if (c > 0) out.push([p - 1, 'left']);
  if (c < N - 1) out.push([p + 1, 'right']);
  return out;
}

function matchCount(cells, target) {
  let n = 0;
  for (let k = 0; k < 9; k++) if (cells[CENTER[k]] === target[k]) n++;
  return n;
}

/** Same board + target is given to every racer so the race is fair. */
function makeBoard() {
  const pool = [];
  for (let c = 0; c < 6; c++) for (let i = 0; i < 4; i++) pool.push(c);
  for (;;) {
    const target = shuffle(pool.slice()).slice(0, 9);
    const tiles = shuffle(pool.slice());
    const cells = tiles.slice(0, 12).concat([-1], tiles.slice(12));   // gap starts in the middle
    if (matchCount(cells, target) <= 1) return { cells, target };
  }
}

/**
 * CPU brain. Fill the target cells in order; for the first wrong cell, BFS over
 * (tile position, gap position) to find the shortest gap-moves that bring a tile
 * of the wanted colour into it without touching cells already placed.
 * Returns the list of directions the GAP should move.
 */
function aiPlan(cells, target, blank) {
  let k = 0;
  while (k < 9 && cells[CENTER[k]] === target[k]) k++;
  if (k === 9) return [];
  const locked = new Set(CENTER.slice(0, k));
  const goal = CENTER[k], want = target[k];

  let best = null;
  for (let t = 0; t < N * N; t++) {
    if (cells[t] !== want || locked.has(t)) continue;
    const path = bfs(t, blank, goal, locked);
    if (path && (!best || path.length < best.length)) best = path;
  }
  return best || [];
}

function bfs(tile0, blank0, goal, locked) {
  const start = tile0 * 25 + blank0;
  const prev = new Map([[start, null]]);
  const queue = [[tile0, blank0]];
  for (let qi = 0; qi < queue.length; qi++) {
    const [tile, blank] = queue[qi];
    const key = tile * 25 + blank;
    if (tile === goal) {
      const dirs = [];
      for (let cur = key; prev.get(cur); cur = prev.get(cur).from) dirs.push(prev.get(cur).dir);
      return dirs.reverse();
    }
    for (const [nb, dir] of neighbors(blank)) {
      if (locked.has(nb)) continue;
      const nTile = nb === tile ? blank : tile;
      const nKey = nTile * 25 + nb;
      if (prev.has(nKey)) continue;
      prev.set(nKey, { from: key, dir });
      queue.push([nTile, nb]);
    }
  }
  return null;
}

if (typeof module !== 'undefined') module.exports = { makeBoard, aiPlan, neighbors, matchCount, CENTER, DELTA, N };

/* ---------------------------------------------------------------- everything below needs a browser */
if (typeof document !== 'undefined') (function () {

const COLOR_VARS = [
  ['#b71234'], ['#009b48'], ['#ff5800'], ['#ffffff'], ['#ffd500'], ['#0046ad'],
];

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/* ---------- settings ---------- */
const settings = { slots: PRESETS.cpu.slice(), difficulty: 'medium', invert: false, symbols: false, sound: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem('rub4race.settings') || '{}')); } catch (e) { /* ignore */ }
if (!Array.isArray(settings.slots) || settings.slots.length !== 4) settings.slots = PRESETS.cpu.slice();
const saveSettings = () => { try { localStorage.setItem('rub4race.settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } };
const getBest = () => { try { return +localStorage.getItem('rub4race.best') || 0; } catch (e) { return 0; } };
const setBest = t => { try { localStorage.setItem('rub4race.best', String(Math.round(t))); } catch (e) { /* ignore */ } };

/* ---------- audio ---------- */
let actx = null;
function tone(freq, dur = 0.09, type = 'sine', vol = 0.06, delay = 0, slideTo = 0) {
  if (!settings.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t0 = actx.currentTime + delay;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(actx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  } catch (e) { /* audio is optional */ }
}
const sfx = {
  move: () => tone(300 + Math.random() * 60, 0.05, 'triangle', 0.035),
  match: () => tone(660, 0.1, 'sine', 0.07, 0, 990),
  beep: () => tone(440, 0.18, 'square', 0.04),
  go: () => tone(880, 0.35, 'square', 0.05),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.07, i * 0.1)),
  done: () => [392, 523, 659].forEach((f, i) => tone(f, 0.18, 'triangle', 0.06, i * 0.09)),
};

/* ---------- confetti ---------- */
const cv = $('#confetti'), cx = cv.getContext('2d');
let parts = [], confettiRaf = 0;
function sizeCanvas() { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; }
sizeCanvas();
const CONF_COLORS = ['#b71234', '#ffd500', '#009b48', '#0046ad', '#ff5800', '#ffffff'];
function burst(x, y, count = 90, spread = 1) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, s = (3 + Math.random() * 9) * spread;
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 5, w: 5 + Math.random() * 7, h: 3 + Math.random() * 5,
      r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: CONF_COLORS[(Math.random() * CONF_COLORS.length) | 0], life: 90 + Math.random() * 60 });
  }
  if (!confettiRaf) confettiRaf = requestAnimationFrame(tickConfetti);
}
function tickConfetti() {
  const k = devicePixelRatio;
  cx.clearRect(0, 0, cv.width, cv.height);
  parts = parts.filter(p => p.life-- > 0 && p.y < innerHeight + 40);
  for (const p of parts) {
    p.vy += 0.22; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
    cx.save(); cx.translate(p.x * k, p.y * k); cx.rotate(p.r); cx.globalAlpha = Math.min(1, p.life / 30);
    cx.fillStyle = p.c; cx.fillRect(-p.w * k / 2, -p.h * k / 2, p.w * k, p.h * k); cx.restore();
  }
  confettiRaf = parts.length ? requestAnimationFrame(tickConfetti) : 0;
}
function cheer(el, big) {
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, big ? 160 : 70, big ? 1.3 : 1);
}

/* =================================================================== MENU */

const menu = $('#menu'), gameScr = $('#game');
const slotsEl = $('#slots');

function currentPreset() {
  const key = Object.keys(PRESETS).find(k => PRESETS[k].every((t, i) => t === settings.slots[i]));
  return key || null;
}

function renderMenu() {
  $$('#presets .preset').forEach(b => b.classList.toggle('on', b.dataset.preset === currentPreset()));
  slotsEl.innerHTML = '';
  settings.slots.forEach((type, i) => {
    const b = document.createElement('button');
    b.className = `slot ${type}`;
    b.style.setProperty('--c', SEATS[i].accent);
    const label = type === 'human' ? 'Human' : type === 'cpu' ? 'Computer' : 'Off';
    b.innerHTML = `<div class="nm">${type === 'cpu' ? CPU_NAMES[i] : SEATS[i].name}</div><div class="ty">${label}</div>` +
      (type === 'human' ? `<div class="ky">${SEATS[i].hint}</div>` : '');
    b.addEventListener('click', () => {
      const order = ['human', 'cpu', 'off'];
      settings.slots[i] = order[(order.indexOf(type) + 1) % 3];
      if (!settings.slots.some(t => t !== 'off')) settings.slots[i] = 'human';
      saveSettings(); renderMenu();
    });
    slotsEl.appendChild(b);
  });
  $$('#difficulty button').forEach(b => b.classList.toggle('on', b.dataset.v === settings.difficulty));
  $('#optInvert').checked = settings.invert;
  $('#optSymbols').checked = settings.symbols;
  $('#optSound').checked = settings.sound;
  document.body.classList.toggle('symbols', settings.symbols);
  const humans = settings.slots.map((t, i) => t === 'human' ? `<b>${SEATS[i].name}</b>: <kbd>${SEATS[i].hint}</kbd>` : '').filter(Boolean);
  $('.keys-help').innerHTML = 'Controls &mdash; ' + (humans.join(' &nbsp;·&nbsp; ') || 'none (watch mode)');
  $('#playBtn').textContent = settings.slots.every(t => t !== 'human') ? 'WATCH THE BOTS' : 'START RACE';
}

$$('#presets .preset').forEach(b => b.addEventListener('click', () => {
  settings.slots = PRESETS[b.dataset.preset].slice(); saveSettings(); renderMenu();
}));
$$('#difficulty button').forEach(b => b.addEventListener('click', () => { settings.difficulty = b.dataset.v; saveSettings(); renderMenu(); }));
$('#optInvert').addEventListener('change', e => { settings.invert = e.target.checked; saveSettings(); });
$('#optSymbols').addEventListener('change', e => { settings.symbols = e.target.checked; saveSettings(); renderMenu(); });
$('#optSound').addEventListener('change', e => { settings.sound = e.target.checked; saveSettings(); updateSoundBtn(); sfx.move(); });
$('#playBtn').addEventListener('click', () => { sfx.beep(); startRace(); });

// decorative logo: a mini board with a gap that keeps sliding
(function logo() {
  const el = $('#logoTiles');
  const cols = [0, 1, 2, 3, 4, 5];
  let cells = shuffle([...Array(24)].map((_, i) => cols[i % 6])); cells.splice(12, 0, -1);
  const els = cells.map(c => { const i = document.createElement('i'); paint(i, c); return i; });
  const draw = () => { el.innerHTML = ''; els.forEach(e => el.appendChild(e)); };
  function paint(i, c) { if (c < 0) { i.className = 'gap'; return; } const col = COLOR_VARS[c]; i.style.setProperty('--base', col[0]); i.style.animationDelay = (-Math.random() * 3) + 's'; }
  draw();
  let blank = 12;
  setInterval(() => {
    if (document.hidden || menu.classList.contains('hidden')) return;
    const opts = neighbors(blank);
    const [nb] = opts[(Math.random() * opts.length) | 0];
    [cells[blank], cells[nb]] = [cells[nb], cells[blank]];
    [els[blank], els[nb]] = [els[nb], els[blank]];
    blank = nb; draw();
  }, 650);
})();

/* =================================================================== GAME STATE */

const G = {
  players: [], board: null, state: 'menu',       // menu | countdown | playing | over
  paused: false, clock: 0, finished: 0, sessionWins: [0, 0, 0, 0],
  timers: [], mode: 'cpu',
};
const arena = $('#arena');
let lastTick = 0, loopId = 0;

const fmt = ms => {
  const t = Math.max(0, ms), m = Math.floor(t / 60000), s = Math.floor(t / 1000) % 60, d = Math.floor(t / 100) % 10;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${d}`;
};
const later = (fn, ms) => { const id = setTimeout(fn, ms); G.timers.push(id); return id; };
const clearTimers = () => { G.timers.forEach(clearTimeout); G.timers = []; };

function show(screen) {
  menu.classList.toggle('hidden', screen !== 'menu');
  gameScr.classList.toggle('hidden', screen !== 'game');
  if (screen === 'menu') window.scrollTo(0, 0);
}

function startRace(rematch = false) {
  clearTimers();
  ['#pause', '#results', '#countdown'].forEach(s => $(s).classList.add('hidden'));
  $('#banner').classList.remove('show');
  $('#btnFinish').classList.add('hidden');
  if (!rematch) G.sessionWins = [0, 0, 0, 0];

  G.board = makeBoard();
  G.players = [];
  settings.slots.forEach((type, i) => {
    if (type === 'off') return;
    G.players.push({ seat: i, type, name: type === 'cpu' ? CPU_NAMES[i] : SEATS[i].name, accent: SEATS[i].accent, keys: SEATS[i].keys, hint: SEATS[i].hint,
      cells: [], tiles: [], blank: 12, moves: 0, time: 0, finished: false, rank: 0, nextAt: 0, plan: [], matched: 0, el: {} });
  });
  G.mode = currentPreset() || 'custom';
  $('#modePill').textContent = (PRESET_LABEL[G.mode] || 'Custom race') + (settings.slots.includes('cpu') ? ' · ' + settings.difficulty : '');
  G.clock = 0; G.finished = 0; G.paused = false; G.state = 'countdown';
  buildArena();
  show('game');
  updateSoundBtn();
  layout();
  runCountdown();
}

function buildArena() {
  arena.innerHTML = '';
  const solo = G.players.length === 1;
  arena.style.setProperty('--mini', (solo ? 72 : 58) + 'px');
  for (const p of G.players) {
    const panel = document.createElement('div');
    panel.className = `panel ${p.type}`;
    panel.style.setProperty('--acc', p.accent);
    panel.innerHTML = `
      <div class="p-head">
        <div class="mini"></div>
        <div class="who"><div class="nm"></div><div class="timer">00:00.0</div><div class="meta"></div></div>
      </div>
      <div class="board-wrap">
        <div class="board"><div class="zone"></div></div>
        <div class="keyhint"></div>
        <div class="rank-badge"><div><div class="big"></div><div class="lbl"></div><div class="tm"></div></div></div>
      </div>`;
    arena.appendChild(panel);
    const board = $('.board', panel);
    p.el = { panel, board, timer: $('.timer', panel), meta: $('.meta', panel), mini: $('.mini', panel), keyhint: $('.keyhint', panel), big: $('.big', panel), lbl: $('.lbl', panel), tm: $('.tm', panel) };
    $('.nm', panel).textContent = p.name + (p.type === 'cpu' ? ' (CPU)' : '');
    renderMeta(p);
    p.el.keyhint.innerHTML = p.type === 'human' ? `<div style="text-align:center"><b>${p.hint.replace(/ /g, '')}</b><small>${p.name}: slide tiles</small></div>` : `<div style="text-align:center"><b>CPU</b><small>${p.name}</small></div>`;
    p.el.keyhint.classList.add('on');

    // mini target
    p.el.minis = G.board.target.map(c => {
      const i = document.createElement('i'); i.style.setProperty('--base', COLOR_VARS[c][0]);
      p.el.mini.appendChild(i); return i;
    });

    // tiles
    p.cells = G.board.cells.slice();
    p.tiles = p.cells.map((c, pos) => {
      if (c < 0) return null;
      const t = document.createElement('div');
      t.className = `tile t${c}`;
      t.innerHTML = `<div class="face">${SYMBOLS[c]}</div>`;
      t.dataset.pos = pos;
      board.appendChild(t);
      put(t, pos);
      return t;
    });
    p.blank = p.cells.indexOf(-1);
    refresh(p);

    if (p.type === 'human') board.addEventListener('pointerdown', e => {
      const t = e.target.closest('.tile');
      if (!t || G.state !== 'playing' || G.paused || p.finished) return;
      const pos = p.tiles.indexOf(t);
      const dir = neighbors(p.blank).find(([n]) => n === pos);
      if (dir) step(p, dir[1], true);
    });
  }
}

const put = (el, pos) => { el.style.transform = `translate(${(pos % N) * 100}%, ${((pos / N) | 0) * 100}%)`; };
const renderMeta = p => { p.el.meta.textContent = p.type === 'cpu' ? `${p.moves} moves · ${p.matched}/9` : `${p.moves} moves`; };

/** Scale boards so every panel fits on screen. */
function layout() {
  if (!G.players.length) return;
  const n = G.players.length;
  const availW = innerWidth - 28, availH = innerHeight - 56 - 22;
  const head = (n === 1 ? 72 : 58) + 22, gap = 16;
  let best = { bs: 0, cols: 1 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const bw = (availW - (cols - 1) * gap) / cols;
    const bh = (availH - rows * head - (rows - 1) * gap) / rows;
    const bs = Math.min(bw, bh);
    if (bs > best.bs) best = { bs, cols };
  }
  const bs = Math.max(150, Math.min(640, Math.floor(best.bs)));
  arena.style.setProperty('--bs', bs + 'px');
  arena.style.gridTemplateColumns = `repeat(${best.cols}, ${bs}px)`;
  $$('.board-wrap', arena).forEach(w => w.style.setProperty('--bs', bs + 'px'));
  document.documentElement.style.setProperty('--bs', bs + 'px');
}
addEventListener('resize', () => { layout(); sizeCanvas(); });

function refresh(p) {
  let m = 0;
  CENTER.forEach((pos, k) => { const ok = p.cells[pos] === G.board.target[k]; if (ok) m++; p.el.minis[k].classList.toggle('got', ok); });
  p.tiles.forEach((t, pos) => { if (t) t.classList.toggle('ok', CENTER.includes(pos) && p.cells[pos] === G.board.target[CENTER.indexOf(pos)]); });
  if (m > p.matched) sfx.match();
  p.matched = m;
  renderMeta(p);
  return m;
}

/** dir = direction the GAP travels. */
function step(p, dir, tileClick = false) {
  const r = (p.blank / N) | 0, c = p.blank % N;
  const [dr, dc] = DELTA[dir], nr = r + dr, nc = c + dc;
  if (nr < 0 || nr >= N || nc < 0 || nc >= N) return false;
  const np = nr * N + nc;
  p.cells[p.blank] = p.cells[np]; p.cells[np] = -1;
  const tile = p.tiles[np];
  p.tiles[p.blank] = tile; p.tiles[np] = null;
  put(tile, p.blank);
  p.blank = np; p.moves++;
  if (p.type === 'human') sfx.move();
  if (refresh(p) === 9) finish(p);
  return true;
}

function finish(p) {
  p.finished = true; p.time = G.clock; p.rank = ++G.finished;
  p.el.timer.textContent = fmt(p.time);
  p.el.panel.classList.add('done');
  p.el.big.innerHTML = `${p.rank}<sup>${['ST', 'ND', 'RD'][p.rank - 1] || 'TH'}</sup>`;
  p.el.lbl.textContent = p.rank === 1 ? 'Winner' : 'Finished';
  p.el.tm.textContent = `${fmt(p.time)} · ${p.moves} moves`;
  const total = G.players.length;
  if (p.rank === 1) {
    G.sessionWins[p.seat]++;
    sfx.win(); cheer(p.el.panel, true);
    if (total > 1) banner(`${p.name} wins!`);
  } else { sfx.done(); cheer(p.el.panel, false); }
  if (total > 1 && p.rank === 1 && G.players.some(q => !q.finished)) later(() => $('#btnFinish').classList.remove('hidden'), 400);
  if (G.players.every(q => q.finished)) { G.state = 'over'; later(showResults, 1500); }
  else if (total === 1) { G.state = 'over'; later(showResults, 1200); }
}

function banner(text) {
  const b = $('#banner'); b.textContent = text; b.classList.add('show');
  later(() => b.classList.remove('show'), 2600);
}

/* ---------- countdown & loop ---------- */

function runCountdown() {
  const ov = $('#countdown'), num = $('#countNum');
  ov.classList.remove('hidden');
  G.players.forEach(p => { p.el.timer.textContent = '00:00.0'; });
  // flicker the target pattern for a moment, like shuffling cards
  const flick = setInterval(() => G.players.forEach(p => p.el.minis.forEach(m => {
    const c = COLOR_VARS[(Math.random() * 6) | 0]; m.style.setProperty('--base', c[0]);
  })), 70);
  G.timers.push(flick);
  later(() => {
    clearInterval(flick);
    G.players.forEach(p => p.el.minis.forEach((m, k) => { const c = COLOR_VARS[G.board.target[k]]; m.style.setProperty('--base', c[0]); }));
  }, 900);
  const seq = ['3', '2', '1', 'GO!'];
  seq.forEach((s, i) => later(() => {
    num.textContent = s; num.className = s === 'GO!' ? 'go' : 'n' + s; if (s === 'GO!') sfx.go(); else sfx.beep();
    num.style.animation = 'none'; void num.offsetWidth; num.style.animation = '';
  }, 700 + i * 850));
  later(() => {
    ov.classList.add('hidden');
    G.players.forEach(p => p.el.keyhint.classList.remove('on'));
    G.state = 'playing'; G.clock = 0; lastTick = performance.now();
    const d = DIFFICULTY[settings.difficulty];
    G.players.forEach(p => { p.nextAt = d.delay * (0.8 + Math.random() * 0.6); });
    clearInterval(loopId); loopId = setInterval(loop, 50);
  }, 700 + seq.length * 850);
}

function loop() {
  const now = performance.now(), dt = now - lastTick; lastTick = now;
  if (G.state !== 'playing' || G.paused) return;
  G.clock += dt;
  const d = DIFFICULTY[settings.difficulty];
  for (const p of G.players) {
    if (p.finished) continue;
    p.el.timer.textContent = fmt(G.clock);
    if (p.type !== 'cpu' || G.clock < p.nextAt) continue;
    p.nextAt = G.clock + d.delay * (0.75 + Math.random() * 0.5);
    cpuMove(p, d);
  }
}

function cpuMove(p, d) {
  if (Math.random() < d.slip) {               // blunder: random legal move, then re-plan
    const opts = neighbors(p.blank);
    step(p, opts[(Math.random() * opts.length) | 0][1]); p.plan = []; return;
  }
  if (!p.plan.length) p.plan = aiPlan(p.cells, G.board.target, p.blank);
  const dir = p.plan.shift();
  if (dir) step(p, dir);
  else { const opts = neighbors(p.blank); step(p, opts[(Math.random() * opts.length) | 0][1]); }
}

/* ---------- input ---------- */

const KEYMAP = {};
SEATS.forEach((s, i) => Object.entries(s.keys).forEach(([dir, code]) => { KEYMAP[code] = { seat: i, dir }; }));

addEventListener('keydown', e => {
  if (gameScr.classList.contains('hidden')) {
    if (e.key === 'Enter' && !e.target.closest('button, summary, input')) { sfx.beep(); startRace(); }
    return;
  }
  if (e.code === 'Escape') { e.preventDefault(); if (G.state === 'playing' || G.paused) togglePause(); return; }
  const hit = KEYMAP[e.code];
  if (!hit) return;
  e.preventDefault();
  if (G.state !== 'playing' || G.paused) return;
  const p = G.players.find(q => q.seat === hit.seat && q.type === 'human');
  if (!p || p.finished) return;
  step(p, settings.invert ? hit.dir : OPP[hit.dir]);   // default: tile slides the way you press
});

function togglePause(force) {
  const want = typeof force === 'boolean' ? force : !G.paused;
  if (G.state !== 'playing' && !G.paused) return;
  G.paused = want; lastTick = performance.now();
  $('#pause').classList.toggle('hidden', !want);
}
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'playing') togglePause(true); });

/* ---------- results ---------- */

function showResults() {
  if (G.state === 'menu') return;
  G.state = 'over';
  $('#btnFinish').classList.add('hidden');
  const order = G.players.slice().sort((a, b) => (a.finished === b.finished) ? (a.finished ? a.rank - b.rank : b.matched - a.matched) : (a.finished ? -1 : 1));
  const winner = order[0];
  const solo = G.players.length === 1;
  const list = $('#resList'); list.innerHTML = '';
  order.forEach((p, i) => {
    const li = document.createElement('li');
    li.style.setProperty('--c', p.accent); li.style.animationDelay = (i * 0.09) + 's';
    if (i === 0 && p.finished) li.classList.add('win');
    const wins = G.players.length > 1 && G.sessionWins[p.seat] ? ` · ${G.sessionWins[p.seat]} win${G.sessionWins[p.seat] > 1 ? 's' : ''} this session` : '';
    li.innerHTML = `<div class="pos">${p.finished ? i + 1 : '–'}</div>
      <div class="nm">${p.name}<small>${p.type === 'cpu' ? 'Computer' : 'Human'}${wins}</small></div>
      <div class="tm">${p.finished ? fmt(p.time) : `DNF ${p.matched}/9`}</div><div class="mv">${p.moves} moves</div>`;
    list.appendChild(li);
  });

  let sub = '';
  if (solo && winner.finished) {
    const best = getBest();
    if (!best || winner.time < best) { setBest(winner.time); sub = best ? `New personal best! (was ${fmt(best)})` : 'First time on the board!'; }
    else sub = `Personal best: ${fmt(best)}`;
    $('#resTitle').textContent = winner.time < 45000 ? 'Lightning fast!' : winner.time < 90000 ? 'Nicely done!' : 'Puzzle solved!';
  } else if (!winner.finished) {
    $('#resTitle').textContent = 'Race stopped'; sub = 'Nobody finished the pattern.';
  } else {
    $('#resTitle').textContent = `${winner.name} wins!`;
    sub = winner.type === 'cpu' ? 'The machines win this round… rematch?' : 'Glorious victory.';
  }
  $('#resSub').textContent = sub;
  $('#results').classList.remove('hidden');
  if (winner.finished) { sfx.win(); burst(innerWidth / 2, innerHeight * .35, 200, 1.4); }
}

/* ---------- top-bar buttons ---------- */

function updateSoundBtn() { $('#btnSound').innerHTML = settings.sound ? '&#128266;' : '&#128263;'; }
function toMenu() { clearTimers(); clearInterval(loopId); G.state = 'menu'; G.paused = false; ['#pause', '#results', '#countdown'].forEach(s => $(s).classList.add('hidden')); show('menu'); renderMenu(); }

$('#btnPause').addEventListener('click', () => togglePause());
$('#btnRestart').addEventListener('click', () => startRace(true));
$('#btnMenu').addEventListener('click', toMenu);
$('#btnFinish').addEventListener('click', showResults);
$('#btnSound').addEventListener('click', () => { settings.sound = !settings.sound; saveSettings(); updateSoundBtn(); sfx.move(); });
$('#pResume').addEventListener('click', () => togglePause(false));
$('#pRestart').addEventListener('click', () => startRace(true));
$('#pMenu').addEventListener('click', toMenu);
$('#rRematch').addEventListener('click', () => startRace(true));
$('#rMenu').addEventListener('click', toMenu);

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('rub4race.theme', t); } catch (e) { /* ignore */ }
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t === 'dark' ? '#121212' : '#111111';
}
['#themeMenu', '#themeGame'].forEach(s => $(s).addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')));

renderMenu();

// handy for automated tests / debugging
window.__rub4race = { G, settings, startRace, step };

})();
