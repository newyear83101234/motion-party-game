// 海洋外掛（js/zhuyin-ocean.js）截圖＋驗證：node tools/zy-test/ocean-shots.js [輸出資料夾] [L,P]
// 需要本機伺服器：專案根目錄 python -m http.server 8765
// 橫 1280×720（L）與直 720×1280（P）各拍：晴天（連拍 3 張、間隔 0.5 秒）、下雨、颱風、晚上、黃昏、新市區、跳魚（＋魚附近放大；L 另拍釣魚碼頭拉近）
// 驗：掛得上、info() 有魚和海鷗、東西真的在動（魚／海鷗／浪的時鐘 0.5 秒前後不同）、jump() 有效（有魚在空中、有水花）、
//     下雨海鷗 ≤ 1、颱風／晚上海鷗飛走、晚上魚變少、浪花線 晴 < 雨 < 颱風、跳魚不再多編 shader、
//     掛外掛前後 5 秒畫格數＋開關交錯量、dispose 後場景物件數回到原本、沒有 console error／pageerror
// 頁面若已經由 zhuyin.js 掛了一份（window.__zy.oceanFx），測試會先把它 dispose，只看測試這份
const path = require("path"), fs = require("fs");
const { launch, openGame } = require("./lib");
const OUT = process.argv[2] || path.join(process.env.TEMP || ".", "zy-ocean");
const ONLY = (process.argv[3] || "L,P").split(",");
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launch(); const lines = []; let fails = 0;
  const ok = (name, cond, info = "") => { if (!cond) fails++; lines.push(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`); };
  for (const [W, H, tag] of [[1280, 720, "L"], [720, 1280, "P"]]) {
    if (!ONLY.includes(tag)) continue;
    const { ctx, p, errs } = await openGame(browser, { w: W, h: H, stickers: 40, stars: 5, query: "debug&novoice&night=0&weather=sunny" });
    await p.waitForFunction(() => window.__hub3d && window.__hub3d.ready, null, { timeout: 60000 });
    await sleep(1500);
    await p.evaluate(() => { const g = document.getElementById("guide"); if (g) g.style.visibility = "hidden"; window.__hub3d.events(false); });   // 貓頭鷹對話框藏起來、關掉隨機火災／生病（場景物件數才穩）
    const shot = n => p.screenshot({ path: path.join(OUT, `${tag}-${n}.png`) });
    await p.evaluate(() => window.__hub3d.use(c => { window.__ctx = c; return {}; }));   // 偷拿 ctx：數場景物件
    const count = () => p.evaluate(() => { let n = 0, mine = 0; window.__ctx.scene.traverse(o => { n++; if (o.userData.zyOcean) mine++; }); return { n, mine, geos: window.__ctx.renderer.info.memory.geometries }; });
    const frames5 = async () => { const f0 = await p.evaluate(() => window.__hub3d.frames); await sleep(5000); return (await p.evaluate(() => window.__hub3d.frames)) - f0; };
    const info = () => p.evaluate(() => window.__ocean.info());
    const setEnv = e => p.evaluate(e => { window.__oceanEnv = e; }, e);
    // 小島本身的天氣、光線也一起換（截圖才像）：有日夜時鐘（zhuyin.js 每秒推一次光線）就設時鐘，沒有就用舊的 setNight
    const wx = (kind, light) => p.evaluate(([k, l]) => { const z = window.__zy, w = z && z.weatherFx; if (!w) return; try { w.set(k, { instant: true }); if (z.clock && z.clock.set) { z.clock.set(l); if (w.setLight) w.setLight(z.clock.get(), { fade: 0 }); } else w.setNight(l === "night", { instant: true }); } catch (e) {} }, [kind, light]);
    // 主程式自己若已經掛了一份海洋外掛：先收掉，只看測試這份（不然魚、海鷗會有兩倍）
    lines.push(`[${tag}] 頁面原本的海洋外掛：${await p.evaluate(() => { const o = window.__zy && window.__zy.oceanFx; if (o && o.dispose) { o.dispose(); return "有，已先 dispose"; } return "沒有"; })}`);
    await sleep(300);
    const c0 = await count();
    const fBase = await frames5();
    // 掛上
    await p.evaluate(async () => { const m = await import("./js/zhuyin-ocean.js"); window.__ocean = window.__hub3d.use(c => m.oceanPlugin(c, { env: () => window.__oceanEnv || { night: 0, dusk: 0, kind: "sunny" } })); });
    ok(`[${tag}] 外掛掛上`, await p.evaluate(() => !!(window.__ocean && window.__ocean.update && window.__ocean.jump)));
    const prog0 = await p.evaluate(() => window.__ctx.renderer.info.programs.length);
    await sleep(1500);
    let i0 = await info();
    ok(`[${tag}] 有魚`, i0.fish >= 20, `fish ${i0.fish}、群 ${i0.schools}`);
    ok(`[${tag}] 有海鷗（晴天 1–3 隻）`, i0.gulls >= 1 && i0.gulls <= 3, `gulls ${i0.gulls}`);
    ok(`[${tag}] 有浪花短線、岸邊浪`, i0.streaks > 100 && i0.shoreTris > 500, `streaks ${i0.streaks}、岸邊三角形 ${i0.shoreTris}、draws ${i0.draws}`);
    const fOcean = await frames5();
    lines.push(`[${tag}] 5 秒畫格：掛前 ${fBase} → 掛後 ${fOcean}（${fBase ? Math.round((fOcean - fBase) / fBase * 100) : 0}%）`);
    // 晴天：連拍 3 張（間隔 0.5 秒）＋確認在動
    const pr = [];
    for (let k = 0; k < 3; k++) { if (k) await sleep(500); await shot(`sunny-${k}`); pr.push((await info()).probe); }
    const moved = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
    ok(`[${tag}] 魚在游`, moved(pr[0].fish, pr[1].fish) && moved(pr[1].fish, pr[2].fish), `${JSON.stringify(pr[0].fish)} → ${JSON.stringify(pr[2].fish)}`);
    ok(`[${tag}] 浪在動（時鐘）`, pr[0].clock !== pr[2].clock && pr[0].wave !== pr[2].wave);
    ok(`[${tag}] 海鷗在飛`, !pr[0].gull || !pr[2].gull || moved(pr[0].gull, pr[2].gull), `${JSON.stringify(pr[0].gull)} → ${JSON.stringify(pr[2].gull)}`);
    // 跳魚：jump() 後每 0.1 秒看一次，魚在空中時拍一張＋魚附近放大一張；之後等水花
    const j = await p.evaluate(() => window.__ocean.jump());
    let air = null, maxSplash = 0, maxJump = 0;
    for (let k = 0; k < 30; k++) {
      const q = await info(); maxSplash = Math.max(maxSplash, q.splashes); maxJump = Math.max(maxJump, q.jumping);
      if (!air && q.probe.jumper && q.probe.jumper[1] > -0.75) {   // 已經離水一段
        air = await p.evaluate(([x, y, z]) => { const c = window.__ctx, v = new c.THREE.Vector3(x, y, z).project(c.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; }, q.probe.jumper);
        await shot("jump");
        const cx = Math.max(0, Math.min(W - 240, Math.round(air.x - 120))), cy = Math.max(0, Math.min(H - 160, Math.round(air.y - 80)));
        await p.screenshot({ path: path.join(OUT, `${tag}-jump-zoom.png`), clip: { x: cx, y: cy, width: 240, height: 160 } });
      }
      if (air && q.jumping === 0 && q.splashes === 0) break;
      await sleep(100);
    }
    ok(`[${tag}] jump() 有魚跳起來`, j && maxJump >= 1 && !!air, `jump()=${j}、魚在畫面 ${air ? Math.round(air.x) + "," + Math.round(air.y) : "沒拍到"}`);
    ok(`[${tag}] 跳魚有水花`, maxSplash >= 1, `同時最多 ${maxSplash} 個水花`);
    if (tag === "L") {   // 拉近釣魚碼頭看魚的樣子
      await p.evaluate(() => window.__hub3d.focus("fish", 1.6)); await sleep(1500);
      await shot("zoom-fish");
      await p.evaluate(() => window.__hub3d.focus(null)); await sleep(1200);
    }
    const until = async (cond, ms = 12000) => { const t0 = Date.now(); let q; do { q = await info(); if (cond(q)) return q; await sleep(250); } while (Date.now() - t0 < ms); return q; };
    // 預先編譯：跳魚（水花第一次出現）不該再多 shader（小島自己長新東西也會多，所以只列出來）
    const progs = await p.evaluate(() => window.__ctx.renderer.info.programs.length);
    lines.push(`[${tag}] shader 程式數：剛掛上 ${prog0} → 跳魚、水花之後 ${progs}`);
    // 下雨：介於中間（海鷗最多 1 隻、浪花線比晴天多比颱風少）
    await wx("rain", "day"); await setEnv({ night: 0, dusk: 0, kind: "rain" });
    const ir = await until(q => q.env.storm > 0.45 && q.gulls <= 1);
    ok(`[${tag}] 下雨：海鷗最多 1 隻、浪花線變多`, ir.gullMax === 1 && ir.gulls <= 1 && ir.streaks > i0.streaks, `gulls ${ir.gulls}、streaks ${i0.streaks} → ${ir.streaks}`);
    await shot("rain");
    // 颱風：海鷗飛走、浪花線變多（headless 很慢、dt 被夾在 0.1 秒 → 轉換要等久一點）
    await wx("typhoon", "day"); await setEnv({ night: 0, dusk: 0, kind: "typhoon" });
    const it = await until(q => q.gulls === 0 && q.env.storm > 0.9);
    ok(`[${tag}] 颱風沒有海鷗`, it.gulls === 0 && it.gullMax === 0, `gulls ${it.gulls}`);
    ok(`[${tag}] 颱風浪花線比下雨還多`, it.streaks > ir.streaks, `${i0.streaks} → 雨 ${ir.streaks} → 颱風 ${it.streaks}`);
    await shot("typhoon");
    // 晚上（晴）
    await wx("sunny", "night"); await setEnv({ night: 1, dusk: 0, kind: "sunny" });
    const iN = await until(q => q.gulls === 0 && q.fish < i0.fish && q.env.night > 0.9 && q.env.storm < 0.1);
    ok(`[${tag}] 晚上沒有海鷗、魚變少`, iN.gulls === 0 && iN.fish < i0.fish, `gulls ${iN.gulls} fish ${i0.fish} → ${iN.fish}`);
    await shot("night");
    // 黃昏（晴）
    await wx("sunny", "dusk"); await setEnv({ night: 0, dusk: 1, kind: "sunny" });
    await until(q => q.env.dusk > 0.9 && q.env.night < 0.1);
    await shot("dusk");
    lines.push(`[${tag}] shader 程式數：換過雨／颱風／夜／黃昏之後 ${await p.evaluate(() => window.__ctx.renderer.info.programs.length)}（含天氣外掛與小島自己的）`);
    // 外掛畫面開／關交錯量 3 輪（抵銷機器忙碌的雜訊）
    { const fr = async ms => { const a = await p.evaluate(() => window.__hub3d.frames); await sleep(ms); return (await p.evaluate(() => window.__hub3d.frames)) - a; };
      const vis = on => p.evaluate(on => window.__ctx.scene.traverse(o => { if (o.userData.zyOcean) o.layers.set(on ? 0 : 5); }), on);
      await setEnv({ night: 0, dusk: 0, kind: "sunny" }); let on = 0, off = 0;
      for (let r = 0; r < 3; r++) { await vis(false); await sleep(200); off += await fr(3000); await vis(true); await sleep(200); on += await fr(3000); }
      lines.push(`[${tag}] 交錯量 9 秒畫格：外掛畫面關 ${off} → 開 ${on}（${off ? Math.round((on - off) / off * 100) : 0}%；headless 軟體算圖，只當相對參考）`); }
    // 新市區（白天晴天）
    await wx("sunny", "day"); await setEnv({ night: 0, dusk: 0, kind: "sunny" }); await p.evaluate(() => window.__hub3d.goPlace("town")); await sleep(3500);
    await shot("town");
    await p.evaluate(() => window.__hub3d.goPlace("main")); await sleep(2500);
    // dispose
    const cMid = await count();
    await p.evaluate(() => window.__ocean.dispose());
    await sleep(500);
    const c1 = await count();
    ok(`[${tag}] dispose 後場景物件數回到原本`, c1.n === c0.n && c1.mine === 0, `掛前 ${c0.n} → 掛著 ${cMid.n}（自己的 ${cMid.mine}）→ dispose 後 ${c1.n}`);
    ok(`[${tag}] dispose 後 GPU 幾何少了外掛自己的 6 個`, cMid.geos - c1.geos >= 6, `掛前 ${c0.geos}（小島自己也會陸續長東西）→ dispose 前 ${cMid.geos} → 後 ${c1.geos}`);
    ok(`[${tag}] dispose 後 update 不會出錯`, await p.evaluate(() => { try { window.__ocean.update(1, 0.03); return true; } catch (e) { return false; } }));
    ok(`[${tag}] 沒有 console error／pageerror`, errs.length === 0, errs.slice(0, 3).join(" | "));
    await ctx.close();
  }
  console.log(lines.join("\n"));
  console.log(fails ? `${fails} FAILED` : "ALL PASS", "  截圖：" + OUT);
  await browser.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
