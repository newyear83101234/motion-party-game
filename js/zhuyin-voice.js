// ===================== 注音小島：預錄語音（Gemini 設計聲音 D「兒童節目大姐姐」）=====================
// voice/gemini_d/manifest.json：遊戲傳給 say() 的原字串（含標點）→ mp3。
// 有檔就用 Web Audio 播並回傳 true；沒有（或還沒解鎖聲音）回傳 false，讓呼叫端退回 speechSynthesis。
// iOS 最穩的做法：全程只用一個 AudioContext、在點擊裡 resume、fetch＋decodeAudioData、解碼結果快取（不要每句 new Audio()）。
// 音檔由 tools/voice/gen_full.py 產生；要加新句子：改 tools/voice/build_lines.py → 重跑 gen_full.py（會續跑沒做過的）。

const BASE = new URL("../voice/gemini_d/", import.meta.url).href;
const GAP = 0.12;                 // 兩段句（「找到了，」＋詞）中間的停頓（秒）
const OFF = /[?&]novoice(=|&|$)/.test(location.search);   // 網址加 ?novoice → 全部退回 speechSynthesis（除錯／比較用）

let man = null;
const manP = fetch(BASE + "manifest.json").then(r => (r.ok ? r.json() : null)).then(j => (man = j)).catch(() => null);
let ctx = null;
const raw = new Map();            // 檔名 → Promise<ArrayBuffer>（還沒解鎖聲音前先下載）
const dec = new Map();            // 檔名 → Promise<AudioBuffer>（解碼後快取）
let cur = null;                   // 目前這句：{ srcs, onEnd, done, timer }
export const voiceStats = { played: 0, ended: 0, timeouts: 0, failed: 0, decoded: 0 };   // 除錯／測試用

function getCtx() {
  if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
  return ctx;
}

// 在「手指點擊當下」呼叫一次（可以重複呼叫）：建立／喚醒 AudioContext，並播 1 個 sample 的靜音把 iOS 的音訊路徑打開
export function voiceUnlock() {
  const c = getCtx(); if (!c) return;
  if (c.state !== "running") c.resume().catch(() => {});
  try { const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0); } catch (e) {}
  for (const f of raw.keys()) decode(f).catch(() => {});      // 解鎖前預先下載的，現在順便解碼
}

// 文字 → 要依序播的檔名；「找到了，蝸牛」這種前綴句拆成「找到了！」＋「蝸牛」
function filesFor(text) {
  if (!man || typeof text !== "string") return null;
  const f = man.files[text]; if (f) return [f];
  for (const [pre, key] of Object.entries(man.split || {})) {
    if (!text.startsWith(pre)) continue;
    const a = man.files[key], b = man.files[text.slice(pre.length)];
    if (a && b) return [a, b];
  }
  return null;
}
export function voiceHas(text) { return !!filesFor(text); }
export const voiceReady = manP;   // manifest 載好（或失敗）時 resolve

function fetchRaw(f) {
  if (!raw.has(f)) {
    const p = fetch(BASE + f).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); });
    raw.set(f, p); p.catch(() => raw.delete(f));
  }
  return raw.get(f);
}
function decode(f) {
  if (dec.has(f)) return dec.get(f);
  const c = getCtx();
  const p = fetchRaw(f).then(ab => new Promise((ok, no) => {
    const r = c.decodeAudioData(ab.slice(0), ok, no);        // 舊 Safari 只有 callback 版；新版回傳 Promise（兩邊都接，resolve 只會算一次）
    if (r && r.then) r.then(ok, no);
  }));
  dec.set(f, p);
  p.then(() => { voiceStats.decoded++; raw.delete(f); }, () => { dec.delete(f); raw.delete(f); });
  return p;
}

function finish(my, how) {
  if (my.done) return; my.done = true; clearTimeout(my.timer);
  if (how) voiceStats[how]++;
  if (cur === my) cur = null;
  if (my.onEnd) { try { my.onEnd(); } catch (e) { console.error(e); } }
}

// 播一句。回傳 true＝由預錄語音負責（之後一定會呼叫 onEnd，被打斷也會）；false＝沒有這句的檔或聲音還沒解鎖
// rate：預錄語音本來就是自然語速，一般不要傳（改 rate 會連音高一起變）
export function voiceSay(text, { onEnd, rate = 1 } = {}) {
  const files = OFF ? null : filesFor(text);
  if (!files || !ctx) return false;
  while (cur) voiceStop();                               // 跟 speechSynthesis.cancel() 一樣：前一句被打斷時也呼叫它的 onEnd（onEnd 裡又開新句也一併停掉）
  const my = { srcs: [], onEnd, done: false, timer: 0 };
  cur = my; voiceStats.played++;
  if (window.__spoken) window.__spoken.push({ t: Math.round(performance.now()), text });   // 跟 tools/zy-test 的假語音同格式
  if (ctx.state !== "running") ctx.resume().catch(() => {});
  Promise.all(files.map(decode)).then(bufs => {
    if (my.done || cur !== my) return;                   // 解碼期間被打斷了
    let t = ctx.currentTime + 0.03;
    bufs.forEach((b, i) => {
      const s = ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate; s.connect(ctx.destination);
      s.start(t); my.srcs.push(s);
      t += b.duration / rate + (i < bufs.length - 1 ? GAP : 0);
      if (i === bufs.length - 1) s.onended = () => finish(my, "ended");
    });
    my.timer = setTimeout(() => finish(my, "timeouts"), (t - ctx.currentTime) * 1000 + 1500);   // 保險：分頁在背景時 onended 可能不來
  }).catch(err => { console.warn("[voice] 播放失敗：", text, err && err.message); finish(my, "failed"); });
  return true;
}

export function voiceStop() {
  const my = cur; if (!my) return; cur = null;
  for (const s of my.srcs) { s.onended = null; try { s.stop(); } catch (e) {} }
  finish(my);
}

export function voiceSpeaking() { return !!cur; }
// 共用同一個 AudioContext（警笛、鐘聲等程式合成的音效用；還沒解鎖聲音＝null）
export function voiceCtx() { return ctx && ctx.state === "running" ? ctx : null; }

// 背景預先下載（聲音解鎖後順便解碼）一批句子，例如一回合的題目詞；沒有檔的句子直接略過
export function voicePreload(texts) {
  return manP.then(() => {
    const jobs = [];
    for (const t of texts || []) for (const f of filesFor(t) || []) jobs.push((ctx ? decode(f) : fetchRaw(f)).catch(() => {}));
    return Promise.all(jobs);
  });
}
