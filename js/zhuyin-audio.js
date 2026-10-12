// ===================== 注音小島：音訊引擎（Web Audio 四條 bus）=====================
// 規格：docs/zhuyin-v5-plan.md §5。素材與循環點：audio/manifest.json（bgm.*.loopStart/loopEnd、sfx.*）。
//
//   BGM 曲目 ─→ 每首自己的 GainNode（交叉淡化）─→ duck（講話時壓低）─→ music ─┐
//   音效（含結算 party、警笛、鐘聲）──────────────────────────────→ sfx ───┤
//   預錄配音（zhuyin-voice.js）──────────────────────────────────→ voice ─┼→ master → 壓縮器（當限幅器）→ 喇叭
//   天氣聲、海鷗、船笛 ───────────────────────────────────────→ ambience ┘
//
// 為什麼不用 <audio>：iPad Safari 的 HTMLMediaElement.volume 沒有作用（音樂 0.3、講話壓低全部失效）、loop 有接縫、
// 同一個音效 currentTime=0 會被切斷。這裡全部走同一個 AudioContext（配音也是，不要開第二個）。
//
// iOS：AudioContext 只在第一次點擊（unlock()）才建立並 resume；之前只先下載。切到背景 suspend、回來 resume（只在原本有在播時）。
// iPad 記憶體：64 秒立體聲 BGM 解碼後約 23MB → 解碼好的 BGM 最多同時留 2 首（目前＋淡出中；效能體檢 10-12 從 3 首減下來，保留立體聲音質），
// 預載下一首只在「沒有在換曲、只有目前這首」時才做；其他照「最久沒用」先丟；音效很短，全部預載。
// 開頁：zhuyin.js 用 holdUntil() 讓「還沒解鎖聲音時的 BGM 下載」等 3D 小島建築長好（不搶頻寬）；第一次點擊解鎖就照常抓。
// 載入失敗（404／解碼錯）一律安靜略過、遊戲照跑，每個檔只 console.warn 一次。

const ROOT = new URL("../audio/", import.meta.url).href;
const AV = "1";                                   // 音檔版本（音檔換內容時主對話升這個，破 GitHub Pages 快取）
const LEVEL = { music: 0.32, sfx: 0.8, voice: 1, ambience: 0.5 };   // 各 bus 起始音量（BGM 都是 -18 LUFS、音效約 -17 dBFS RMS、配音約 -18 LUFS）
const TRIM = { ng: 0.5 };                         // 個別音效再調：答錯音小聲一點（A10：怪遊戲不怪小孩）
const DUCK_DB = -10, DUCK_IN = 0.15, DUCK_OUT = 0.4;   // 講話時音樂壓低 10 dB：約 150 ms 壓下去、400 ms 回來
const XFADE = 0.6;                                // 切曲：0.6 秒等功率交叉淡化
const MAX_BGM = 2;                                // 解碼好的 BGM 最多留幾首（目前＋淡出中）
const MAX_SFX = 24;                               // 同時最多幾個音效（泡泡連爆也不會無限疊）
const LATE_MS = 350;                              // 音效還沒載好：350 ms 內載好就補播，太晚就算了（晚到的聲音比沒聲音更怪）
const DEBUG = /[?&]debug\b/.test(location.search);

let ac = null, N = null;                          // AudioContext、節點 { master, limiter, duck, music, sfx, voice, ambience }
let unlocked = false, resumeAt = -1e9, hidSuspended = false;
let musicOn = true;
let man = null, manP = null;
const SFX = new Map();                            // 音效名 → 檔案項目
const BGM = new Map();                            // 曲目 key → 檔案項目
const warned = new Set();
const live = new Set();                           // 正在響的音效 { s, end }
const ducks = new Set();                          // 正在要求壓低音樂的來源
let duckOn = false;
let want = null;                                  // 想要播的曲目（音樂關著也記著，打開時接著播）
let cur = null;                                   // 目前的曲目 { key, e, s, g, auto }
const fading = new Set();                         // 淡出中的曲目
let rate = 1, bgTok = 0;
let hold = null;                                  // 開頁：還沒解鎖聲音時，BGM 下載先等這個 Promise（3D 小島建築長好）；解鎖後不等
export const stats = { sfx: 0, skipped: 0, unknown: 0, late: 0, failed: 0, bgmStarts: 0, maxBgm: 0, evicted: 0 };   // 除錯／測試用

