// ═══════════════════════════════════════════════════════════
// AUDIO ENGINE
// ═══════════════════════════════════════════════════════════
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
let masterGain, reverbGain, reverbNode, dryGain;
let analyser;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new AudioCtx();

  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.8;

  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;

  dryGain = audioCtx.createGain();
  dryGain.gain.value = 0.7;

  reverbGain = audioCtx.createGain();
  reverbGain.gain.value = 0.3;

  reverbNode = createReverb();

  masterGain.connect(dryGain);
  masterGain.connect(reverbNode);
  reverbNode.connect(reverbGain);
  dryGain.connect(analyser);
  reverbGain.connect(analyser);
  analyser.connect(audioCtx.destination);
}

function createReverb() {
  const conv = audioCtx.createConvolver();
  const sampleRate = audioCtx.sampleRate;
  const length = sampleRate * 2.5;
  const impulse = audioCtx.createBuffer(2, length, sampleRate);
  for (let c = 0; c < 2; c++) {
    const ch = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
    }
  }
  conv.buffer = impulse;
  return conv;
}

// Active oscillators map: noteIndex -> {osc, gainNode}
const activeNotes = new Map();
let sustainActive = false;
const sustainedNotes = new Set();
let currentVolume = 0.8;
let currentReverb = 0.3;
let currentInstrument = 'piano';

// Instrument presets: waveform + ADSR + harmonic partials
const INSTRUMENTS = {
  piano: {
    type: 'piano',
    attack: 0.005, decay: 0.8, sustain: 0.2, release: 1.2,
    partials: [1, 0.5, 0.25, 0.125, 0.06],
    detune: [0, 0.5, -0.5, 1, -1],
  },
  accordion: {
    type: 'sawtooth',
    attack: 0.04, decay: 0.1, sustain: 0.9, release: 0.15,
    partials: [1, 0.6, 0.3, 0.15, 0.08, 0.04],
    detune: [0, 2, -2, 1, -1, 0.5],
  },
  organ: {
    type: 'sine',
    attack: 0.02, decay: 0.0, sustain: 1.0, release: 0.05,
    partials: [1, 1, 0.5, 0.5, 0.25, 0.25, 0.125],
    detune: [0, 1200, 0, 2400, 0, 1900, 0], // Hammond drawbars approx
  },
  marimba: {
    type: 'marimba',
    attack: 0.001, decay: 0.4, sustain: 0.0, release: 0.5,
    partials: [1, 0.3, 0.1],
    detune: [0, 0, 0],
  },
  synth: {
    type: 'square',
    attack: 0.02, decay: 0.3, sustain: 0.6, release: 0.4,
    partials: [1, 0.4, 0.2, 0.1],
    detune: [0, 7, -7, 14],
  },
};

