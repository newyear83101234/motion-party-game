// ===================== 注音小島：預錄語音（Gemini 設計聲音 D「兒童節目大姐姐」）=====================
// voice/gemini_d/manifest.json：遊戲傳給 say() 的原字串（含標點）→ mp3。
// 有檔就用 Web Audio 播並回傳 true；沒有（或還沒解鎖聲音）回傳 false，讓呼叫端退回 speechSynthesis。
// iOS 最穩的做法：全程只用一個 AudioContext、在點擊裡 resume、fetch＋decodeAudioData、解碼結果快取（不要每句 new Audio()）。
// 音檔由 tools/voice/gen_full.py 產生；要加新句子：改 tools/voice/build_lines.py → 重跑 gen_full.py（會續跑沒做過的）。

const BASE = new URL("../voice/gemini_d/", import.meta.url).href;
const GAP = 0.12;                 // 兩段句（「找到了，」＋詞）中間的停頓（秒）
const OFF = /[?&]novoice(=|&|$)/.test(location.search);   // 網址加 ?novoice → 全部退回 speechSynthesis（除錯／比較用）

let man = null;
const manP = fetch(BASE + "manifest.json?v=20261012b").then(r => (r.ok ? r.json() : null)).then(j => (man = j)).catch(() => null);
let ctx = null;
const raw = new Map();            // 檔名 → Promise<ArrayBuffer>（還沒解鎖聲音前先下載）
const dec = new Map();            // 檔名 → Promise<AudioBuffer>（解碼後快取；Map 的順序＝最近用過的排最後＝LRU）
const decBytes = new Map();       // 檔名 → 解碼後佔多少 bytes（PCM float32：長度×聲道×4）
let decTotal = 0, decMax = 24 * 1024 * 1024;   // 解碼快取上限約 24MB（539 句全解碼約 190MB，iPad 會被系統收掉分頁；效能體檢 10-12 從 40MB 降下來）
let cur = null;                   // 目前這句：{ files, srcs, onEnd, done, timer }
export const voiceStats = { played: 0, ended: 0, timeouts: 0, failed: 0, decoded: 0, evicted: 0 };   // 除錯／測試用
// 測試用：看快取現況（bytes、句數、由舊到新的檔名）、暫時改上限
export function voiceCache(max) { if (max > 0) { decMax = max; trimDec(null); } return { bytes: decTotal, max: decMax, n: dec.size, files: [...dec.keys()] }; }

// 音訊引擎（js/zhuyin-audio.js）接進來：用它的 AudioContext、接它的 voice bus（全程只有一個 AudioContext）
// voiceBind({ ctx: () => AudioContext, out: () => AudioNode })；沒接的話自己開一個 context、直接接喇叭（舊行為，測試頁用）
let bind = null;
export function voiceBind(b) { bind = b || null; }
const outNode = () => { try { return (bind && bind.out && bind.out()) || ctx.destination; } catch (e) { return ctx.destination; } };
function getCtx() {
  if (!ctx && bind && bind.ctx) { try { ctx = bind.ctx() || null; } catch (e) { ctx = null; } }
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
  if (dec.has(f)) { const hit = dec.get(f); dec.delete(f); dec.set(f, hit); return hit; }   // 命中：移到最後（最近用過）
  const c = getCtx();
  const p = fetchRaw(f).then(ab => new Promise((ok, no) => {
    const r = c.decodeAudioData(ab.slice(0), ok, no);        // 舊 Safari 只有 callback 版；新版回傳 Promise（兩邊都接，resolve 只會算一次）
    if (r && r.then) r.then(ok, no);
  }));
  dec.set(f, p);
  p.then(b => {
    voiceStats.decoded++; raw.delete(f);
    if (dec.get(f) !== p || decBytes.has(f)) return;
    const n = (b && b.length * b.numberOfChannels * 4) || 0; decBytes.set(f, n); decTotal += n;
    trimDec(f);
  }, () => { dec.delete(f); raw.delete(f); });
  return p;
}
// 超過上限：從最久沒用的開始丟，但不丟剛解碼的這句、也不丟正在播／等著播的句子（還在解碼中的沒佔記憶體，跳過）
// 丟掉只是從 Map 拿掉；正在播的 AudioBufferSourceNode 自己抓著 buffer，不受影響
function trimDec(keep) {
  if (decTotal <= decMax) return;
  const busy = cur && cur.files ? cur.files : [];
  for (const k of dec.keys()) {
    if (decTotal <= decMax) break;
    if (k === keep || !decBytes.has(k) || busy.includes(k)) continue;
    decTotal -= decBytes.get(k); decBytes.delete(k); dec.delete(k); voiceStats.evicted++;
  }
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
  const my = { files, srcs: [], onEnd, done: false, timer: 0 };
  cur = my; voiceStats.played++;
  if (window.__spoken) window.__spoken.push({ t: Math.round(performance.now()), text });   // 跟 tools/zy-test 的假語音同格式
  if (ctx.state !== "running") ctx.resume().catch(() => {});
  Promise.all(files.map(decode)).then(bufs => {
    if (my.done || cur !== my) return;                   // 解碼期間被打斷了
    let t = ctx.currentTime + 0.03;
    bufs.forEach((b, i) => {
      const s = ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate; s.connect(outNode());
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