// ---------- 小工具 ----------
const now = () => (ac ? ac.currentTime : 0);
function warnOnce(key, ...a) { if (warned.has(key)) return; warned.add(key); console.warn("[audio]", ...a); }
function ramp(param, v, sec) {                    // 平滑移到 v（sec ≈ 到 95% 的時間）
  if (!ac) return; const t = ac.currentTime;
  try { param.cancelScheduledValues(t); param.setTargetAtTime(v, t, Math.max(0.005, sec / 3)); } catch (e) { try { param.value = v; } catch (e2) {} }
}
function curveOf(from, to, n = 48) {              // 等功率：淡入走 sin、淡出走 cos（交叉時兩首平方和≈1，中間不會凹一塊）
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1); c[i] = to >= from ? from + (to - from) * Math.sin(x * Math.PI / 2) : to + (from - to) * Math.cos(x * Math.PI / 2); }
  return c;
}
function gainAt(t, at) {                          // 這首目前的音量（自己記帳；Safari 的 AudioParam.value 在自動化中不一定準）
  const a = t.auto; if (!a) return 1;
  const x = (at - a.t0) / a.dur, c = a.c; if (x <= 0) return c[0]; if (x >= 1) return c[c.length - 1];
  const f = x * (c.length - 1), i = Math.floor(f); return c[i] + (c[Math.min(i + 1, c.length - 1)] - c[i]) * (f - i);
}
function applyCurve(t, from, to, dur) {
  const t0 = ac.currentTime, c = curveOf(from, to), p = t.g.gain;
  try { p.cancelScheduledValues(t0); p.setValueCurveAtTime(c, t0, dur); }
  catch (e) { try { p.cancelScheduledValues(t0); p.setValueAtTime(from, t0); p.linearRampToValueAtTime(to, t0 + dur); } catch (e2) { try { p.value = to; } catch (e3) {} } }
  t.auto = { t0, dur, c };
}
// 能不能出聲：沒解鎖、藏在背景、或 context 停著（剛按下去 resume 中的 1 秒內除外）就不排程（不然恢復時會一次全部響出來）
function canSound() {
  if (!ac || document.hidden || hidSuspended) return false;
  return ac.state === "running" || performance.now() - resumeAt < 1000;
}

// ---------- AudioContext 與 bus ----------
function build() {
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  try { ac = new AC({ latencyHint: "interactive" }); } catch (e) { try { ac = new AC(); } catch (e2) { return null; } }
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}   // iOS：跟 <audio> 一樣不受靜音模式影響（Web Audio 預設會被靜音）
  const g = (name, v) => { const n = ac.createGain(); n.gain.value = v; n.__zy = name; return n; };
  const limiter = ac.createDynamicsCompressor(); limiter.__zy = "limiter";
  try { limiter.threshold.value = -3; limiter.knee.value = 1; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.15; } catch (e) {}
  const master = g("master", 1), music = g("music", musicOn ? LEVEL.music : 0), duck = g("duck", duckOn ? 10 ** (DUCK_DB / 20) : 1);
  const sfx = g("sfx", LEVEL.sfx), voice = g("voice", LEVEL.voice), ambience = g("ambience", musicOn ? LEVEL.ambience : 0);
  duck.connect(music); music.connect(master); sfx.connect(master); voice.connect(master); ambience.connect(master);
  master.connect(limiter); limiter.connect(ac.destination);
  N = { master, limiter, duck, music, sfx, voice, ambience };
  if (ac.addEventListener) ac.addEventListener("statechange", () => { if (ac.state === "running") resumeAt = -1e9; });
  return ac;
}
// 取得共用的 AudioContext（create＝沒有就建；配音、天氣、警笛都用這一個）
export function ctx(create = false) { return ac || (create ? build() : null); }
// 給配音／天氣／合成音接的 bus 入口（"music"｜"sfx"｜"voice"｜"ambience"）；還沒有 context＝null
export function busFor(kind) { if (!N) return null; return kind === "music" ? N.duck : N[kind] || N.sfx; }