function noteFreq(midiNote) {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

function playNote(midiNote) {
  if (!audioCtx) initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  stopNote(midiNote, true); // stop if already playing

  const inst = INSTRUMENTS[currentInstrument];
  const freq = noteFreq(midiNote);
  const now = audioCtx.currentTime;

  const gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(currentVolume * 0.4, now + inst.attack);
  gainNode.gain.exponentialRampToValueAtTime(
    Math.max(currentVolume * 0.4 * inst.sustain, 0.001),
    now + inst.attack + inst.decay
  );
  gainNode.connect(masterGain);

  const oscs = [];

  if (inst.type === 'piano') {
    // Piano: multi-partial sine with slight inharmonicity
    for (let p = 0; p < inst.partials.length; p++) {
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      const inharmonicity = 0.0004 * p * p;
      osc.frequency.value = freq * (p + 1) * (1 + inharmonicity);
      osc.detune.value = inst.detune[p] || 0;
      const pGain = audioCtx.createGain();
      pGain.gain.value = inst.partials[p];
      osc.connect(pGain);
      pGain.connect(gainNode);
      osc.start(now);
      oscs.push(osc);
    }
  } else if (inst.type === 'marimba') {
    // Marimba: click transient + resonant tone
    for (let p = 0; p < inst.partials.length; p++) {
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * [1, 4, 10][p];
      const pGain = audioCtx.createGain();
      pGain.gain.value = inst.partials[p];
      osc.connect(pGain);
      pGain.connect(gainNode);
      osc.start(now);
      oscs.push(osc);
    }
  } else {
    for (let p = 0; p < inst.partials.length; p++) {
      const osc = audioCtx.createOscillator();
      osc.type = inst.type;
      osc.frequency.value = freq;
      osc.detune.value = inst.detune[p] || 0;
      const pGain = audioCtx.createGain();
      pGain.gain.value = inst.partials[p];
      osc.connect(pGain);
      pGain.connect(gainNode);
      osc.start(now);
      oscs.push(osc);
    }
  }

  activeNotes.set(midiNote, { oscs, gainNode });
}

function stopNote(midiNote, immediate = false) {
  if (!audioCtx) return;
  if (sustainActive && !immediate) {
    sustainedNotes.add(midiNote);
    return;
  }
  const note = activeNotes.get(midiNote);
  if (!note) return;

  const inst = INSTRUMENTS[currentInstrument];
  const now = audioCtx.currentTime;
  const release = immediate ? 0.02 : inst.release;

  note.gainNode.gain.cancelScheduledValues(now);
  note.gainNode.gain.setValueAtTime(note.gainNode.gain.value, now);
  note.gainNode.gain.exponentialRampToValueAtTime(0.001, now + release);

  note.oscs.forEach(osc => {
    try { osc.stop(now + release + 0.05); } catch(e) {}
  });

  activeNotes.delete(midiNote);
  sustainedNotes.delete(midiNote);
}

function releaseSustain() {
  sustainedNotes.forEach(midiNote => stopNote(midiNote, false));
  sustainedNotes.clear();
}

// ═══════════════════════════════════════════════════════════
// NOTE DEFINITIONS
// ═══════════════════════════════════════════════════════════
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FREQUENCIES_MAP = {};

function getNoteName(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12];
  return { name, octave, full: name + octave };
}

// ═══════════════════════════════════════════════════════════
// KEYBOARD LAYOUT (default)
// ═══════════════════════════════════════════════════════════
let startOctave = 3;
let totalKeys = 49;

// Default keyboard mapping pool (used to auto-map *every* visible piano key)
// Notes: Space/Z/X are handled as controls elsewhere, so they are excluded here.
const KEY_POOL = (() => {
  const chars = [
    ...'abcdefghijklmnopqrstuvwxyz'.split(''),
    ...'0123456789'.split(''),
    ...[';','\'',']','[','/','\\','-','=',',','.','`'],
  ];
  return chars.filter(k => ![' ','z','x'].includes(k));
})();

function normalizeKeyName(rawKey) {
  const key = String(rawKey || '').toLowerCase();
  const map = {
    pageup: 'pgup',
    pagedown: 'pgdn',
    arrowup: 'up',
    arrowdown: 'down',
    arrowleft: 'left',
    arrowright: 'right',
    ' ': 'space',
    escape: 'esc',
    delete: 'del',
  };
  return map[key] || key;
}

function displayKeyName(key) {
  const normalized = normalizeKeyName(key);
  const displayMap = {
    pgup: 'PgUp',
    pgdn: 'PgDn',
    up: '↑',
    down: '↓',
    left: '←',
    right: '→',
    space: 'Space',
    esc: 'Esc',
    del: 'Del',
    enter: 'Enter',
    shift: 'Shift',
    ctrl: 'Ctrl',
    alt: 'Alt',
    tab: 'Tab',
    capslock: 'CapsLock',
    meta: 'Meta',
  };
  return displayMap[normalized] || normalized.toUpperCase();
}

// Per-midi maps — fully independent, each piano key has its own binding
let midiToKey = {};   // midiNote -> key char
let keyToMidi = {};   // key char  -> midiNote
// Custom bindings survive octave/key-count changes: midiNote -> key char
let customBindings = {};

