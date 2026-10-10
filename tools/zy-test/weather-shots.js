// 天氣外掛（js/zhuyin-weather.js）截圖＋驗證：node tools/zy-test/weather-shots.js [輸出資料夾] [L,P]
// 需要本機伺服器：專案根目錄 python -m http.server 8765
// 橫 1180×820（L）與直 820×1180（P）各拍：五種天氣（整島＋拉近一棟）、晴→雨轉換中間一格、雷雨閃電、雨後彩虹
// 夜晚（setNight）：白天→夜轉換中間一格、晴夜／雨夜／颱風夜（整島＋新市區），檔名 night-*.jpg；夜裡不出彩虹、多出的 draw call ≤ 3、
//       setNight(false) 與 dispose 後數值逐位元還原
// 並驗：每種天氣 5 秒的畫格數與 draw calls、set 回 sunny 後與 dispose 後燈光／海面數值跟一開始完全相同、
//       dispose 後場景物件數／stage 疊層／樹材質都還原、沒有 console error
const path = require("path"), fs = require("fs");
const { launch, openGame } = require("./lib");
const OUT = process.argv[2] || path.join(process.env.TEMP || ".", "zy-weather");
const ONLY = (process.argv[3] || "L,P").split(",");
const KINDS = ["sunny", "cloudy", "rain", "storm", "typhoon"];
const ZOOM_ON = "order";                                   // 拉近哪一棟（點餐，島中間）
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launch(); const lines = []; let fails = 0;
  const ok = (name, cond, info = "") => { if (!cond) fails++; lines.push(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };
  for (const [W, H, tag] of [[1180, 820, "L"], [820, 1180, "P"]]) {
    if (!ONLY.includes(tag)) continue;
    // zhuyin.js 自己也會掛一份天氣（隨機、每幾分鐘換、依時鐘變夜晚）：?weather=sunny&night=0 把它固定在白天晴天（也關掉它的換天氣計時器）
    const { ctx, p, errs } = await openGame(browser, { w: W, h: H, stickers: 40, stars: 5, query: "debug&weather=sunny&night=0" });
    await p.waitForFunction(() => window.__hub3d && window.__hub3d.ready, null, { timeout: 30000 });
    await p.waitForFunction(() => !window.__zy || window.__zy.weather, null, { timeout: 10000 }).catch(() => {});
    await sleep(1500);
    await p.evaluate(() => { const g = document.getElementById("guide"); if (g) g.style.visibility = "hidden"; });   // 貓頭鷹對話框先藏起來
    const shot = n => p.screenshot({ path: path.join(OUT, `${tag}-${n}.jpg`), type: "jpeg", quality: 84 });
    const nshot = n => p.screenshot({ path: path.join(OUT, `night-${tag}-${n}.jpg`), type: "jpeg", quality: 84 });
    const town = async n => { if (!(await p.evaluate(() => typeof window.__hub3d.goPlace === "function"))) return; await p.evaluate(() => window.__hub3d.goPlace("town")); await sleep(2600); await nshot(n); await p.evaluate(() => window.__hub3d.goPlace("main")); await sleep(2600); };
    const focus = (m, z) => p.evaluate(([m, z]) => window.__hub3d.focus(m, z), [m, z]);
    // 偷拿 ctx（空外掛）→ 讀燈光／海面原值
    await p.evaluate(() => window.__hub3d.use(c => { window.__ctx = c; c.scene.traverse(o => { if (o.userData.zyWeather) o.visible = false; }); return {}; }));   // 主程式那份（晴天）的雲藏起來，只看測試這份
    const snap = () => p.evaluate(() => {
      const c = window.__ctx, col = x => [x.r, x.g, x.b], inst = [];
      let mine = 0; c.scene.traverse(o => { if (o.isInstancedMesh && !o.userData.zyWeather) inst.push(o.uuid + ":" + o.material.uuid); if (o.userData.zyWeather) mine++; });
      return { light: { hemiI: c.hemi.intensity, hemiSky: col(c.hemi.color), hemiGround: col(c.hemi.groundColor), sunI: c.sun.intensity, sunC: col(c.sun.color), shadowI: c.sun.shadow.intensity,
        deep: col(c.sea.uDeep.value), shallow: col(c.sea.uShallow.value), grid: col(c.sea.uGrid.value) },
        scene: { weatherObjs: mine, weatherDom: c.stage.querySelectorAll("[data-zy-weather]").length, stageKids: c.stage.children.length, treeMats: inst.sort().join(",") } };
    });
    const diff = (a, b) => Object.keys(a).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map(k => `${k}: ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])}`);
    // 5 秒內每 0.25 秒取一次 draw calls（有些格會含陰影貼圖重畫，所以列最少／中位／最多）
    const perf = async () => {
      const f0 = await p.evaluate(() => window.__hub3d.frames), calls = [];
      for (let i = 0; i < 20; i++) { await sleep(250); calls.push(await p.evaluate(() => window.__hub3d.stats().calls)); }
      const f1 = await p.evaluate(() => window.__hub3d.frames), st = await p.evaluate(() => window.__hub3d.stats());
      calls.sort((a, b) => a - b);
      return { frames5s: f1 - f0, calls: `${calls[0]}/${calls[10]}/${calls[19]}`, tris: st.triangles, dpr: st.pixelRatio };
    };
    const base = await snap();
    lines.push(`[${tag}] 原值 hemi ${base.light.hemiI} sun ${base.light.sunI} shadow ${base.light.shadowI}`);
    { const pf = await perf(); lines.push(`[${tag}] 無外掛  5秒畫格 ${pf.frames5s}  draw calls(最少/中位/最多) ${pf.calls}  三角形 ${pf.tris}`); }
    await shot("0-before");

    // 掛上天氣外掛（從晴天開始）
    await p.evaluate(async () => { const m = await import("./js/zhuyin-weather.js"); window.__wm = m; window.__w = window.__hub3d.use(c => m.weatherPlugin(c, { kind: "sunny" })); });
    ok(`[${tag}] 外掛掛上`, await p.evaluate(() => !!(window.__w && window.__w.set && window.__w.get() === "sunny")));
    const prog0 = await p.evaluate(() => window.__ctx.renderer.info.programs.length);   // 預先編譯：之後換天氣不該再多 shader（小島自己長新東西也會多，所以只列出來）
    // pickWeather 分布（2 萬次）
    if (tag === "L") {
      const dist = await p.evaluate(() => { const n = {}; for (let i = 0; i < 20000; i++) { const k = window.__wm.pickWeather(); n[k] = (n[k] || 0) + 1; } return n; });
      const pct = k => Math.round((dist[k] || 0) / 200);
      ok("pickWeather 加權（晴40 陰25 雨18 雷雨10 颱風7，±2%）", Math.abs(pct("sunny") - 40) <= 2 && Math.abs(pct("cloudy") - 25) <= 2 && Math.abs(pct("rain") - 18) <= 2 && Math.abs(pct("storm") - 10) <= 2 && Math.abs(pct("typhoon") - 7) <= 2,
        KINDS.map(k => k + " " + pct(k) + "%").join("、"));
      ok("WEATHERS 五種都有中文名＋emoji", await p.evaluate(() => ["sunny", "cloudy", "rain", "storm", "typhoon"].every(k => window.__wm.WEATHERS[k] && window.__wm.WEATHERS[k].name && window.__wm.WEATHERS[k].emoji)));
      // 聲音：OfflineAudioContext 算出每種天氣第 3–4 秒的音量（RMS／峰值）、遠雷、音量 0；再用真的 AudioContext 開關一次
      const au = await p.evaluate(async () => {
        const m = window.__wm, SR = 22050, out = {};
        const lv = (buf, t0, t1) => { const d = buf.getChannelData(0); let s = 0, n = 0, pk = 0; for (let i = Math.floor(t0 * SR); i < Math.floor(t1 * SR); i++) { s += d[i] * d[i]; n++; pk = Math.max(pk, Math.abs(d[i])); } return { rms: +Math.sqrt(s / n).toFixed(4), peak: +pk.toFixed(3) }; };
        const render = async (fn, t0, t1) => { const ac = new OfflineAudioContext(1, SR * 4, SR), snd = m.createWeatherSound(); snd._linked = true; snd.start(ac); snd.setVolume(1); fn(snd); const buf = await ac.startRendering(); snd.stop(); return lv(buf, t0, t1); };
        for (const k of ["sunny", "cloudy", "rain", "storm", "typhoon"]) out[k] = await render(s => s.setKind(k), 3, 4);
        out.thunder = await render(s => { s.setKind("sunny"); s.thunder(0.5, 1); }, 0.5, 2.0);
        out.typhoonVol0 = await render(s => { s.setKind("typhoon"); s.setVolume(0); }, 3, 4);
        out.thunderDuck = await render(s => { s.setKind("sunny"); s.setDuck(() => true); s.thunder(0.5, 1); }, 0.5, 2.0);
        out.defaultVol = await (async () => { const ac = new OfflineAudioContext(1, SR * 4, SR), snd = m.createWeatherSound(); snd.start(ac); snd.setKind("typhoon"); const buf = await ac.startRendering(); snd.stop(); return lv(buf, 3, 4); })();
        let live = "ok"; try { const snd = m.createWeatherSound(); snd.start(null); snd.setKind("storm"); snd.thunder(0, 0.5); snd.setVolume(0.5); snd.stop(); snd.stop(); } catch (e) { live = String(e); }
        out.live = live; return out;
      });
      lines.push("[聲音] " + ["sunny", "cloudy", "rain", "storm", "typhoon"].map(k => `${k} rms ${au[k].rms}/峰 ${au[k].peak}`).join("｜") + `｜遠雷 rms ${au.thunder.rms}/峰 ${au.thunder.peak}｜颱風音量0 rms ${au.typhoonVol0.rms}`);
      ok("聲音：晴、陰天無聲", au.sunny.rms < 0.001 && au.cloudy.rms < 0.001, `${au.sunny.rms} ${au.cloudy.rms}`);
      ok("聲音：雨 < 雷雨 < 颱風（越來越大聲）", au.rain.rms > 0.005 && au.storm.rms > au.rain.rms && au.typhoon.rms > au.storm.rms, `${au.rain.rms} ${au.storm.rms} ${au.typhoon.rms}`);
      ok("聲音：音量小（峰值 < 0.4）", Math.max(au.rain.peak, au.storm.peak, au.typhoon.peak, au.thunder.peak) < 0.4, `${au.typhoon.peak} ${au.thunder.peak}`);
      ok("聲音：遠雷有聲音、setVolume(0) 靜音", au.thunder.rms > 0.005 && au.typhoonVol0.rms < 0.002, `${au.thunder.rms} ${au.typhoonVol0.rms}`);
      ok("聲音：真的 AudioContext start(null)／stop 不出錯", au.live === "ok", au.live);
      ok("聲音：預設音量 0（沒 setVolume 前不出聲）", au.defaultVol.rms < 0.001, String(au.defaultVol.rms));
      ok("聲音：setDuck 回 true 時雷聲約減半", au.thunderDuck.rms > 0.003 && au.thunderDuck.rms < au.thunder.rms * 0.65, `${au.thunderDuck.rms} vs ${au.thunder.rms}`);
    }

    for (const k of KINDS) {
      if (k === "rain") {   // 晴→雨：轉換中間截一格
        await p.evaluate(() => window.__w.set("rain")); await sleep(1250);
        const mid = await snap(); await shot("mid-sunny-to-rain");
        const hiR = base.light.hemiI, loR = base.light.hemiI * (await p.evaluate(() => window.__wm.WEATHERS.rain.hemiK)), q = (hiR - mid.light.hemiI) / (hiR - loR);
        ok(`[${tag}] 轉換中間是中間值（hemi 在晴與雨之間 10%–90%）`, q > 0.1 && q < 0.9, `hemi ${mid.light.hemiI.toFixed(3)}（進度 ${(q * 100).toFixed(0)}%）`);
        await sleep(1800);
      } else { await p.evaluate(k => window.__w.set(k), k); await sleep(3000); }
      const pf = await perf(), info = await p.evaluate(() => window.__w.info());
      lines.push(`[${tag}] ${k.padEnd(7)} 5秒畫格 ${pf.frames5s}  draw calls(最少/中位/最多) ${pf.calls}  三角形 ${pf.tris}  dpr ${pf.dpr}  ${JSON.stringify(info)}`);
      await shot(`${KINDS.indexOf(k) + 1}-${k}`);
      await focus(ZOOM_ON, 1.7); await sleep(900); await shot(`${KINDS.indexOf(k) + 1}-${k}-zoom`); await focus(null); await sleep(500);
      if (k === "storm") { await p.evaluate(() => window.__w.flash(1, 1.5)); await sleep(500); await shot("3b-storm-flash"); await sleep(2200);   // 閃電亮著停 1.5 秒才拍得到
        ok(`[${tag}] 閃電結束後燈光回到雷雨值`, await p.evaluate(h0 => Math.abs(window.__ctx.hemi.intensity - h0 * window.__wm.WEATHERS.storm.hemiK) < 1e-9, base.light.hemiI), String(await p.evaluate(() => window.__ctx.hemi.intensity))); }
      if ((k === "rain" || k === "typhoon") && await p.evaluate(() => typeof window.__hub3d.goPlace === "function")) {   // 飛去新市區看一眼
        await p.evaluate(() => window.__hub3d.goPlace("town")); await sleep(2600); await shot(`${KINDS.indexOf(k) + 1}-${k}-town`);
        await p.evaluate(() => window.__hub3d.goPlace("main")); await sleep(2600);
      }
      if (k === "typhoon") { await p.evaluate(() => window.__w.set("storm", { instant: true })); await p.evaluate(() => window.__w.set("typhoon", { instant: true })); await sleep(400); }
    }
    lines.push(`[${tag}] shader 程式數：掛上時 ${prog0} → 五種天氣＋閃電後 ${await p.evaluate(() => window.__ctx.renderer.info.programs.length)}`);
    // 颱風 → 晴：自動彩虹
    await p.evaluate(() => window.__w.set("sunny")); await sleep(1300); await shot("mid-typhoon-to-sunny");
    await sleep(4200);
    ok(`[${tag}] 颱風轉晴自動出彩虹`, await p.evaluate(() => window.__w.info().rainbow));
    await shot("6-rainbow");
    await focus("fish", 1.5); await sleep(900); await shot("6-rainbow-zoom"); await focus(null); await sleep(400);
    // set 回 sunny 之後：燈光／海面跟一開始完全相同
    const sunnyBack = await snap(), d1 = diff(base.light, sunnyBack.light);
    ok(`[${tag}] set 回晴天後燈光／海面完全還原`, d1.length === 0, d1.join("｜"));
    // 手動彩虹
    await p.evaluate(() => window.__w.rainbow()); ok(`[${tag}] rainbow() 手動叫得出來`, await p.evaluate(() => window.__w.info().rainbow));
    // dispose：全部還原
    await p.evaluate(() => window.__w.set("typhoon", { instant: true })); await sleep(4600);
    ok(`[${tag}] 又變颱風：彩虹 4 秒內淡掉`, !(await p.evaluate(() => window.__w.info().rainbow)));
    await p.evaluate(() => window.__w.set("sunny", { instant: true })); await sleep(300);
    await p.evaluate(() => window.__w.dispose()); await sleep(600);
    const after = await snap(), d2 = diff(base.light, after.light), d3 = diff(base.scene, after.scene);
    ok(`[${tag}] dispose 後燈光／海面完全還原`, d2.length === 0, d2.join("｜"));
    ok(`[${tag}] dispose 後場景物件數、stage 疊層、樹材質都還原`, d3.length === 0, d3.join("｜") || JSON.stringify(after.scene).slice(0, 120));
    const fA = await p.evaluate(() => window.__hub3d.frames); await sleep(600); const fB = await p.evaluate(() => window.__hub3d.frames);
    ok(`[${tag}] dispose 後主迴圈照常在跑`, fB > fA, `${fA}→${fB}`);
    lines.push(`[${tag}] 還原比對：晴天回復 ${d1.length ? "有差異" : "完全相同"}；dispose 後 ${d2.length || d3.length ? "有差異" : "完全相同"}（hemi ${after.light.hemiI}、sun ${after.light.sunI}、shadow ${after.light.shadowI}、殘留天氣物件 ${after.scene.weatherObjs}、殘留疊層 ${after.scene.weatherDom}、stage 子元素 ${after.scene.stageKids}）`);
    await shot("7-after-dispose");

    // ===== 夜晚小島（新的一份外掛，從白天晴天開始）=====
    await p.evaluate(() => { window.__w = window.__hub3d.use(c => window.__wm.weatherPlugin(c, { kind: "sunny" })); }); await sleep(900);
    const dayDraws = (await p.evaluate(() => window.__w.info())).draws;
    await p.evaluate(() => window.__w.setNight(true)); await sleep(1250);
    const nmid = await snap(); await nshot("0-mid-day-to-night");
    const qn = (base.light.hemiI - nmid.light.hemiI) / (base.light.hemiI * (1 - 0.42));
    ok(`[${tag}] 夜：轉換中間是中間值（10%–90%）`, qn > 0.1 && qn < 0.9, `hemi ${nmid.light.hemiI.toFixed(3)}（進度 ${(qn * 100).toFixed(0)}%）`);
    await sleep(2200);
    const ni = await p.evaluate(() => window.__w.info());
    ok(`[${tag}] 夜：多出來的 draw call ≤ 3`, ni.draws - dayDraws <= 3, `白天晴 ${dayDraws} → 晴夜 ${ni.draws}`);
    const npf = await perf(); lines.push(`[${tag}] 晴夜   5秒畫格 ${npf.frames5s}  draw calls(最少/中位/最多) ${npf.calls}  外掛自己 ${ni.draws}`);
    await nshot("1-sunny"); await p.evaluate(() => window.__hub3d.focus("park", 2.2)); await sleep(900); await nshot("1-sunny-park"); await p.evaluate(() => window.__hub3d.focus(null)); await sleep(500);
    await town("1-sunny-town");
    await p.evaluate(() => window.__w.set("rain")); await sleep(3000);
    ok(`[${tag}] 夜：換天氣後夜晚狀態保持`, await p.evaluate(() => window.__w.getNight() === true && window.__w.info().night === 1));
    await nshot("2-rain"); await town("2-rain-town");
    await p.evaluate(() => window.__w.set("typhoon")); await sleep(3000);
    { const pf = await perf(), inf = await p.evaluate(() => window.__w.info()); lines.push(`[${tag}] 颱風夜 5秒畫格 ${pf.frames5s}  draw calls(最少/中位/最多) ${pf.calls}  外掛自己 ${inf.draws}`); }
    await nshot("3-typhoon"); await town("3-typhoon-town");
    await p.evaluate(() => window.__w.set("sunny")); await sleep(5500);
    await p.evaluate(() => window.__w.rainbow());
    ok(`[${tag}] 夜：颱風轉晴、手動 rainbow() 都不出彩虹`, !(await p.evaluate(() => window.__w.info().rainbow)));
    await p.evaluate(() => window.__w.setNight(false)); await sleep(3200);
    const dayBack = await snap(), d4 = diff(base.light, dayBack.light);
    ok(`[${tag}] setNight(false) 後燈光／海面逐位元還原`, d4.length === 0, d4.join("｜"));
    await p.evaluate(() => { window.__w.set("rain", { instant: true }); window.__w.setNight(true, { instant: true }); }); await sleep(500);
    await p.evaluate(() => window.__w.dispose()); await sleep(600);
    const after2 = await snap(), d5 = diff(base.light, after2.light), d6 = diff(base.scene, after2.scene);
    ok(`[${tag}] 雨夜直接 dispose：燈光／海面逐位元還原、物件／疊層／樹材質都收乾淨`, d5.length === 0 && d6.length === 0, [...d5, ...d6].join("｜"));
    ok(`[${tag}] 沒有 console error`, errs.length === 0, errs.join(" / ").slice(0, 300));
    await ctx.close();
  }
  await browser.close();
  console.log(lines.join("\n")); console.log(`\n截圖：${OUT}`); console.log(fails ? `${fails} 項 FAIL` : "全部 PASS");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
