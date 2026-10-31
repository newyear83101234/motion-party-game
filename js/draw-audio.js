// 畫畫遊戲聲音：一個 AudioContext、兩條音量（音樂／音效）＋壓縮器。素材清單在 audio/draw/audio.json
// 音效檔（點按、填色、貼紙…）播檔案；選顏色的音符、星星筆的叮鈴、畫筆沙沙聲用合成的（跟著手指速度變大聲）
// iOS：AudioContext 只能在第一次點擊時建立（unlock）；切到背景就暫停、回來再繼續。檔案載入失敗一律安靜略過
const AV = "1";                                        // 音檔換內容時升這個，破快取
const LEVEL = { music: 0.3, sfx: 0.8 };
const PENTA = [261.63, 293.66, 329.63, 392, 440];      // C 大調五聲音階：怎麼按都好聽
// 每種筆的沙沙聲：濾波器種類、頻率、Q、最大音量（越細的筆越高、越薄）
const SCRIBBLE = {
  marker: ["bandpass", 1100, 0.7, 0.16], crayon: ["bandpass", 2300, 1.1, 0.26], rainbow: ["bandpass", 1300, 0.8, 0.14],
  watercolor: ["lowpass", 650, 0.7, 0.3], spray: ["highpass", 3800, 0.7, 0.2], neon: ["bandpass", 500, 3, 0.12],
  sparkle: ["bandpass", 1500, 0.8, 0.1], pencil: ["bandpass", 4300, 1.8, 0.24], eraser: ["bandpass", 1500, 0.6, 0.22],
};

let ac = null, master, musicBus, sfxBus, noise = null, scr = null;
let man = null, manP = null, bgm = null, bgmSrc = null, bgmGain = null, wantBgm = false;
const buf = new Map(), warned = new Set();
const pref = (() => { try { return JSON.parse(localStorage.getItem("draw-audio")) || {}; } catch { return {}; } })();
let musicOn = pref.music !== false, soundOn = pref.sound !== false;
function savePref() { try { localStorage.setItem("draw-audio", JSON.stringify({ music: musicOn, sound: soundOn })); } catch { /* 私密瀏覽 */ } }
function warn(k, m) { if (!warned.has(k)) { warned.add(k); console.warn("聲音：" + m); } }

function loadManifest() {
  return manP || (manP = fetch(new URL("../audio/draw/audio.json?v=" + AV, import.meta.url))
    .then(r => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
    .then(m => (man = m))
    .catch(e => { warn("man", "清單讀不到（" + e.message + "），先不出聲"); return null; }));
}
loadManifest();   // 先下載清單，點第一下之後才解碼

async function load(key, file) {
  if (buf.has(key)) return buf.get(key);
  const p = fetch(new URL("../" + file + "?v=" + AV, import.meta.url)).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("HTTP " + r.status))))
    .then(a => ac.decodeAudioData(a)).catch(e => { warn(key, file + " 載入失敗：" + e.message); return null; });
  buf.set(key, p);
  return p;
}

// 第一次點擊時呼叫（之後再呼叫沒關係）
export function unlock() {
  if (ac) { if (ac.state !== "running" && !document.hidden) ac.resume().catch(() => {}); return; }   // iOS 還有 "interrupted"
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  const comp = ac.createDynamicsCompressor();   // 當限幅器：很多聲音一起響也不會破音
  comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.15;
  master = ac.createGain(); master.connect(comp); comp.connect(ac.destination);
  musicBus = ac.createGain(); musicBus.gain.value = musicOn ? LEVEL.music : 0; musicBus.connect(master);
  sfxBus = ac.createGain(); sfxBus.gain.value = soundOn ? LEVEL.sfx : 0; sfxBus.connect(master);
  // 畫筆沙沙聲：一段循環白噪音 → 濾波 → 音量跟著手指速度
  const nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noise = nb;
  ac.resume().catch(() => {});
  loadManifest().then(m => {
    if (!m) return;
    for (const [k, v] of Object.entries(m.sfx || {})) load("sfx:" + k, v.file);
    if (wantBgm) startBgm();
  });
}
document.addEventListener("visibilitychange", () => {
  if (!ac) return;
  if (document.hidden) ac.suspend().catch(() => {}); else ac.resume().catch(() => {});
});