// ═══════════════════════════════════════════════════════════
// BUILD KEYBOARD
// ═══════════════════════════════════════════════════════════
let showLabels = true;
let showKbd = true;

// midiNote -> DOM element
const keyElements = {};

function buildKeyboard() {
  const keyboard = document.getElementById('keyboard');
  keyboard.innerHTML = '';
  Object.keys(keyElements).forEach(k => delete keyElements[k]);

  // Determine which midi notes to show
  const startMidi = (startOctave + 1) * 12; // e.g. octave 3 → midi 48 = C3
  const endMidi = startMidi + totalKeys - 1;

  // First, lay out white keys with absolute positions for black keys
  const whites = [];
  for (let m = startMidi; m <= endMidi; m++) {
    const semitone = m % 12;
    if (![1,3,6,8,10].includes(semitone)) whites.push(m);
  }

  const WHITE_W = 53; // including margin
  keyboard.style.width = (whites.length * WHITE_W) + 'px';

  // Build white keys first
  let whiteIdx = 0;
  for (let m = startMidi; m <= endMidi; m++) {
    const semitone = m % 12;
    if ([1,3,6,8,10].includes(semitone)) continue;
    const el = createKey(m, false, whiteIdx);
    keyboard.appendChild(el);
    keyElements[m] = el;
    whiteIdx++;
  }



  // Build black keys (positioned absolutely over whites)
  whiteIdx = 0;
  for (let m = startMidi; m <= endMidi; m++) {
    const semitone = m % 12;
    const isBlack = [1,3,6,8,10].includes(semitone);
    if (!isBlack) { whiteIdx++; continue; }

    // Position: between the white key to the left (whiteIdx-1) and right (whiteIdx)
    const xPos = (whiteIdx - 1) * WHITE_W + WHITE_W - 18;
    const el = createKey(m, true, xPos);
    keyboard.appendChild(el);
    keyElements[m] = el;
  }

  // Build per-midi key maps
  midiToKey = {};
  keyToMidi = {};

  // Auto-map every visible midi note to a physical key following a standard keyboard layout.
  // - White notes get: A S D F G H J K L ; ' ENTER PGDN
  // - Black notes get: W E T Y U O P ] \\ PGUP
  // Starting point is the first white/black note that appears inside this visible range.
  const WHITE_KEY_POOL = ['a','s','d','f','g','h','j','k','l',';','\'', 'enter','pgdn'];
  const BLACK_KEY_POOL = ['w','e','t','y','u','o','p',']','\\','pgup'];

  // semitone mapping within an octave: 1,3,6,8,10 => black; others => white
  const isBlackSemitone = (s) => [1,3,6,8,10].includes(s);

  // counters for default mapping pool
  let whiteIdxMap = 0;
  let blackIdxMap = 0;

  for (let m = startMidi; m <= endMidi; m++) {
    const semitone = m % 12;
    const defaultKey = isBlackSemitone(semitone)
      ? BLACK_KEY_POOL[blackIdxMap++ % BLACK_KEY_POOL.length]
      : WHITE_KEY_POOL[whiteIdxMap++ % WHITE_KEY_POOL.length];

    const boundKey = normalizeKeyName(customBindings[m] !== undefined ? customBindings[m] : defaultKey);
    midiToKey[m] = boundKey;
  }


  // Build reverse map (last write wins if duplicate)
  Object.entries(midiToKey).forEach(([midi, key]) => {
    keyToMidi[key] = parseInt(midi);
  });

  updateKeyLabels();
  buildRebindList();
}