// 在手指點擊當下呼叫（可重複呼叫）：建立／喚醒 AudioContext；第一次會把之前先下載的東西解碼、開始播音樂
export function unlock() {
  const c = ctx(true); if (!c) return;
  if (c.state !== "running" && !document.hidden) { resumeAt = performance.now(); hidSuspended = false; try { const r = c.resume(); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
  if (unlocked) return; unlocked = true;
  try { const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0); } catch (e) {}   // iOS：1 個 sample 的靜音打開音訊路徑
  if (want && musicOn) startWant();
  for (const e of SFX.values()) if (e.raw) load(e).catch(() => {});
}

// 切到背景：暫停整個 context（BGM、天氣聲都停，也不耗電）；回前景：原本有在播才恢復
document.addEventListener("visibilitychange", () => {
  if (!ac) return;
  if (document.hidden) { if (ac.state === "running") { hidSuspended = true; try { ac.suspend().catch(() => {}); } catch (e) {} } }
  else if (hidSuspended) { hidSuspended = false; resumeAt = performance.now(); try { ac.resume().catch(() => {}); } catch (e) {} }
});

// ---------- 清單與載入 ----------
function loadMan() {
  if (!manP) manP = fetch(ROOT + "manifest.json?v=" + AV).then(r => (r.ok ? r.json() : null)).catch(() => null).then(j => {
    man = j && j.bgm && j.sfx ? j : null;
    if (!man) warnOnce("manifest", "audio/manifest.json 讀不到，改用預設檔名（音效名稱沒辦法事先檢查）");
    return man;
  });
  return manP;
}
const fileUrl = f => new URL(f + (f.includes("?") ? "&" : "?") + "v=" + AV, new URL("../", import.meta.url)).href;
function sfxEntry(name) {
  if (SFX.has(name)) return SFX.get(name);
  let f = null, duck = false;
  if (name === "party") { f = man && man.bgm.party ? man.bgm.party.file : "audio/bgm/party.mp3"; duck = true; }   // 結算 jingle：走 sfx bus、播的時候壓低音樂
  else if (man) { if (man.sfx[name]) f = man.sfx[name].file; }
  else if (/^[a-z0-9_]+$/i.test(name)) f = `audio/sfx/${name}.mp3`;   // 清單讀不到：照檔名猜，404 就記成失敗
  if (!f) return null;
  const e = { kind: "sfx", name, url: fileUrl(f), buf: null, raw: null, dp: null, failed: 0, duck };
  SFX.set(name, e); return e;
}
function bgmEntry(key) {
  if (BGM.has(key)) return BGM.get(key);
  const m = man && man.bgm[key];
  if (man && (!m || key === "party")) return null;
  const e = { kind: "bgm", name: key, url: fileUrl(m ? m.file : `audio/bgm/${key}.mp3`), buf: null, raw: null, dp: null, failed: 0, used: 0,
    loop: m ? m.loop !== false : true, loopStart: m && m.loopStart, loopEnd: m && m.loopEnd };
  BGM.set(key, e); return e;
}
function fail(e, err) {
  e.failed = performance.now(); e.raw = null; e.dp = null; stats.failed++;
  warnOnce(e.url, "載入失敗，略過：", e.url.split("/").slice(-2).join("/").split("?")[0], err && (err.message || err));
}
// 下載（還沒解鎖）或下載＋解碼；回傳 Promise<AudioBuffer|null>
function load(e, low = false) {
  if (e.buf) return Promise.resolve(e.buf);
  if (e.failed && performance.now() - e.failed < 30000) return Promise.reject(new Error("failed"));   // 失敗過：30 秒內不再試（網路暫時斷掉之後還能恢復）
  if (!e.raw && !e.dp) {
    const rp = e.raw = fetch(e.url, low ? { priority: "low" } : undefined).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); });
    rp.catch(err => { if (e.raw === rp) fail(e, err); });
  }
  if (!ac) return e.raw.then(() => null);
  if (!e.dp) {
    const raw = e.raw, decode = ab => new Promise((ok, no) => { const r = ac.decodeAudioData(ab, ok, no); if (r && r.then) r.then(ok, no); });   // 舊 Safari 只有 callback 版
    let p;
    if (e.kind === "bgm") {                       // BGM 一次只解一首（狂切曲時不會同時解 6 首把 iPad 記憶體撐爆）；輪到時已經不需要了就跳過（下載的檔留著）
      p = raw.then(ab => {                        // 下載各自進行，只有「解碼」排隊
        const q = bgmGate.then(() => { if (e.name !== want && e.name !== prefKey) throw SKIP; makeRoom(e); return decode(ab); });
        bgmGate = Promise.race([q.then(() => {}, () => {}), new Promise(r => setTimeout(r, 15000))]);   // 保險：解碼卡住也不會擋死後面的；結果丟掉（效能體檢 10-12：原本這個 Promise 帶著解碼好的音樂，被 15 秒計時器多抓住 15 秒＝丟掉的 BGM 還佔 23MB）
        return q;
      });
    } else p = raw.then(decode);
    const dp = e.dp = p.then(b => {
      if (!b) throw new Error("decode");
      e.buf = b; e.raw = null; e.dp = null;
      if (e.kind === "bgm") { e.used = performance.now(); evict(e.name); countBgm(); }
      return b;
    }, err => { if (e.dp === dp) e.dp = null; if (err !== SKIP && e.raw === raw) fail(e, err); throw err; });
  }
  return e.dp;
}
const SKIP = new Error("skip");
let bgmGate = Promise.resolve(), prefKey = null;

