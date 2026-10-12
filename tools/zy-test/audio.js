// 音訊引擎測試：node tools/zy-test/audio.js（js/zhuyin-audio.js，docs/zhuyin-v5-plan.md §5）
// 驗：只有一個 AudioContext、bus 圖（duck→music→master→limiter→喇叭；sfx/voice/ambience→master）、各 bus 起始音量、限幅器參數、
//     配音接 voice bus、天氣聲接 ambience bus、BGM 切曲 0.6 秒等功率交叉淡化（量 gain 隨時間）、同一首不重播、
//     講話時音樂 -10 dB（150ms 壓、400ms 回）且多來源各算各的、真的唸字時有壓、visibilitychange suspend／resume（原本沒在播就不恢復）、
//     不存在的音效名不丟錯也不發請求、同一個音效連點 5 次可以重疊、解碼好的 BGM 不超過 3 首（逐首切＋狂切）、
//     音樂關掉＝music/ambience 靜音但 sfx/voice 照常、打開接著播、載入失敗（404）安靜略過且只警告一次、
//     沒有聲音的環境（AudioContext 起不來＋音檔全 404）遊戲流程照走、?no3d／?weather=rain 沒有 console error
const { launch, URL } = require("./lib");
const out = []; const ok = (name, cond, info = "") => out.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" ? "  — " + info : ""}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, tol) => typeof a === "number" && Math.abs(a - b) <= tol;

async function open(browser, { query = "debug&clock=day", stickers = 40, route = null, stuck = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  if (stuck) await ctx.addInitScript(() => {   // 模擬 iPad 聲音一直解不開：AudioContext 建出來就停著、resume() 永遠不回
    const AC = window.AudioContext;
    window.AudioContext = class extends AC { constructor(...a) { super(...a); AC.prototype.suspend.call(this); } resume() { return new Promise(() => {}); } };
  });
  await ctx.addInitScript(() => {
    window.__spoken = [];
    const fake = { speaking: false, cancel() {}, getVoices() { return []; }, onvoiceschanged: null,
      speak(u) { if (u.text.trim()) window.__spoken.push({ t: Math.round(performance.now()), text: u.text }); setTimeout(() => { u.onend && u.onend(); }, 250); } };
    Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
    // 數 AudioContext、記下 Web Audio 的接線（引擎的 bus 節點有 __zy 名字）
    window.__acN = 0; window.__edges = [];
    const AC = window.AudioContext;
    if (AC) window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__acN++; } };
    const oc = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (d, ...r) {
      try { if (d && (this.__zy || d.__zy || d instanceof AudioDestinationNode)) window.__edges.push([this.__zy || this.constructor.name, d.__zy || d.constructor.name]); } catch (e) {}
      return oc.call(this, d, ...r);
    };
  });
  const p = await ctx.newPage(); const errs = [], warns = [], reqs = [];
  p.on("pageerror", e => errs.push("PAGEERR " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text()) && !(route && /Failed to load resource/.test(m.text()))) errs.push("CONSOLE " + m.text().slice(0, 160)); if (m.type() === "warning" && /\[audio\]/.test(m.text())) warns.push(m.text().slice(0, 200)); });
  p.on("request", r => { if (/\/audio\//.test(r.url())) reqs.push(r.url()); });
  if (route) await p.route(route.match, r => r.fulfill({ status: 404, body: "nope" }));
  await p.goto(URL + "?" + query); await p.waitForTimeout(300);
  await p.evaluate(({ stickers }) => {
    localStorage.clear();
    return import("./js/zhuyin-words.js").then(({ WORDS }) => {
      const s = {}; WORDS.slice(0, stickers).forEach(w => s[w.h] = 1);
      localStorage.setItem("zy1_stickers", JSON.stringify(s));
      localStorage.setItem("zy1_intro", JSON.stringify({ fish: 1, order: 1, build: 1, hunt: 1, match: 1, tone: 1, whack: 1, frog: 1, bubble: 1, deliver: 1 }));
    });
  }, { stickers });
  errs.length = warns.length = reqs.length = 0;   // 只算 reload 之後（真正的這一次開頁）
  await p.reload(); await p.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 20000 });
  await p.evaluate(() => { document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); const g = document.getElementById("startGate"); if (g && !g.classList.contains("hidden")) document.getElementById("startBtn").click(); });
  await p.waitForTimeout(300);
  return { ctx, p, errs, warns, reqs };
}
const D = p => p.evaluate(() => window.__zyAudio.debug());
const waitCur = (p, k, t = 8000) => p.waitForFunction(k => { const d = window.__zyAudio.debug(); return d.cur === k && d.tracks.find(x => x.role === "cur" && x.gain > 0.98); }, k, { timeout: t, polling: 50 });
const setHidden = (p, h) => p.evaluate(h => { Object.defineProperty(document, "hidden", { configurable: true, get: () => h }); Object.defineProperty(document, "visibilityState", { configurable: true, get: () => h ? "hidden" : "visible" }); document.dispatchEvent(new Event("visibilitychange")); }, h);