function createKey(midiNote, isBlack, posOrIdx) {
  const el = document.createElement('div');
  el.className = `key ${isBlack ? 'black' : 'white'}`;
  el.dataset.midi = midiNote;

  if (isBlack) {
    el.style.position = 'absolute';
    el.style.left = posOrIdx + 'px';
    el.style.top = '0';
  }

  const { name, octave } = getNoteName(midiNote);

  const labelEl = document.createElement('div');
  labelEl.className = 'key-label';
  labelEl.textContent = name + octave;
  el.appendChild(labelEl);

  const kbdEl = document.createElement('div');
  kbdEl.className = 'key-kbd';
  kbdEl.textContent = '';
  el.appendChild(kbdEl);

  // Mouse events
  el.addEventListener('mousedown', e => { e.preventDefault(); triggerNote(midiNote, true); });
  el.addEventListener('mouseup', () => triggerNote(midiNote, false));
  el.addEventListener('mouseleave', () => { if (isDragging) triggerNote(midiNote, false); });
  el.addEventListener('mouseenter', e => { if (isDragging) triggerNote(midiNote, true); });

  // Touch events
  el.addEventListener('touchstart', e => { e.preventDefault(); triggerNote(midiNote, true); }, { passive: false });
  el.addEventListener('touchend', e => { e.preventDefault(); triggerNote(midiNote, false); });

  return el;
}

function updateKeyLabels() {
  Object.entries(keyElements).forEach(([midi, el]) => {
    const midi_int = parseInt(midi);
    const label = el.querySelector('.key-label');
    const kbd = el.querySelector('.key-kbd');
    if (label) label.style.opacity = showLabels ? '1' : '0';
    if (kbd) {
      kbd.textContent = midiToKey[midi_int] ? displayKeyName(midiToKey[midi_int]) : '';
      kbd.style.opacity = showKbd ? '1' : '0';
    }
  });
}

// ═══════════════════════════════════════════════════════════
// NOTE TRIGGER
// ═══════════════════════════════════════════════════════════
const heldKeys = new Set(); // midiNotes currently in key-down state

function triggerNote(midiNote, on) {
  const el = keyElements[midiNote];
  if (on) {
    if (heldKeys.has(midiNote)) return;
    heldKeys.add(midiNote);
    if (el) el.classList.add('active');
    playNote(midiNote);
    updateDisplay(midiNote, true);
  } else {
    heldKeys.delete(midiNote);
    if (el) el.classList.remove('active');
    stopNote(midiNote);
    updateDisplay(midiNote, false);
  }
}

// ═══════════════════════════════════════════════════════════
// DISPLAY
// ═══════════════════════════════════════════════════════════
const activeChips = new Map();

function updateDisplay(midiNote, on) {
  const list = document.getElementById('activeKeysList');
  const { full, name, octave } = getNoteName(midiNote);
  const freq = noteFreq(midiNote).toFixed(2);

  if (on) {
    document.getElementById('activeNoteName').textContent = name + (name.includes('#') ? '' : ' ');
    document.getElementById('activeNoteInfo').innerHTML = `Frequency: ${freq} Hz<br>Octave: ${octave}`;

    const chip = document.createElement('div');
    chip.className = 'active-key-chip';
    chip.textContent = full;
    chip.dataset.midi = midiNote;
    list.appendChild(chip);
    activeChips.set(midiNote, chip);
  } else {
    const chip = activeChips.get(midiNote);
    if (chip) { chip.remove(); activeChips.delete(midiNote); }
    if (activeChips.size === 0) {
      document.getElementById('activeNoteName').textContent = '—';
      document.getElementById('activeNoteInfo').innerHTML = 'Frequency: — Hz<br>Octave: —';
    }
  }
}

// ═══════════════════════════════════════════════════════════
// VISUALIZER
// ═══════════════════════════════════════════════════════════
const canvas = document.getElementById('viz');
const ctx2d = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = canvas.offsetWidth * devicePixelRatio;
  canvas.height = canvas.offsetHeight * devicePixelRatio;
  ctx2d.scale(devicePixelRatio, devicePixelRatio);
}