// ---------- 記憶體：解碼好的 BGM 最多 MAX_BGM 首 ----------
const pinned = () => { const s = new Set([want]); if (cur) s.add(cur.key); for (const t of fading) s.add(t.key); return s; };
function decodedBgm() { return [...BGM.values()].filter(e => e.buf || e.dp); }
function countBgm() { const n = [...BGM.values()].filter(e => e.buf).length; if (n > stats.maxBgm) stats.maxBgm = n; }
function evict(keep = null, limit = MAX_BGM) {   // 丟掉最久沒用、沒在播的，直到 ≤ limit 首
  const pin = pinned(); if (keep) pin.add(keep);
  const list = decodedBgm().filter(e => e.buf && !pin.has(e.name)).sort((a, b) => a.used - b.used);
  while (decodedBgm().length > limit && list.length) { const e = list.shift(); e.buf = null; stats.evicted++; }
}
function makeRoom(e) {                            // 要解碼新的一首之前先騰出一個位置（其他的 ≤ MAX_BGM-1）；騰不出來（都在播）就把最舊的淡出曲直接收掉
  const others = () => decodedBgm().filter(x => x !== e).length, lim = () => MAX_BGM - 1 + (decodedBgm().includes(e) ? 1 : 0);
  evict(e.name, lim());
  if (others() >= MAX_BGM) { const old = [...fading].sort((a, b) => a.auto.t0 - b.auto.t0)[0]; if (old) { killTrack(old); evict(e.name, lim()); } }
}