(async () => {
  const browser = await launch(["--autoplay-policy=no-user-gesture-required"]);
  // ===== 1. 圖、音量、單一 context、交叉淡化、壓低、背景、重疊、記憶體 =====
  {
    const { ctx, p, errs, warns, reqs } = await open(browser, { query: "debug&clock=day&no3d" });   // 不開 3D 小島：headless 軟體算圖會讓頁面計時器卡頓，量不準淡入淡出（3D 小島＋天氣在第 3 段另測）
    await waitCur(p, "island").then(() => ok("開始畫面點下去：選單音樂 island 淡入播放", true), async () => ok("開始畫面點下去：選單音樂 island 淡入播放", false, JSON.stringify(await D(p))));
    let d = await D(p);
    ok("AudioContext 在跑（running）", d.state === "running", d.state);
    ok("bus 起始音量 music .32／sfx .8／voice 1／ambience .5／master 1", d.bus && near(d.bus.music, 0.32, 0.01) && near(d.bus.sfx, 0.8, 0.01) && near(d.bus.voice, 1, 0.01) && near(d.bus.ambience, 0.5, 0.01) && near(d.bus.master, 1, 0.001), JSON.stringify(d.bus));
    ok("限幅器：threshold -3dB、ratio 20、attack ≤ 5ms", d.limiter && d.limiter.threshold === -3 && d.limiter.ratio === 20 && d.limiter.attack <= 0.005, JSON.stringify(d.limiter));
    const E = await p.evaluate(() => window.__edges.map(e => e.join(">")));
    const need = ["duck>music", "music>master", "sfx>master", "voice>master", "ambience>master", "master>limiter", "limiter>AudioDestinationNode", "GainNode>duck"];
    const miss = need.filter(x => !E.includes(x));
    ok("bus 圖正確（BGM 曲目→duck→music→master→限幅器→喇叭；sfx/voice/ambience→master）", miss.length === 0, miss.length ? "缺：" + miss.join(", ") : "");
    const dest = E.filter(e => e.endsWith(">AudioDestinationNode") && !e.startsWith("limiter>"));
    ok("沒有節點繞過 master 直接接喇叭（只有解鎖用的 1 sample 靜音 BufferSource）", dest.every(e => e === "AudioBufferSourceNode>AudioDestinationNode"), JSON.stringify(dest));
    // ---- 交叉淡化：在頁面裡每 30ms 取一次（AudioParam 實際值＋context 時間）----
    const s0 = (await D(p)).stats.bgmStarts;
    const samples = await p.evaluate(async () => {
      const A = window.__zyAudio, out = []; A.playBgm("calm");
      for (let i = 0; i < 90; i++) { const d = A.debug(); out.push({ t: d.time, cur: d.cur, tr: d.tracks.map(x => [x.key, x.role, x.param]) }); if (d.cur === "calm" && d.tracks.length === 1 && out.length > 5 && out[out.length - 6].tr.length === 1) break; await new Promise(r => setTimeout(r, 30)); }
      return out;
    });
    const g = (s, k) => { const x = s.tr.find(t => t[0] === k); return x ? x[2] : 0; };
    const xf = samples.filter(s => s.tr.length === 2);
    const isl = xf.map(s => g(s, "island")), clm = xf.map(s => g(s, "calm"));
    const mono = (a, dir) => a.every((v, i) => i === 0 || (dir > 0 ? v >= a[i - 1] - 0.02 : v <= a[i - 1] + 0.02));
    const mid = xf.map(s => [g(s, "island"), g(s, "calm")]).filter(([a, b]) => a > 0.15 && b > 0.15);
    const powOk = mid.length >= 3 && mid.every(([a, b]) => a * a + b * b > 0.85 && a * a + b * b < 1.15);
    const dur = xf.length ? xf[xf.length - 1].t - xf[0].t : 0;
    ok("切曲交叉淡化：island 一路降、calm 一路升（AudioParam 實測）", xf.length >= 6 && mono(isl, -1) && mono(clm, 1) && isl[0] > 0.8 && clm[0] < 0.3, JSON.stringify({ isl: isl.map(v => +v.toFixed(2)), clm: clm.map(v => +v.toFixed(2)) }));
    ok("交叉淡化是等功率（兩首都在時平方和≈1）、約 0.6 秒、之後只剩新的那首", powOk && dur > 0.4 && dur < 0.75 && samples[samples.length - 1].tr.length === 1 && g(samples[samples.length - 1], "calm") > 0.99, JSON.stringify({ dur: +dur.toFixed(2), pow: mid.map(([a, b]) => +(a * a + b * b).toFixed(2)) }));
    await p.evaluate(() => window.__zyAudio.playBgm("calm")); await sleep(200);
    ok("同一首 playBgm 不重播", (await D(p)).stats.bgmStarts === s0 + 1, JSON.stringify((await D(p)).stats));
    // ---- 講話壓低 ----
    await p.evaluate(() => window.__zyAudio.duck(true, "t1")); await sleep(70);
    const dk70 = (await D(p)).bus.duck; await sleep(330);
    const dk400 = (await D(p)).bus.duck;
    ok("duck：約 150ms 內壓到 -10 dB（0.316）", dk70 < 0.75 && near(dk400, 0.316, 0.03), JSON.stringify({ dk70, dk400 }));
    await p.evaluate(() => { window.__zyAudio.duck(true, "t2"); window.__zyAudio.duck(false, "t1"); }); await sleep(300);
    const dk2 = (await D(p)).bus.duck;
    await p.evaluate(() => window.__zyAudio.duck(false, "t2")); await sleep(120);
    const up120 = (await D(p)).bus.duck; await sleep(900);
    const up1000 = (await D(p)).bus.duck;
    ok("duck：多來源（一個放開另一個還壓著）、全部放開約 400ms 回來", near(dk2, 0.316, 0.03) && up120 < 0.95 && up120 > dk2 && up1000 > 0.97, JSON.stringify({ dk2, up120, up1000 }));
    await p.evaluate(() => { window.__zyAudio.duck(false, "voice"); window.__zyAudio.duck(false, "voice"); }); await sleep(50);
    ok("重複放開不會變負數（之後一壓一放還是正常）", (await D(p)).ducks.length === 0);
    // ---- 背景／前景 ----
    const waitState = s => p.waitForFunction(s => window.__zyAudio.debug().state === s, s, { timeout: 3000, polling: 50 }).catch(() => {});
    await setHidden(p, true); await waitState("suspended");
    const sHid = (await D(p)).state;
    await setHidden(p, false); await waitState("running");
    const sVis = (await D(p)).state;
    ok("切到背景 suspend、回前景 resume", sHid === "suspended" && sVis === "running", JSON.stringify({ sHid, sVis }));
    await p.evaluate(() => window.__zyAudio.ctx().suspend()); await sleep(100);
    await setHidden(p, true); await sleep(100); await setHidden(p, false); await sleep(300);
    const sKeep = (await D(p)).state;
    ok("原本就停著的（不是因為切背景）回前景不會自己恢復", sKeep === "suspended", sKeep);
    await p.evaluate(() => window.__zyAudio.ctx().resume()); await sleep(150);
    // ---- 不存在的音效、重疊 ----
    await p.waitForFunction(() => window.__zyAudio.debug().sfxDecoded >= 20, null, { timeout: 10000 }).catch(() => {});
    const r0 = reqs.length;
    const nx = await p.evaluate(() => { try { return { r: window.__zyAudio.sfx("no_such_sound_xyz"), err: null }; } catch (e) { return { err: e.message }; } }); await sleep(300);
    ok("play 不存在的名字：不丟錯、回 false、不發請求", nx.err === null && nx.r === false && !reqs.slice(r0).some(u => /no_such/.test(u)), JSON.stringify(nx));
    const live0 = (await D(p)).liveSfx;
    await p.evaluate(() => { for (let i = 0; i < 5; i++) window.__zyAudio.sfx("win", { rate: 1 + i * 0.05 }); }); await sleep(40);
    const live5 = (await D(p)).liveSfx;
    ok("同一音效連點 5 次可以重疊（同時 5 個在響）", live5 - live0 >= 5, JSON.stringify({ live0, live5 }));
    // ---- 記憶體：逐首切 ----
    const keys = ["island", "town", "rainbow", "night", "road", "dress", "bubble", "calm", "island"];
    const counts = [];
    for (let i = 0; i < keys.length; i++) {
      await p.evaluate(k => window.__zyAudio.playBgm(k), keys[i]);
      await waitCur(p, keys[i]).catch(() => {});
      if (keys[i + 1]) await p.evaluate(k => window.__zyAudio.prefetchBgm(k), keys[i + 1]);
      await sleep(700); counts.push((await D(p)).bgmDecoded.length);
    }
    d = await D(p);
    ok("逐首切 9 次＋每次預載下一首：解碼好的 BGM 一直 ≤ 2 首（效能體檢 10-12：原本 3）", counts.every(n => n <= 2) && d.stats.maxBgm <= 2, JSON.stringify({ counts, max: d.stats.maxBgm, evicted: d.stats.evicted }));
    // 狂切（每 120ms 換一首）
    for (const k of ["town", "rainbow", "night", "road", "dress", "bubble"]) { await p.evaluate(k => window.__zyAudio.playBgm(k), k); await sleep(120); }
    await waitCur(p, "bubble").catch(() => {});
    const midTracks = (await D(p)).tracks.length; await sleep(900);
    d = await D(p);
    ok("狂切 6 首：最後停在最後一首、同時 ≤ 2 軌、解碼好的 ≤ 2 首", d.cur === "bubble" && d.tracks.length === 1 && midTracks <= 2 && d.stats.maxBgm <= 2, JSON.stringify({ cur: d.cur, midTracks, max: d.stats.maxBgm, decoded: d.bgmDecoded }));
    // ---- 音樂開關（走遊戲的 🎵 按鈕）----
    await p.waitForFunction(() => window.__zyAudio.debug().sfxDecoded >= 20, null, { timeout: 10000 }).catch(() => {});
    await p.evaluate(() => { document.getElementById("musicBtn").click(); window.__zyAudio.sfx("win", { bus: "ambience", gain: 0.01 }); });   // ambience 要有聲音流過，Chrome 才會更新它的 AudioParam 值
    await sleep(900);
    d = await D(p);
    const liveA = d.liveSfx; await p.evaluate(() => window.__zyAudio.sfx("win")); await sleep(40);
    const liveB = (await D(p)).liveSfx;
    ok("🎵 關：music／ambience bus 靜音、曲目停掉；sfx／voice 照常、音效照響", d.bus.music < 0.02 && d.bus.ambience < 0.02 && d.target.music === 0 && d.target.ambience === 0 && near(d.bus.sfx, 0.8, 0.01) && near(d.bus.voice, 1, 0.01) && d.cur === null && d.tracks.length === 0 && liveB > liveA, JSON.stringify({ bus: d.bus, target: d.target, cur: d.cur, liveA, liveB }));
    await p.evaluate(() => window.__zyAudio.playBgm("calm")); await sleep(300);
    const offWant = await D(p);
    await p.evaluate(() => document.getElementById("musicBtn").click());
    await waitCur(p, "calm").then(() => {}, () => {}); await sleep(600);
    d = await D(p);
    ok("音樂關著時換曲只記下來；🎵 開＝淡入播記下的那首", offWant.cur === null && offWant.want === "calm" && d.cur === "calm" && near(d.bus.music, 0.32, 0.02) && d.target.ambience === 0.5, JSON.stringify({ off: { cur: offWant.cur, want: offWant.want }, on: { cur: d.cur, bus: d.bus, target: d.target } }));
    // ---- 真的唸字：配音接 voice bus、講話時壓低 ----
    await p.evaluate(() => { document.getElementById("homeBtn"); document.querySelector(".mode-card[data-mode=fish]").click(); });
    await p.waitForFunction(() => !document.getElementById("fish").classList.contains("hidden") && document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });
    await sleep(1500);
    await p.waitForFunction(() => window.__zyAudio.debug().ducks.length === 0, null, { timeout: 8000 }).catch(() => {});
    await p.evaluate(() => document.getElementById("speakBtn").click());
    await sleep(350);
    const during = await D(p);
    await p.waitForFunction(() => window.__zyAudio.debug().ducks.length === 0, null, { timeout: 8000 }).catch(() => {}); await sleep(700);
    const after = await D(p);
    const E2 = await p.evaluate(() => window.__edges.map(e => e.join(">")));
    ok("遊戲中按「再聽」：唸字時音樂壓到 -10 dB、唸完回來", during.ducks.includes("voice") && near(during.bus.duck, 0.316, 0.06) && after.bus.duck > 0.95, JSON.stringify({ during: [during.ducks, during.bus.duck], after: after.bus.duck }));
    ok("預錄配音接 voice bus（不是直接接喇叭）", E2.includes("AudioBufferSourceNode>voice"), "");
    ok("遊戲中 BGM＝MODES.fish.bgm（island）", after.cur === "island", after.cur);
    ok("整頁只有 1 個 AudioContext", (await p.evaluate(() => window.__acN)) === 1, String(await p.evaluate(() => window.__acN)));
    ok("音訊段沒有 console error／沒有 [audio] 警告", errs.length === 0 && warns.length === 0, [...errs, ...warns].join(" | "));
    await ctx.close();
  }
  // ===== 2. 載入失敗：404 安靜略過、只警告一次、原本的音樂照播 =====
  {
    const { ctx, p, errs, warns } = await open(browser, { route: { match: /\/audio\/(bgm\/calm|sfx\/ok)\.mp3/ } });
    const pre = await waitCur(p, "island", 15000).then(() => "ok", async () => JSON.stringify(await D(p)));
    const r = await p.evaluate(async () => { const A = window.__zyAudio; let err = null; try { A.playBgm("calm"); await new Promise(r => setTimeout(r, 800)); A.playBgm("island"); A.playBgm("calm"); A.sfx("ok"); A.sfx("ok"); } catch (e) { err = e.message; } await new Promise(r => setTimeout(r, 800)); return { err, d: A.debug() }; });
    const calmWarn = warns.filter(w => /calm\.mp3/.test(w)).length, okWarn = warns.filter(w => /ok\.mp3/.test(w)).length;
    ok("BGM／音效 404：不丟錯、沒有 console error、原本的 island 照播", r.err === null && errs.length === 0 && r.d.cur === "island", JSON.stringify({ err: r.err, cur: r.d.cur, errs, pre, want: r.d.want, pend: r.d.pend, stats: r.d.stats }));
    ok("同一個壞檔只警告一次", calmWarn === 1 && okWarn === 1, JSON.stringify(warns));
    await p.evaluate(() => window.__zyAudio.playBgm("no_such_key")); await sleep(600);
    ok("不認得的曲目 key：退回 island、不出錯", (await D(p)).cur === "island" && errs.length === 0, JSON.stringify((await D(p)).cur));
    await ctx.close();
  }
  // ===== 3. ?no3d、?weather=rain：沒有 console error；雨聲接 ambience bus =====
  for (const q of ["debug&clock=day&no3d", "debug&clock=day&weather=rain"]) {
    const { ctx, p, errs } = await open(browser, { query: q });
    await waitCur(p, "island").catch(() => {});
    await p.evaluate(() => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))); await sleep(1500);
    const E = await p.evaluate(() => window.__edges.map(e => e.join(">")));
    ok(`?${q.split("&").pop()}：選單音樂在播、沒有 console error`, (await D(p)).cur === "island" && errs.length === 0, errs.join(" | "));
    if (/rain/.test(q)) {
      ok("天氣聲（雨）接 ambience bus", E.includes("GainNode>ambience"), JSON.stringify(E.filter(e => /ambience/.test(e))));
      ok("3D 小島＋天氣：整頁還是只有 1 個 AudioContext", (await p.evaluate(() => window.__acN)) === 1, String(await p.evaluate(() => window.__acN)));
    }
    await ctx.close();
  }
  // ===== 3b. 配音解碼快取有上限（v5 審查 里維⚠️3：539 句全解碼約 190MB）：LRU、命中刷新順序、正在播的不丟 =====
  {
    const { ctx, p, errs } = await open(browser);
    const r = await p.evaluate(async () => {
      const V = await import("./" + document.querySelector("link[href*='zhuyin-voice.js']").getAttribute("href")); await V.voiceReady;   // 跟遊戲同一個模組（同一份快取）：版號照頁面上的 modulepreload（10-13 原本寫死 v=6，升版後拿到另一份模組）
      const man = await (await fetch("./voice/gemini_d/manifest.json")).json();
      const texts = Object.keys(man.files).filter(t => !Object.keys(man.split || {}).some(s => t.startsWith(s)));
      const fileOf = t => man.files[t], out = {};
      out.defMax = V.voiceCache().max;
      // 小上限（3MB）好驗：一批一批解碼，總量永遠不超過上限
      V.voiceCache(3 * 1024 * 1024);
      let over = 0; for (let i = 0; i < 40; i += 5) { await V.voicePreload(texts.slice(i, i + 5)); const c = V.voiceCache(); if (c.bytes > c.max) over++; }
      const c1 = V.voiceCache(); out.small = { bytes: c1.bytes, n: c1.n, over, evicted: V.voiceStats.evicted };
      // 命中刷新順序：把目前最舊的 A 再用一次 → 排到最新；之後一句一句解碼，直到原本第二舊的 B 被丟掉——那時 A 要還在（LRU：丟的是 B 不是 A）
      const A = c1.files[0], B = c1.files[1], tA = texts.find(t => fileOf(t) === A);
      await V.voicePreload([tA]); out.hitMovedToEnd = V.voiceCache().files.slice(-1)[0] === A;
      let k = 40; while (k < 70 && V.voiceCache().files.includes(B)) await V.voicePreload([texts[k++]]);
      out.hitSurvived = !V.voiceCache().files.includes(B) && V.voiceCache().files.includes(A);
      // 正在播的句子不丟：開始播一句，馬上把上限壓到 1 byte → 只剩這句
      const tPlay = texts[60]; await V.voicePreload([tPlay]);
      const ended0 = V.voiceStats.ended, failed0 = V.voiceStats.failed;
      const done = new Promise(res => { out.said = V.voiceSay(tPlay, { onEnd: res }); });
      await new Promise(res => setTimeout(res, 30));
      const c2 = V.voiceCache(1); out.busy = { files: c2.files, want: fileOf(tPlay) };
      await Promise.race([done, new Promise(res => setTimeout(res, 8000))]);
      out.playedOk = V.voiceStats.ended === ended0 + 1 && V.voiceStats.failed === failed0;
      // 預設上限 24MB（效能體檢 10-12：原本 40MB）：解碼 170 句（約 60MB）→ 不超過 24MB、有丟掉舊的
      V.voiceCache(out.defMax);
      for (let i = 100; i < 270; i += 10) await V.voicePreload(texts.slice(i, i + 10));
      const c3 = V.voiceCache(); out.big = { mb: +(c3.bytes / 1048576).toFixed(1), n: c3.n, evicted: V.voiceStats.evicted, decoded: V.voiceStats.decoded };
      return out;
    });
    ok("配音快取預設上限 24MB", r.defMax === 24 * 1024 * 1024, String(r.defMax));
    ok("上限 3MB 時一批批解碼：總量從沒超過上限、有丟掉舊的", r.small.over === 0 && r.small.bytes <= 3 * 1024 * 1024 && r.small.evicted > 0, JSON.stringify(r.small));
    ok("命中刷新順序：最舊那句再用一次 → 排到最新、之後再解碼也沒被丟", r.hitMovedToEnd && r.hitSurvived, JSON.stringify({ moved: r.hitMovedToEnd, survived: r.hitSurvived }));
    ok("正在播的句子不會被丟（上限壓到 1 byte 只剩它）、照樣播完", r.said && r.busy.files.length === 1 && r.busy.files[0] === r.busy.want && r.playedOk, JSON.stringify({ said: r.said, busy: r.busy, playedOk: r.playedOk }));
    ok("預設上限：連解 170 句，快取 ≤ 24MB、有丟掉舊的", r.big.mb <= 24 && r.big.evicted > r.small.evicted && r.big.n < 170, JSON.stringify(r.big));
    ok("配音快取段沒有 console error", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await browser.close();
  // ===== 4. 沒有聲音的環境：AudioContext 起不來（沒開自動播放）＋音檔全部 404 → 遊戲照走 =====
  {
    const b2 = await launch(["--autoplay-policy=user-gesture-required"]);
    const { ctx, p, errs } = await open(b2, { route: { match: /\/audio\// }, stuck: true });
    await sleep(1500); const st = await D(p);
    await p.evaluate(() => document.querySelector(".mode-card[data-mode=fish]").click());
    await p.waitForFunction(() => !document.getElementById("fish").classList.contains("hidden") && document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });
    await sleep(600);
    let reached = 0;
    for (let i = 0; i < 3; i++) {
      await p.evaluate(() => { const o = window.__zy.curOpts, k = o.findIndex(x => x.ok); document.querySelectorAll("#pond .fishBtn")[k].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch", isPrimary: true })); });
      const okNext = await p.waitForFunction(n => window.__zy.idx === n, i + 1, { timeout: 12000 }).then(() => true, () => false);
      if (!okNext) break; reached = i + 1; await sleep(500);
    }
    const res = await p.evaluate(() => window.__zy.results.slice(0, 3));
    const st2 = await D(p);
    ok("沒聲音（context 一直停著＋音檔全 404）：釣魚連答 3 題照樣換題、都算金星", st.state === "suspended" && reached === 3 && res.every(r => r === "gold"), JSON.stringify({ state: st.state, reached, res }));
    ok("context 停著時音效不排程（不會恢復時一次全部響出來）", st2.liveSfx === 0 && st2.stats.skipped + st2.stats.failed > 0, JSON.stringify({ live: st2.liveSfx, stats: st2.stats }));
    ok("沒聲音環境沒有 console error", errs.length === 0, errs.join(" | "));
    await ctx.close(); await b2.close();
  }
  console.log(out.join("\n")); const f = out.filter(r => r.startsWith("FAIL")).length; console.log(f ? `${f} FAILED / ${out.length}` : `ALL PASS (${out.length})`);
  process.exit(f ? 1 : 0);
})().catch(e => { console.log(out.join("\n")); console.error("FATAL", e.message); process.exit(1); });