let vizAF;
function drawViz() {
  vizAF = requestAnimationFrame(drawViz);
  if (!analyser) { return; }

  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  ctx2d.clearRect(0, 0, W, H);

  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(data);

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  ctx2d.strokeStyle = isDark ? '#c8a96e' : '#8b6914';
  ctx2d.lineWidth = 1.5;
  ctx2d.beginPath();

  const slice = W / data.length;
  let x = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i] / 128 - 1;
    const y = H / 2 + v * (H / 2 - 4);
    i === 0 ? ctx2d.moveTo(x, y) : ctx2d.lineTo(x, y);
    x += slice;
  }
  ctx2d.stroke();
}

// ═══════════════════════════════════════════════════════════
// MOUSE DRAG
// ═══════════════════════════════════════════════════════════
let isDragging = false;
document.addEventListener('mousedown', () => isDragging = true);
document.addEventListener('mouseup', () => {
  isDragging = false;
  // Release all dragged notes
  [...heldKeys].forEach(m => triggerNote(m, false));
});

// ═══════════════════════════════════════════════════════════
// KEYBOARD INPUT
// ═══════════════════════════════════════════════════════════
const pressedPhysicalKeys = new Set();

document.addEventListener('keydown', e => {
  if (e.repeat) return;
  const key = normalizeKeyName(e.key);

  if (e.code === 'Space') {
    e.preventDefault();
    sustainActive = true;
    document.getElementById('sustainLed').classList.add('on');
    document.getElementById('sustainBtn').classList.add('active');
    return;
  }
  if (key === 'z') { changeOctave(-1); return; }
  if (key === 'x') { changeOctave(1); return; }

  if (rebindTarget !== null) {
    e.preventDefault();
    assignRebind(key);
    return;
  }

  if (pressedPhysicalKeys.has(key)) return;
  pressedPhysicalKeys.add(key);

  const midi = keyToMidi[key];
  if (midi !== undefined) triggerNote(midi, true);
});

document.addEventListener('keyup', e => {
  const key = normalizeKeyName(e.key);

  if (e.code === 'Space') {
    sustainActive = false;
    document.getElementById('sustainLed').classList.remove('on');
    document.getElementById('sustainBtn').classList.remove('active');
    releaseSustain();
    return;
  }

  pressedPhysicalKeys.delete(key);
  const midi = keyToMidi[key];
  if (midi !== undefined) triggerNote(midi, false);
});

// ═══════════════════════════════════════════════════════════
// REBIND SYSTEM — per piano key, fully independent
// ═══════════════════════════════════════════════════════════
let rebindTarget = null; // midiNote being rebound

function buildRebindList() {
  const list = document.getElementById('rebindList');
  list.innerHTML = '';

  const startMidi = (startOctave + 1) * 12;
  const endMidi = startMidi + totalKeys - 1;

  for (let m = startMidi; m <= endMidi; m++) {
    const keyChar = midiToKey[m];
    if (!keyChar) continue; // only show mapped keys

    const { full } = getNoteName(m);
    const item = document.createElement('div');
    item.className = 'rebind-item';
    item.dataset.midi = m;

    const noteSpan = document.createElement('div');
    noteSpan.className = 'rebind-note';
    noteSpan.textContent = full;

    const kbdBadge = document.createElement('div');
    kbdBadge.className = 'rebind-kbd-badge';
    kbdBadge.textContent = displayKeyName(keyChar);
    kbdBadge.id = `rebind-badge-${m}`;

    item.appendChild(noteSpan);
    item.appendChild(kbdBadge);
    item.addEventListener('click', () => selectRebind(m, item));
    list.appendChild(item);
  }
}

function selectRebind(midiNote, itemEl) {
  document.querySelectorAll('.rebind-item').forEach(el => el.classList.remove('selected'));
  rebindTarget = midiNote;
  itemEl.classList.add('selected');
  document.getElementById('rebindHint').textContent =
    `اضغط أي زرار كيبورد لتعيينه لـ ${getNoteName(midiNote).full}`;
}