// ---------- 音效 ----------
// 播一個音效：rate 改速度也改音高（連對音階往上爬靠這個）；gain 個別音量；bus 預設 sfx（環境音用 "ambience"）
// 不存在的名字安靜略過（回傳 false）；還沒載好的 350 ms 內載好就補播
export function sfx(name, { rate: r = 1, gain = 1, bus = "sfx" } = {}) {
  const g = gain * (TRIM[name] ?? 1);
  if (Array.isArray(window.__sfx)) window.__sfx.push({ f: name + ".mp3", name, rate: +(+r).toFixed(4), vol: +g.toFixed(4), pp: false, bus });   // 測試用（tools/zy-test）
  stats.sfx++;
  try {
    if (!man && !manP) loadMan();
    if (!man && manP) { const t0 = performance.now(); manP.then(() => { if (performance.now() - t0 < LATE_MS) playNow(name, r, g, bus, t0); }); return true; }
    return playNow(name, r, g, bus, performance.now());
  } catch (e) { return false; }
}
function playNow(name, r, g, bus, t0) {
  const e = sfxEntry(name); if (!e) { stats.unknown++; return false; }
  if (e.buf) { if (canSound()) start(e, r, g, bus); else stats.skipped++; return true; }
  load(e).then(b => { if (!b) return; if (performance.now() - t0 < LATE_MS && canSound()) { stats.late++; start(e, r, g, bus); } else stats.skipped++; }).catch(() => {});
  return true;
}
function start(e, r, g, bus) {
  const s = ac.createBufferSource(); s.buffer = e.buf;
  try { s.playbackRate.value = Math.max(0.25, Math.min(4, +r || 1)); } catch (err) {}
  let node = s; if (g !== 1) { node = ac.createGain(); node.gain.value = g; s.connect(node); }
  node.connect(busFor(bus) || N.sfx);
  const item = { s, node, duckKey: null, t: performance.now() };
  if (e.duck) { item.duckKey = "sfx#" + stats.sfx + ":" + Math.random(); duck(true, item.duckKey); }
  s.onended = () => endSfx(item);
  live.add(item);
  if (live.size > MAX_SFX) { const old = [...live].sort((a, b) => a.t - b.t)[0]; try { old.s.stop(); } catch (err) {} endSfx(old); }
  s.start();
  if (item.duckKey) item.timer = setTimeout(() => endSfx(item), (e.buf.duration / s.playbackRate.value) * 1000 + 600);   // 保險：背景時 onended 可能不來
}
function endSfx(item) {
  if (!live.has(item)) return; live.delete(item); clearTimeout(item.timer);
  try { item.s.disconnect(); if (item.node !== item.s) item.node.disconnect(); } catch (e) {}
  if (item.duckKey) duck(false, item.duckKey);
}
// 先把音效都抓下來（解鎖後順便解碼）；names 省略＝清單裡全部；low:false＝一般優先序（開頁第一下點擊就要響的那幾個）
export function preloadSfx(names, { low = true } = {}) {
  return loadMan().then(() => {
    const list = names || (man ? ["party", ...Object.keys(man.sfx)] : []);
    return Promise.all(list.map(n => { const e = sfxEntry(n); return e ? load(e, low).catch(() => null) : null; }));
  });
}

// ---------- 講話時壓低音樂 ----------
// duck(true/false, 來源)：同一個來源開／關是布林（重複關不會變負數），不同來源各算各的，全部關掉才回來
export function duck(on, src = "voice") {
  if (on) ducks.add(src); else ducks.delete(src);
  const want_ = ducks.size > 0; if (want_ === duckOn) return; duckOn = want_;
  if (N) ramp(N.duck.gain, duckOn ? 10 ** (DUCK_DB / 20) : 1, duckOn ? DUCK_IN : DUCK_OUT);
}