// 播一個音效檔；檔案還沒好就算了（晚到的聲音比沒聲音更怪）
// 聲音還沒真的開著（suspended／interrupted）就不排：時間不會走，等恢復時會全部一起爆出來
const live = () => ac && ac.state === "running";
export function sfx(name, { gain = 1, rate = 1 } = {}) {
  if (!live() || !soundOn || !man?.sfx?.[name]) return;
  const p = buf.get("sfx:" + name);
  if (!p) return;
  const t0 = ac.currentTime;
  p.then(b => {
    if (!b || ac.currentTime - t0 > 0.2) return;
    const s = ac.createBufferSource(), g = ac.createGain();
    s.buffer = b; s.playbackRate.value = rate;
    g.gain.value = gain * (man.sfx[name].gain ?? 1);
    s.connect(g); g.connect(sfxBus); s.start();
  });
}

// 撥一個音符（選顏色用）：i 決定音高，五聲音階往上排
export function note(i, { gain = 0.22, dur = 0.5 } = {}) {
  if (!live() || !soundOn) return;
  const f = PENTA[i % 5] * 2 ** Math.floor(i / 5), t = ac.currentTime;
  const o1 = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
  o1.type = "triangle"; o1.frequency.value = f; o2.type = "sine"; o2.frequency.value = f * 2;
  lp.type = "lowpass"; lp.frequency.value = 3200;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(sfxBus);
  o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
}
// 叮鈴：高八度隨機五聲音階（星星筆、魔法特效）
export function chime(gain = 0.12) { note(10 + ((Math.random() * 5) | 0), { gain, dur: 0.6 }); }

// 「畫變成樂器」用的幾種合成樂器：i 一樣是五聲音階第幾個音，at 是幾秒後響（排程，節奏才準）
// marimba 木琴、glock 鐵琴、pluck 撥弦、flute 笛子、drum 鼓（i 越小越低沉）
export function inst(kind, i, { gain = 0.2, at = 0 } = {}) {
  if (!live() || !soundOn) return;
  const t = ac.currentTime + at, f = PENTA[i % 5] * 2 ** Math.floor(i / 5);
  const g = ac.createGain(), end = t + (kind === "flute" ? 0.7 : kind === "drum" ? 0.35 : 0.9);
  g.connect(sfxBus);
  const osc = (type, freq) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = freq; o.start(t); o.stop(end + 0.05); return o; };
  if (kind === "drum") {   // 低音：音高往下掉的正弦＋一點點噪音
    const o = osc("sine", 150 + i * 6);
    o.frequency.setValueAtTime(150 + i * 6, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.25);
    g.gain.setValueAtTime(gain * 1.6, t); g.gain.exponentialRampToValueAtTime(0.0008, end);
    o.connect(g);
    if (noise) { const n = ac.createBufferSource(), lp = ac.createBiquadFilter(), ng = ac.createGain(); n.buffer = noise; lp.type = "lowpass"; lp.frequency.value = 900;
      ng.gain.setValueAtTime(gain * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.0008, t + 0.12); n.connect(lp); lp.connect(ng); ng.connect(sfxBus); n.start(t); n.stop(t + 0.15); }
    return;
  }
  if (kind === "flute") {   // 慢慢吹起來、帶一點顫音
    const o = osc("sine", f * 2), lfo = osc("sine", 5.5), lg = ac.createGain();
    lg.gain.value = f * 0.012; lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.08); g.gain.setValueAtTime(gain, end - 0.25); g.gain.linearRampToValueAtTime(0, end);
    o.connect(g); return;
  }
  if (kind === "pluck") {   // 鋸齒波＋快速關小的低通＝撥弦
    const o = osc("sawtooth", f), lp = ac.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.setValueAtTime(f * 8, t); lp.frequency.exponentialRampToValueAtTime(f * 1.2, t + 0.4);
    g.gain.setValueAtTime(gain * 0.7, t); g.gain.exponentialRampToValueAtTime(0.0008, end);
    o.connect(lp); lp.connect(g); return;
  }
  // 木琴／鐵琴：基音＋高泛音，敲下去馬上衰減（鐵琴高八度、泛音更亮、留得更久）
  const hi = kind === "glock", o1 = osc("sine", hi ? f * 4 : f * 2), o2 = osc("sine", (hi ? f * 4 : f * 2) * (hi ? 2.76 : 3.93)), g2 = ac.createGain();
  g2.gain.value = hi ? 0.35 : 0.25;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, hi ? end : t + 0.5);
  o1.connect(g); o2.connect(g2); g2.connect(g);
}