function assignRebind(key) {
  if (rebindTarget === null) return;
  const normalizedKey = normalizeKeyName(key);
  if (normalizedKey === 'space') {
    document.getElementById('rebindHint').textContent = 'لا يمكن استخدام Space لإعادة التعيين';
    return;
  }

  // If this key already maps to another note, clear that binding
  const oldMidi = keyToMidi[normalizedKey];
  if (oldMidi !== undefined && oldMidi !== rebindTarget) {
    delete midiToKey[oldMidi];
    delete customBindings[oldMidi];
    const badge = document.getElementById(`rebind-badge-${oldMidi}`);
    if (badge) badge.textContent = '—';
    const el = keyElements[oldMidi];
    if (el) el.querySelector('.key-kbd').textContent = '';
  }

  // Remove old key for this midi note
  const oldKey = midiToKey[rebindTarget];
  if (oldKey) delete keyToMidi[oldKey];

  // Assign
  midiToKey[rebindTarget] = normalizedKey;
  keyToMidi[normalizedKey] = rebindTarget;
  customBindings[rebindTarget] = normalizedKey; // persist across rebuilds

  const displayName = displayKeyName(normalizedKey);

  // Update rebind badge
  const badge = document.getElementById(`rebind-badge-${rebindTarget}`);
  if (badge) badge.textContent = displayName;

  // Update key label on piano
  const el = keyElements[rebindTarget];
  if (el && showKbd) el.querySelector('.key-kbd').textContent = displayName;

  document.getElementById('rebindHint').textContent =
    `✓ تم تعيين "${displayName}" → ${getNoteName(rebindTarget).full} · اختر مفتاحاً آخر للمتابعة`;

  document.querySelectorAll('.rebind-item').forEach(el => el.classList.remove('selected'));
  rebindTarget = null;
}

// ═══════════════════════════════════════════════════════════
// CONTROLS
// ═══════════════════════════════════════════════════════════
function changeOctave(dir) {
  startOctave = Math.max(0, Math.min(6, startOctave + dir));
  document.getElementById('octaveVal').textContent = startOctave;
  buildKeyboard();
}

document.getElementById('octDownBtn').addEventListener('click', () => changeOctave(-1));
document.getElementById('octUpBtn').addEventListener('click', () => changeOctave(1));