// ---------- 背景音樂 ----------
// playBgm(key)：同一首正在播就不動；不同首 0.6 秒等功率交叉淡化；音樂關著只記下來（打開時播這首）；不認得的 key 退回 island
let pend = null;                                  // 正在載入、載好就要播的那首
export function playBgm(key, { fade = XFADE } = {}) {
  if (!key) { stopBgm(); return; }
  if (man && (!man.bgm[key] || key === "party")) { warnOnce("bgmkey:" + key, `沒有這首背景音樂「${key}」，改播 island`); key = "island"; }
  if (want === key && (cur && cur.key === key || pend === key)) return;
  want = key;
  if (!musicOn) return;
  startWant(fade);
}
function startWant(fade = XFADE) {
  const key = want, tok = ++bgTok;
  if (!key || (cur && cur.key === key)) { pend = null; return; }
  pend = key;
  loadMan().then(() => (!ac && hold ? hold : null)).then(() => {
    if (tok !== bgTok) return;
    const e = bgmEntry(key);
    if (!e) { pend = null; if (key !== "island") { warnOnce("bgmkey:" + key, `沒有這首背景音樂「${key}」，改播 island`); want = "island"; startWant(fade); } return; }
    e.used = performance.now();
    load(e).then(buf => {
      if (tok !== bgTok || want !== key || !musicOn) return;
      if (!buf || !ac) return;                   // 還沒解鎖：先下載好，unlock() 時再播
      pend = null; startTrack(e, buf, fade);
    }).catch(() => { if (tok === bgTok) pend = null; });
  });
}
function startTrack(e, buf, fade) {
  if (cur) fadeOutTrack(cur, fade);
  while (fading.size > MAX_BGM - 1) killTrack([...fading].sort((a, b) => a.auto.t0 - b.auto.t0)[0]);   // 狂切曲：同時最多 1 首新的＋1 首淡出中（解碼好的 ≤ 2 首）
  const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = buf; g.gain.value = 0;
  const ls = +e.loopStart, le = +e.loopEnd, okLoop = e.loop && ls >= 0 && le > ls && le <= buf.duration + 0.01;
  s.loop = !!e.loop; if (okLoop) { s.loopStart = ls; s.loopEnd = Math.min(le, buf.duration); }
  try { s.playbackRate.value = rate; } catch (err) {}
  s.connect(g); g.connect(N.duck);
  const t = { key: e.name, e, s, g, auto: null };
  applyCurve(t, 0, 1, Math.max(0.05, fade));
  s.start(ac.currentTime, okLoop ? ls : 0);        // 從循環段開頭（小節邊界）開始
  s.onended = () => { try { s.disconnect(); g.disconnect(); } catch (err) {} };
  cur = t; e.used = performance.now(); stats.bgmStarts++;
  evict(); countBgm();
}
function fadeOutTrack(t, dur) {
  if (cur === t) cur = null;
  const v = gainAt(t, ac.currentTime); applyCurve(t, v, 0, Math.max(0.05, dur));
  try { t.s.stop(ac.currentTime + dur + 0.05); } catch (e) {}
  fading.add(t);
  t.s.onended = () => { try { t.s.disconnect(); t.g.disconnect(); } catch (e) {} fading.delete(t); evict(); };
  clearTimeout(t.timer); t.timer = setTimeout(() => { if (fading.has(t)) { fading.delete(t); evict(); } }, (dur + 1) * 1000);   // 保險：背景時 onended 可能不來
}
function killTrack(t) {                           // 立刻收掉（50 ms 淡出）
  if (cur === t) cur = null;
  try { const p = t.g.gain, t0 = ac.currentTime; p.cancelScheduledValues(t0); p.setValueAtTime(gainAt(t, t0), t0); p.linearRampToValueAtTime(0, t0 + 0.05); t.s.stop(t0 + 0.06); } catch (e) {}
  t.auto = { t0: ac.currentTime, dur: 0.05, c: new Float32Array([0, 0]) };
  fading.delete(t); clearTimeout(t.timer);
}
// 開頁（效能體檢 10-12）：還沒解鎖聲音時，BGM 的下載等 p（3D 小島建築長好；zhuyin.js 自己加逾時）；p 結束前就解鎖（第一次點擊）→ 不等、馬上抓
export function holdUntil(p) { const h = hold = Promise.resolve(p).catch(() => {}).then(() => { if (hold === h) hold = null; }); }
export function stopBgm({ fade = XFADE } = {}) { want = null; pend = null; bgTok++; if (cur && ac) fadeOutTrack(cur, fade); cur = null; }
// 閒置時先把「最可能的下一首」下載＋解碼：只在沒有在換曲（沒有淡出中的）、只有目前這首在用時才做（效能體檢 10-12；不會超過 MAX_BGM）
export function prefetchBgm(key) {
  if (!key) return;
  const go = () => {
    const e = bgmEntry(key); if (!e || e.buf || e.dp) { if (e) e.used = Math.max(e.used, performance.now() - 1); return; }
    if (!ac) { if (!e.raw) load(e, true).catch(() => {}); return; }
    if (!musicOn) return;
    const pin = pinned(), room = !fading.size && !pend && decodedBgm().filter(x => pin.has(x.name)).length <= 1;   // 舊的、沒在播的會在解碼前被丟掉（makeRoom）
    if (!room) return;
    prefKey = key; e.used = performance.now(); load(e, true).catch(() => {});
  };
  loadMan().then(go);
}
// 最後一題衝刺（A19）：BGM 加速（Web Audio 沒辦法保留音高，會跟著升一點）
export function bgmRate(r = 1) {
  rate = Math.max(0.5, Math.min(2, +r || 1));
  if (cur && ac) { try { cur.s.playbackRate.setTargetAtTime(rate, ac.currentTime, 0.04); } catch (e) {} }
}

