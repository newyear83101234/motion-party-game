// 日夜循環光線（weather.setLight＋js/zhuyin-clock.js）截圖＋驗證：node tools/zy-test/daynight-shots.js [輸出資料夾] [L,P]
// 需要本機伺服器：專案根目錄 python -m http.server 8765
// 直接用遊戲正在用的天氣外掛（?debug 的 window.__zy.weatherFx）：橫 1280×720、直 720×1280 各拍 正中午／黃昏／晚上／清晨，＋黃昏下雨；
// 再把黃昏、清晨各取 6 個時間點拼成一張連續圖（看轉換怪不怪）。
// 並驗：黃昏偏暖、清晨偏粉紫、setLight 晚上＝舊 setNight(true) 的夜景、回白天燈光／海面／太陽位置逐位元還原、
//       遊戲時間逐秒掃一整輪燈光／海面／太陽高度沒有跳變、倍速時鐘實跑段落依序換、晚上不出彩虹、沒有 console error
const path = require("path"), fs = require("fs");
const { launch, openGame } = require("./lib");
const OUT = process.argv[2] || path.join(process.env.TEMP || ".", "zy-daynight");
const ONLY = (process.argv[3] || "L,P").split(",");
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launch(); const lines = []; let fails = 0;
  const ok = (name, cond, info = "") => { if (!cond) fails++; lines.push(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };
  for (const [W, H, tag] of [[1280, 720, "L"], [720, 1280, "P"]]) {
    if (!ONLY.includes(tag)) continue;
    const { ctx, p, errs } = await openGame(browser, { w: W, h: H, stickers: 40, stars: 5, query: "debug&novoice&weather=sunny" });
    const warns = []; p.on("console", m => { if (m.type() === "warning" && /\[hub3d\]|\[weather\]|\[polish\]/.test(m.text())) warns.push(m.text().slice(0, 160)); });
    await p.waitForFunction(() => window.__hub3d && window.__hub3d.ready && window.__zy && window.__zy.weatherFx, null, { timeout: 60000 });
    await sleep(1200);
    await p.evaluate(async () => {
      document.getElementById("guide") && (document.getElementById("guide").style.visibility = "hidden");   // 貓頭鷹對話框先藏起來
      const w = window.__zy.weatherFx; w.__realSetNight = w.setNight; w.__realSetLight = w.setLight; w.setNight = w.setLight = () => {};   // 主程式會定時推 setNight（現在）／setLight（接上時鐘後）：測試期間擋掉，測試自己用 __real*
      window.__clk = await import("./js/zhuyin-clock.js");
      window.__hub3d.use(c => { window.__ctx = c; return {}; });   // 拿 ctx 讀燈光／太陽
      w.__realSetLight({ night: 0, dusk: 0, dawn: 0 }, { instant: true });
    });
    await sleep(600);
    const snap = () => p.evaluate(() => {
      const c = window.__ctx, col = x => [x.r, x.g, x.b];
      return { hemiI: c.hemi.intensity, sky: col(c.hemi.color), ground: col(c.hemi.groundColor), sunI: c.sun.intensity, sunC: col(c.sun.color), shadowI: c.sun.shadow.intensity,
        deep: col(c.sea.uDeep.value), shallow: col(c.sea.uShallow.value), grid: col(c.sea.uGrid.value), sunPos: c.sun.position.toArray(), sunTgt: c.sun.target.position.toArray() };
    });
    const diff = (a, b) => Object.keys(a).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map(k => `${k}: ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])}`);
    const setL = (v, o = { instant: true }) => p.evaluate(([v, o]) => window.__zy.weatherFx.__realSetLight(v, o), [v, o]);
    const preset = name => p.evaluate(n => { const s = window.__clk.sample(window.__clk.PRESETS[n]); return { night: s.night, dusk: s.dusk, dawn: s.dawn, hour: s.hour }; }, name);
    const shot = async (n, ms = 900) => { await sleep(ms); const file = path.join(OUT, `${tag}-${n}.png`); const buf = await p.screenshot({ path: file }); return buf; };
    const base = await snap();
    lines.push(`[${tag}] 原值 hemi ${base.hemiI} sun ${base.sunI} 太陽 ${base.sunPos.map(x => x.toFixed(2))}`);

    // ---- 四個時段（用時鐘的預設點）----
    const shots = {};
    for (const name of ["day", "dusk", "night", "dawn"]) {
      const v = await preset(name); await setL(v); shots[name] = { v, buf: await shot(`1-${name}`), s: await snap(), info: await p.evaluate(() => window.__zy.weatherFx.info()) };
      lines.push(`[${tag}] ${name.padEnd(5)} ${JSON.stringify({ night: +v.night.toFixed(3), dusk: +v.dusk.toFixed(3), dawn: +v.dawn.toFixed(3), hour: +v.hour.toFixed(2) })} → hemi ${shots[name].s.hemiI.toFixed(3)} sky ${shots[name].s.sky.map(x => x.toFixed(3))} sun ${shots[name].s.sunC.map(x => x.toFixed(3))} 太陽高 ${shots[name].s.sunPos[1].toFixed(2)}  draws ${shots[name].info.draws}`);
    }
    const D = shots.dusk.s, N = shots.day.s, A = shots.dawn.s;
    ok(`[${tag}] 黃昏：太陽光偏橘（R 明顯大於 B）`, D.sunC[0] > D.sunC[2] * 2.2, D.sunC.map(x => x.toFixed(3)).join(","));
    ok(`[${tag}] 黃昏：天空光偏暖粉（R > G > B）`, D.sky[0] > D.sky[1] && D.sky[1] > D.sky[2], D.sky.map(x => x.toFixed(3)).join(","));
    ok(`[${tag}] 黃昏：淺海偏暖（R 比白天高、B 比白天低）`, D.shallow[0] > N.shallow[0] && D.shallow[2] < N.shallow[2], `${N.shallow.map(x => x.toFixed(2))} → ${D.shallow.map(x => x.toFixed(2))}`);
    ok(`[${tag}] 黃昏／清晨：太陽變低（影子變長），方向不變`, D.sunPos[1] < N.sunPos[1] - 3 && A.sunPos[1] < N.sunPos[1] - 3 && Math.sign(D.sunPos[0] - D.sunTgt[0]) === Math.sign(N.sunPos[0] - N.sunTgt[0]), `高度 ${N.sunPos[1].toFixed(2)} → 黃昏 ${D.sunPos[1].toFixed(2)}、清晨 ${A.sunPos[1].toFixed(2)}`);
    ok(`[${tag}] 清晨：天空光粉紫（B 最高、R > G）`, A.sky[2] >= A.sky[0] && A.sky[0] > A.sky[1], A.sky.map(x => x.toFixed(3)).join(","));
    ok(`[${tag}] 清晨：太陽光偏粉（R > B > G）`, A.sunC[0] > A.sunC[2] && A.sunC[2] > A.sunC[1], A.sunC.map(x => x.toFixed(3)).join(","));
    ok(`[${tag}] 正中午：跟原值逐位元相同`, diff(base, N).length === 0, diff(base, N).join("｜"));
    // 晚上：setLight({night:1}) ＝ 舊的 setNight(true)
    await setL({ night: 1, dusk: 0, dawn: 0 }); await sleep(300); const nl = await snap();
    await p.evaluate(() => { const w = window.__zy.weatherFx; w.__realSetLight({ night: 0 }, { instant: true }); w.__realSetNight(true, { instant: true }); }); await sleep(300); const ns = await snap();
    ok(`[${tag}] 舊 setNight(true) 之後 getNight()＝true、getLight().night＝1`, await p.evaluate(() => window.__zy.weatherFx.getNight() === true && window.__zy.weatherFx.getLight().night === 1));
    ok(`[${tag}] setLight 晚上＝舊 setNight(true) 的夜景（燈光／海面／太陽完全相同）`, diff(nl, ns).length === 0, diff(nl, ns).join("｜"));
    // 黃昏 → 回白天：燈光、太陽位置逐位元還原
    await setL({ dusk: 1 }); await sleep(300); await setL({ night: 0, dusk: 0, dawn: 0 }); await sleep(400);
    const back = await snap(), d1 = diff(base, back);
    ok(`[${tag}] 黃昏回白天：燈光／海面／太陽位置逐位元還原`, d1.length === 0, d1.join("｜"));
    // 黃昏＋下雨（天氣疊加）
    await p.evaluate(() => window.__zy.setWeather("rain")); await sleep(3200);
    await setL(await preset("dusk")); await shot("2-dusk-rain", 1200); const RD = await snap();
    ok(`[${tag}] 黃昏下雨：還是看得到（hemi ≥ 原值 0.5 倍）、暖色比晴天黃昏淡`, RD.hemiI > base.hemiI * 0.5 && (RD.sky[0] - RD.sky[2]) < (D.sky[0] - D.sky[2]), `hemi ${RD.hemiI.toFixed(3)} sky ${RD.sky.map(x => x.toFixed(3))}`);
    await setL(await preset("night")); await shot("2-night-rain", 1200);
    await p.evaluate(() => window.__zy.setWeather("sunny")); await sleep(5500);
    ok(`[${tag}] 晚上雨停轉晴：不出彩虹`, !(await p.evaluate(() => window.__zy.weatherFx.info().rainbow)));
    await setL({ night: 0, dusk: 0, dawn: 0 }); await sleep(500);
    // ---- 連續圖：黃昏、清晨各 6 個時間點（拼一張）----
    for (const ph of ["dusk", "dawn"]) {
      const bufs = [], labels = [];
      const pts = ph === "dusk" ? [[0.98, "day"], [0, "dusk"], [0.3, "dusk"], [0.55, "dusk"], [0.75, "dusk"], [0.95, "dusk"]] : [[0.98, "night"], [0.15, "dawn"], [0.3, "dawn"], [0.5, "dawn"], [0.75, "dawn"], [0.98, "dawn"]];
      for (const [u, seg] of pts) {
        const v = await p.evaluate(([u, seg]) => { const C = window.__clk, i = C.PHASES.findIndex(x => x[0] === seg); let s0 = 0; for (let k = 0; k < i; k++) s0 += C.PHASES[k][1]; const s = C.sample((s0 + C.PHASES[i][1] * u) / C.CYCLE); return { night: s.night, dusk: s.dusk, dawn: s.dawn, hour: s.hour, phase: s.phase }; }, [u, seg]);
        await setL(v); await sleep(700); bufs.push(await p.screenshot()); labels.push(`${v.phase} ${Math.floor(v.hour)}:${String(Math.round((v.hour % 1) * 60)).padStart(2, "0")}  n${v.night.toFixed(2)} d${v.dusk.toFixed(2)} w${v.dawn.toFixed(2)}`);
      }
      const sp = await ctx.newPage(); const cw = tag === "L" ? 420 : 240;
      await sp.setViewportSize({ width: cw * 3 + 40, height: 400 });
      await sp.setContent(`<body style="margin:0;background:#222;font:14px sans-serif;color:#fff"><div style="display:grid;grid-template-columns:repeat(3,${cw}px);gap:8px;padding:12px">${bufs.map((b, i) => `<div><img style="width:${cw}px;display:block" src="data:image/png;base64,${b.toString("base64")}"><div>${i + 1}. ${labels[i]}</div></div>`).join("")}</div></body>`);
      await sp.waitForTimeout(300); await sp.screenshot({ path: path.join(OUT, `${tag}-3-strip-${ph}.png`), fullPage: true }); await sp.close();
    }
    // ---- 一整輪逐秒掃過（遊戲時間每 1 秒取一次 sample → setLight → 外掛 update）：燈光／海面／太陽高度沒有跳變 ----
    if (tag === "L") {
      await setL({ night: 0, dusk: 0, dawn: 0 }); await sleep(300);
      const sw = await p.evaluate(() => {
        const C = window.__clk, w = window.__zy.weatherFx, c = window.__ctx, names = ["hemiI", "skyR", "skyG", "skyB", "sunR", "sunG", "sunB", "shallowR", "shallowB", "deepR", "sunY"];
        const read = () => [c.hemi.intensity / 1.5, c.hemi.color.r, c.hemi.color.g, c.hemi.color.b, c.sun.color.r, c.sun.color.g, c.sun.color.b, c.sea.uShallow.value.r, c.sea.uShallow.value.b, c.sea.uDeep.value.r, c.sun.position.y / 15];
        let prev = null, maxJ = 0, at = "";
        for (let s = 0; s <= 1800; s++) {
          w.__realSetLight(C.sample(s / 1800), { instant: true }); w.update(performance.now() / 1000, 0);
          const v = read();
          if (prev) for (let k = 0; k < v.length; k++) { const j = Math.abs(v[k] - prev[k]); if (j > maxJ) { maxJ = j; at = `${names[k]} 第 ${s} 秒（${C.sample(s / 1800).phase}）`; } }
          prev = v;
        }
        w.__realSetLight({ night: 0, dusk: 0, dawn: 0 }, { instant: true }); w.update(performance.now() / 1000, 0);
        return { maxJ, at };
      });
      // 最陡的是黃昏一開始：太陽色 63 秒內從白變橘、smoothstep 最陡 1.5 倍 → 每秒約 0.013；真的「跳」會一次 0.1 以上
      ok("[L] 一整輪逐秒掃：每遊戲秒最多變 0.03（沒有跳變）", sw.maxJ < 0.03, `最大 ${sw.maxJ.toFixed(4)} 在 ${sw.at}`);
      // ---- 倍速時鐘真的跑一輪（60 倍：30 秒＝一天），每 0.25 秒 setLight(fade 0.3)：段落依序換 ----
      const rec = await p.evaluate(async () => {
        const C = window.__clk, w = window.__zy.weatherFx, c = window.__ctx, store = new Map();
        const clk = C.createClock({ storage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }, search: "?clockspeed=60" });
        clk.set(0.5);   // 從下午開始：17 分前一點
        const out = [], phases = []; clk.onPhase(ph => phases.push(ph));
        const push = setInterval(() => w.__realSetLight(clk.tick(), { fade: 0.3 }), 250);
        const t0 = performance.now();
        await new Promise(r => { const iv = setInterval(() => { out.push([c.hemi.intensity, c.hemi.color.r, c.hemi.color.g, c.hemi.color.b, c.sun.color.r, c.sun.color.b, c.sea.uShallow.value.r, c.sun.position.y]); if (performance.now() - t0 > 31000) { clearInterval(iv); r(); } }, 100); });
        clearInterval(push);
        let maxJ = 0, at = 0; for (let i = 1; i < out.length; i++) for (let k = 0; k < out[i].length; k++) { const s = k === 0 ? 1 / 1.5 : k === 7 ? 1 / 15 : 1; const j = Math.abs(out[i][k] - out[i - 1][k]) * s; if (j > maxJ) { maxJ = j; at = i; } }
        return { n: out.length, maxJ, at, phases, lastHemi: out[out.length - 1][0] };
      });
      ok("[L] 倍速 30 秒跑完一輪：依序經過黃昏→晚上→清晨→白天", rec.phases.join(",") === "dusk,night,dawn,day", rec.phases.join(","));
      lines.push(`[L] 倍速實跑：取樣 ${rec.n} 筆（headless 慢，約 0.2 秒一筆），相鄰兩筆最大變化 ${(rec.maxJ * 100).toFixed(1)}%（60 倍速下黃昏 1 秒就變完，僅供參考）`);
      await setL({ night: 0, dusk: 0, dawn: 0 }); await sleep(400);
      const d2 = diff(base, await snap());
      ok("[L] 跑完一輪回白天：逐位元還原", d2.length === 0, d2.join("｜"));
    }
    ok(`[${tag}] 沒有 console error`, errs.length === 0, errs.join(" / ").slice(0, 300));
    ok(`[${tag}] 沒有 [hub3d]／[weather]／[polish] 警告`, warns.length === 0, warns.join(" / ").slice(0, 300));
    await ctx.close();
  }
  await browser.close();
  console.log(lines.join("\n")); console.log(`\n截圖：${OUT}`); console.log(fails ? `${fails} 項 FAIL` : "全部 PASS");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