// Instrument
document.getElementById('instrumentCtrl').addEventListener('click', e => {
  const btn = e.target.closest('button[data-inst]');
  if (!btn) return;
  document.querySelectorAll('#instrumentCtrl button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentInstrument = btn.dataset.inst;
  // Stop all notes on instrument change
  [...heldKeys].forEach(m => triggerNote(m, false));
});

// Keys count
document.getElementById('keysCtrl').addEventListener('click', e => {
  const btn = e.target.closest('button[data-keys]');
  if (!btn) return;
  document.querySelectorAll('#keysCtrl button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  totalKeys = parseInt(btn.dataset.keys);
  buildKeyboard();
});

// Volume
document.getElementById('volRange').addEventListener('input', e => {
  const v = e.target.value / 100;
  currentVolume = v;
  document.getElementById('volVal').textContent = e.target.value;
  if (masterGain) masterGain.gain.value = v;
});

// Reverb
document.getElementById('reverbRange').addEventListener('input', e => {
  const v = e.target.value / 100;
  currentReverb = v;
  document.getElementById('reverbVal').textContent = e.target.value;
  if (reverbGain) reverbGain.gain.value = v * 0.6;
  if (dryGain) dryGain.gain.value = 1 - v * 0.3;
});

// Theme
document.getElementById('themeBtn').addEventListener('click', () => {
  const html = document.documentElement;
  html.setAttribute('data-theme', html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

// Sustain button (click to toggle lock)
document.getElementById('sustainBtn').addEventListener('click', () => {
  sustainActive = !sustainActive;
  document.getElementById('sustainLed').classList.toggle('on', sustainActive);
  document.getElementById('sustainBtn').classList.toggle('active', sustainActive);
  if (!sustainActive) releaseSustain();
});

// Show labels
document.getElementById('showLabelsBtn').addEventListener('click', function() {
  showLabels = !showLabels;
  this.classList.toggle('active', showLabels);
  updateKeyLabels();
});

// Show kbd
document.getElementById('showKbdBtn').addEventListener('click', function() {
  showKbd = !showKbd;
  this.classList.toggle('active', showKbd);
  updateKeyLabels();
});

// Rebind panel toggle
document.getElementById('rebindBtn').addEventListener('click', function() {
  const panel = document.getElementById('rebindPanel');
  const open = panel.classList.toggle('open');
  this.classList.toggle('active', open);
  if (!open) { rebindTarget = null; document.querySelectorAll('.rebind-item').forEach(el => el.classList.remove('selected')); }
});

// ═══════════════════════════════════════════════════════════
// LAYOUT BACKUP (save/load octave+keys+instrument+rebinds)
// ═══════════════════════════════════════════════════════════
const LAYOUT_STORAGE_KEY = 'piano_layout_backups_v1';
const DEFAULT_LAYOUT_ID = 'default-layout-v1';

function getDefaultLayoutState() {
  return {
    id: DEFAULT_LAYOUT_ID,
    name: 'Default',
    octave: 3,
    keysCount: 49,
    instrument: 'piano',
    rebinds: {},
    createdAt: 0,
    protected: true,
  };
}

function getCurrentLayoutState() {
  // Determine current keys shown / octave from UI and state.
  const octave = startOctave;
  const selectedKeysBtn = document.querySelector('#keysCtrl button.active');
  const keysCount = selectedKeysBtn ? parseInt(selectedKeysBtn.dataset.keys) : totalKeys;

  // Instrument
  const selectedInstBtn = document.querySelector('#instrumentCtrl button.active');
  const instrument = selectedInstBtn ? selectedInstBtn.dataset.inst : currentInstrument;

  // Rebinds (customBindings is midiNote -> key char)
  // Persist only keys inside current visible range so load can apply consistently.
  const startMidi = (octave + 1) * 12;
  const endMidi = startMidi + keysCount - 1;

  const rebinds = {};
  for (let m = startMidi; m <= endMidi; m++) {
    if (customBindings[m] !== undefined) rebinds[m] = customBindings[m];
  }

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name: null, // set by save handler
    octave,
    keysCount,
    instrument,
    rebinds,
    createdAt: Date.now(),
  };
}

function loadBackups() {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return ensureDefaultLayout([]);
    const parsed = JSON.parse(raw);
    return ensureDefaultLayout(Array.isArray(parsed) ? parsed : []);
  } catch (e) {
    return ensureDefaultLayout([]);
  }
}

function persistBackups(backups) {
  const sorted = Array.from(backups);
  sorted.sort((a, b) => {
    if (a.protected && !b.protected) return -1;
    if (!a.protected && b.protected) return 1;
    return b.createdAt - a.createdAt;
  });
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(sorted));
}

function ensureDefaultLayout(backups) {
  if (!Array.isArray(backups)) backups = [];
  const hasDefault = backups.some(b => b && b.id === DEFAULT_LAYOUT_ID);
  if (!hasDefault) {
    backups.unshift(getDefaultLayoutState());
    persistBackups(backups);
  }
  return backups;
}

function populateLayoutSelect() {
  const sel = document.getElementById('layoutSelect');
  const backups = loadBackups();

  const current = sel.value;
  sel.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = backups.length ? 'Load saved layout…' : 'No saved layouts yet';
  sel.appendChild(placeholder);

  backups.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.id === DEFAULT_LAYOUT_ID
      ? `${b.name} (default)`
      : `${b.name ?? 'Layout'} (oct ${b.octave}, ${b.keysCount} keys)`;
    sel.appendChild(opt);
  });

  sel.value = backups.some(b => b.id === current) ? current : '';
}