// ---------- 音樂開關（管 music＋ambience；音效、配音不受影響）----------
export function setMusic(on) {
  musicOn = !!on;
  if (!N) return;
  ramp(N.music.gain, musicOn ? LEVEL.music : 0, 0.45); ramp(N.ambience.gain, musicOn ? LEVEL.ambience : 0, 0.45);
  if (!musicOn) { pend = null; bgTok++; if (cur) fadeOutTrack(cur, 0.5); cur = null; }   // 關掉＝淡出後停掉（不在背景空轉），記住 want
  else if (want) startWant();
}
export const musicEnabled = () => musicOn;

// ---------- 測試／除錯 ----------
export function debug() {
  const at = now(), v = n => (n ? +n.gain.value.toFixed(4) : null);
  return {
    state: ac ? ac.state : "none", unlocked, musicOn, want, cur: cur && cur.key, pend, rate,
    tracks: [...(cur ? [cur] : []), ...fading].map(t => ({ key: t.key, role: t === cur ? "cur" : "fade", gain: +gainAt(t, at).toFixed(4), param: +t.g.gain.value.toFixed(4) })),
    bus: N ? { master: v(N.master), music: v(N.music), duck: v(N.duck), sfx: v(N.sfx), voice: v(N.voice), ambience: v(N.ambience) } : null,   // 實際 AudioParam 值（Chrome：沒有聲音流過的節點不更新，看 target）
    target: { music: musicOn ? LEVEL.music : 0, ambience: musicOn ? LEVEL.ambience : 0, duck: duckOn ? +(10 ** (DUCK_DB / 20)).toFixed(4) : 1, sfx: LEVEL.sfx, voice: LEVEL.voice },
    limiter: N ? { threshold: N.limiter.threshold.value, ratio: N.limiter.ratio.value, attack: +N.limiter.attack.value.toFixed(4), knee: N.limiter.knee.value } : null,
    ducks: [...ducks], duckOn, liveSfx: live.size, bgmDecoded: [...BGM.values()].filter(e => e.buf).map(e => e.name),
    sfxDecoded: [...SFX.values()].filter(e => e.buf).length, stats: { ...stats }, time: +at.toFixed(3),
  };
}
const api = { unlock, ctx, busFor, sfx, preloadSfx, duck, playBgm, stopBgm, prefetchBgm, holdUntil, bgmRate, setMusic, musicEnabled, debug, stats, LEVEL };
if (DEBUG) window.__zyAudio = api;
export default api;