// ── 畫筆沙沙聲：下筆 on、移動時告訴速度（畫布上每毫秒幾像素）、放開 off ──
export function strokeOn(brush) {
  if (!live() || !soundOn || !noise) return;
  strokeOff(0.02);
  const [type, f, q, lvl] = SCRIBBLE[brush] || SCRIBBLE.marker;
  const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noise; s.loop = true; s.loopStart = Math.random();   // 每一筆從不同位置開始，聽起來不會一樣
  fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  g.gain.value = 0;
  s.connect(fl); fl.connect(g); g.connect(sfxBus); s.start(0, Math.random() * 1.5);
  scr = { s, g, fl, lvl, f, spray: brush === "spray" };
  if (scr.spray) g.gain.setTargetAtTime(lvl * 0.7, ac.currentTime, 0.03);   // 噴漆按著就有聲音
}
export function strokeSpeed(v) {
  if (!scr || !ac) return;
  const k = Math.min(1, v / 1.6), t = ac.currentTime, g = scr.g.gain;
  g.cancelScheduledValues(t);
  g.setTargetAtTime(scr.lvl * (scr.spray ? 0.7 + 0.3 * k : k), t, 0.04);
  if (!scr.spray) g.setTargetAtTime(0, t + 0.12, 0.08);   // 手指停著不動 → 沙沙聲自己慢慢收掉（下一次移動會再拉上來）
  scr.fl.frequency.setTargetAtTime(scr.f * (0.85 + 0.3 * k), t, 0.05);   // 畫越快音調越亮一點
}
export function strokeOff(fade = 0.08) {
  if (!scr || !ac) return;
  const { s, g } = scr, t = ac.currentTime;
  scr = null;
  g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, fade / 3);
  s.stop(t + fade + 0.05);
}

// ── 背景音樂：整段循環（loopStart～loopEnd），開關會淡入淡出 ──
export async function startBgm() {
  wantBgm = true;
  if (!ac || !man?.bgm || bgmSrc) return;
  const b = bgm || (bgm = await load("bgm", man.bgm.file));
  if (!b || bgmSrc || !wantBgm) return;
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = b; s.loop = true;
  if (man.bgm.loopEnd) { s.loopStart = man.bgm.loopStart || 0; s.loopEnd = man.bgm.loopEnd; }
  g.gain.setValueAtTime(0, ac.currentTime); g.gain.linearRampToValueAtTime(1, ac.currentTime + 1.5);
  s.connect(g); g.connect(musicBus); s.start();
  bgmSrc = s; bgmGain = g;
}
export function stopBgm() {
  wantBgm = false;
  if (!bgmSrc || !ac) return;
  const s = bgmSrc, t = ac.currentTime;
  bgmGain.gain.setTargetAtTime(0, t, 0.3); s.stop(t + 1.2);
  bgmSrc = bgmGain = null;
}

// 音樂、音效各自的開關（記在這台 iPad 上）
export function setMusic(on) {
  musicOn = on; savePref();
  if (musicBus) musicBus.gain.setTargetAtTime(on ? LEVEL.music : 0, ac.currentTime, 0.2);
}
export function setSound(on) {
  soundOn = on; savePref();
  if (!on) strokeOff();
  if (sfxBus) sfxBus.gain.setTargetAtTime(on ? LEVEL.sfx : 0, ac.currentTime, 0.05);
}
export const musicEnabled = () => musicOn;
export const soundEnabled = () => soundOn;
export const state = () => ({ ctx: ac?.state || "none", bgm: !!bgmSrc, loaded: [...buf.keys()], man: !!man });   // 測試用