function applyLayoutState(state) {
  // 1) set octave + keys + instrument.
  startOctave = Math.max(0, Math.min(6, state.octave));
  totalKeys = parseInt(state.keysCount);
  currentInstrument = state.instrument;

  document.getElementById('octaveVal').textContent = startOctave;
  document.querySelectorAll('#keysCtrl button').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.keys) === totalKeys);
  });
  document.querySelectorAll('#instrumentCtrl button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.inst === currentInstrument);
  });

  // Important: reset customBindings BEFORE buildKeyboard so new mapping uses them.
  customBindings = state.rebinds ? { ...state.rebinds } : {};

  // Rebuild keys (this will also buildRebindList and update labels)
  buildKeyboard();
}

// Save button
document.getElementById('saveLayoutBtn').addEventListener('click', () => {
  const name = prompt('اسم الباكاب (Layout name):');
  if (!name) return;

  const state = getCurrentLayoutState();
  state.name = name;
  state.protected = false;

  const backups = loadBackups();
  backups.unshift(state);
  const MAX = 20;
  persistBackups(backups.slice(0, MAX));

  populateLayoutSelect();
  document.getElementById('rebindHint').textContent = '✓ تم حفظ ترتيب المفاتيح';
});

// Delete from select
document.getElementById('editLayoutBtn').addEventListener('click', () => {
  const sel = document.getElementById('layoutSelect');
  const id = sel.value;
  if (!id) {
    document.getElementById('rebindHint').textContent = '— اختر باكاب من القائمة للتعديل';
    return;
  }

  const backups = loadBackups();
  const idx = backups.findIndex(b => b.id === id);
  if (idx === -1) return;

  const currentName = backups[idx].name || 'Layout';
  const name = prompt('اسم الباكاب الجديد:', currentName);
  if (!name) return;

  const state = getCurrentLayoutState();
  state.id = id;
  state.name = name;
  state.protected = backups[idx].protected;
  state.createdAt = backups[idx].createdAt || Date.now();

  backups[idx] = state;
  persistBackups(backups);
  populateLayoutSelect();
  sel.value = id;
  document.getElementById('rebindHint').textContent = '✓ تم تحديث الباكاب المحدد';
});

document.getElementById('deleteLayoutBtn').addEventListener('click', () => {
  const sel = document.getElementById('layoutSelect');
  const id = sel.value;
  if (!id) {
    document.getElementById('rebindHint').textContent = '— اختر باكاب من القائمة للحذف';
    return;
  }

  const backups = loadBackups();
  const idx = backups.findIndex(b => b.id === id);
  if (idx === -1) return;
  if (backups[idx].protected) {
    alert('لا يمكن حذف النسخة الافتراضية');
    return;
  }

  const ok = confirm('Delete this saved layout?');
  if (!ok) return;

  backups.splice(idx, 1);
  persistBackups(backups);
  populateLayoutSelect();
  sel.value = '';
  document.getElementById('rebindHint').textContent = '✓ تم حذف الباكاب المحدد';
});

// Load from select
document.getElementById('layoutSelect').addEventListener('change', (e) => {
  const id = e.target.value;
  if (!id) return;

  const backups = loadBackups();
  const found = backups.find(b => b.id === id);
  if (!found) return;

  applyLayoutState(found);
  populateLayoutSelect();
  document.getElementById('rebindHint').textContent = '✓ تم تحميل ترتيب المفاتيح';
  e.target.value = id;
});

// Initialize backup select and ensure default layout exists.
populateLayoutSelect();

document.getElementById('deleteAllLayoutsBtn')?.addEventListener('click', () => {
  const ok = confirm('Delete ALL saved layouts? This cannot be undone.');
  if (!ok) return;
  const backups = loadBackups().filter(b => b.protected);
  persistBackups(backups);
  populateLayoutSelect();
  document.getElementById('rebindHint').textContent = '✓ تم حذف كل الباكابات';
});



// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
window.addEventListener('resize', () => { resizeCanvas(); });
resizeCanvas();
drawViz();
buildKeyboard();

// Initialize audio on first user interaction
document.addEventListener('pointerdown', () => { if (!audioCtx) initAudio(); }, { once: true });
document.addEventListener('keydown', () => { if (!audioCtx) initAudio(); }, { once: true });
