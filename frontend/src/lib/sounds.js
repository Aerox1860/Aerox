// Lightweight Web Audio sound engine for AeroX game
// No external asset dependencies — all sounds are synthesized

let ctx = null;
let masterGain = null;
let engineNodes = null; // { osc1, osc2, lfo, gain }
let muted = false;

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : 0.6;
    masterGain.connect(ctx.destination);
  }
  // Resume if suspended (browser autoplay policy)
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function setMuted(v) {
  muted = !!v;
  try { localStorage.setItem("aerox_muted", muted ? "1" : "0"); } catch {}
  if (masterGain) masterGain.gain.value = muted ? 0 : 0.6;
}

export function getMuted() {
  try {
    if (localStorage.getItem("aerox_muted") === "1") muted = true;
  } catch {}
  return muted;
}

function envGain(peak, attack, hold, release) {
  const c = getCtx();
  const g = c.createGain();
  const now = c.currentTime;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(peak, now + attack);
  g.gain.setValueAtTime(peak, now + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, now + attack + hold + release);
  return { g, endsAt: now + attack + hold + release };
}

// Engine hum — low sawtooth with slow LFO modulation, loops while flying
export function startEngine() {
  const c = getCtx();
  if (!c || engineNodes) return;
  const osc1 = c.createOscillator();
  osc1.type = "sawtooth";
  osc1.frequency.value = 60;
  const osc2 = c.createOscillator();
  osc2.type = "sawtooth";
  osc2.frequency.value = 62; // detuned for beating
  const gain = c.createGain();
  gain.gain.value = 0.001;
  // LFO to modulate pitch slowly (rising climb)
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.25;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 12;
  lfo.connect(lfoGain);
  lfoGain.connect(osc1.frequency);
  lfoGain.connect(osc2.frequency);

  // Lowpass to smooth
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 800;

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);

  const now = c.currentTime;
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.3);
  osc1.start(); osc2.start(); lfo.start();

  engineNodes = { osc1, osc2, lfo, gain };
}

export function pitchEngine(multiplier) {
  if (!engineNodes) return;
  const c = getCtx();
  // Increase base freq with multiplier (climbing = higher pitch)
  const base = 60 + Math.min((multiplier - 1) * 20, 120);
  const now = c.currentTime;
  engineNodes.osc1.frequency.setTargetAtTime(base, now, 0.1);
  engineNodes.osc2.frequency.setTargetAtTime(base + 2, now, 0.1);
}

export function stopEngine() {
  if (!engineNodes) return;
  const c = getCtx();
  const now = c.currentTime;
  const { osc1, osc2, lfo, gain } = engineNodes;
  try {
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    osc1.stop(now + 0.2); osc2.stop(now + 0.2); lfo.stop(now + 0.2);
  } catch {}
  engineNodes = null;
}

// Crash: descending noise burst
export function playCrash() {
  const c = getCtx();
  if (!c) return;
  // white noise
  const bufferSize = c.sampleRate * 0.6;
  const buf = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2000, c.currentTime);
  filter.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.5);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.7, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.6);
  noise.connect(filter); filter.connect(gain); gain.connect(masterGain);
  noise.start();

  // Add a low thud
  const thud = c.createOscillator();
  thud.type = "sine";
  thud.frequency.setValueAtTime(120, c.currentTime);
  thud.frequency.exponentialRampToValueAtTime(30, c.currentTime + 0.3);
  const thudGain = c.createGain();
  thudGain.gain.setValueAtTime(0.6, c.currentTime);
  thudGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.4);
  thud.connect(thudGain); thudGain.connect(masterGain);
  thud.start(); thud.stop(c.currentTime + 0.45);
}

// Cashout: pleasant chime (two-note)
export function playCashout() {
  const c = getCtx();
  if (!c) return;
  const notes = [880, 1320]; // A5 E6
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const gain = c.createGain();
    const start = c.currentTime + i * 0.08;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
    osc.connect(gain); gain.connect(masterGain);
    osc.start(start); osc.stop(start + 0.45);
  });
}

// Bet placed: short blip
export function playBet() {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(500, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(700, c.currentTime + 0.1);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.25, c.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.15);
  osc.connect(gain); gain.connect(masterGain);
  osc.start(); osc.stop(c.currentTime + 0.2);
}

// Countdown tick
export function playTick() {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 800;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.15, c.currentTime + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.08);
  osc.connect(gain); gain.connect(masterGain);
  osc.start(); osc.stop(c.currentTime + 0.1);
}

// Countdown "GO"
export function playGo() {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(660, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1200, c.currentTime + 0.2);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.4, c.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.3);
  osc.connect(gain); gain.connect(masterGain);
  osc.start(); osc.stop(c.currentTime + 0.32);
}

// Init on first user interaction (browser autoplay requirement)
export function primeAudio() {
  getCtx();
  getMuted();
}
