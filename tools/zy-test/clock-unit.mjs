// 日夜時鐘（js/zhuyin-clock.js）純邏輯單元測試：node tools/zy-test/clock-unit.mjs
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
const C = await import(pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../js/zhuyin-clock.js")).href);
const out = []; const ok = (n, c, i = "") => out.push(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  — " + i : ""}`);
const mem = (init = {}) => { const m = new Map(Object.entries(init)); let writes = 0; return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => { writes++; m.set(k, String(v)); }, get writes() { return writes; }, raw: k => m.get(k) }; };
const fakeTime = (t0 = 1_700_000_000_000) => { let t = t0; const f = () => t; f.add = ms => { t += ms; }; return f; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// ---------- 一輪 30 分鐘、四段時長 ----------
{
  ok("CYCLE＝1800 秒（30 分鐘）", C.CYCLE === 1800);
  const total = C.PHASES.reduce((s, [, d]) => s + d, 0);
  ok("四段加起來＝30 分鐘", total === 1800, String(total));
  const now = fakeTime(), st = mem(), clk = C.createClock({ now, storage: st, visible: () => true, search: "" });
  const sec = { day: 0, dusk: 0, night: 0, dawn: 0 }, seen = [];
  clk.onPhase((ph, prev) => seen.push(prev + "→" + ph));
  clk.tick();
  for (let i = 0; i < 1800; i++) { now.add(1000); const s = clk.tick(); sec[s.phase]++; }
  ok("實際跑 1800 秒：白天 17 分、黃昏 3 分、晚上 7 分、清晨 3 分", sec.day === 1020 && sec.dusk === 180 && sec.night === 420 && sec.dawn === 180, JSON.stringify(sec));
  ok("跑滿 30 分鐘回到原點（白天剛開始）", near(clk.seconds(), 0, 1e-6) || near(clk.seconds(), 1800, 1e-6), String(clk.seconds()));
  ok("onPhase 依序叫：白天→黃昏→晚上→清晨→白天，各一次", seen.join(",") === "day→dusk,dusk→night,night→dawn,dawn→day", seen.join(","));
  const s0 = C.sample(0), s1 = C.sample(1), sm = C.sample(-0.25), sp = C.sample(0.75);
  ok("sample(1)＝sample(0)、sample(-0.25)＝sample(0.75)（繞一圈）", JSON.stringify(s0) === JSON.stringify(s1) && near(sm.night, sp.night) && sm.phase === sp.phase);
  ok("段落邊界：17 分整進黃昏、20 分整進晚上、27 分整進清晨", C.sample(1020 / 1800).phase === "dusk" && C.sample(1019.9 / 1800).phase === "day" && C.sample(1200 / 1800).phase === "night" && C.sample(1620 / 1800).phase === "dawn" && C.sample(1799.99 / 1800).phase === "dawn");
}

// ---------- 值的範圍、各段長相 ----------
{
  let bad = 0, dayBad = 0, nightBad = 0, both = 0;
  for (let i = 0; i <= 18000; i++) {
    const s = C.sample(i / 18000);
    for (const k of ["night", "dusk", "dawn"]) if (!(s[k] >= 0 && s[k] <= 1)) bad++;
    if (!(s.hour >= 0 && s.hour < 24)) bad++;
    if (s.phase === "day" && (s.night || s.dusk || s.dawn)) dayBad++;
    if (s.phase === "night" && (s.night !== 1 || s.dusk || s.dawn)) nightBad++;
    if (s.dusk > 0 && s.dawn > 0) both++;
  }
  ok("night／dusk／dawn 都在 0–1、hour 在 0–24", bad === 0, String(bad));
  ok("白天三個值都是 0、晚上 night＝1 其他 0", dayBad === 0 && nightBad === 0, `${dayBad} ${nightBad}`);
  ok("dusk 跟 dawn 不會同時 > 0", both === 0);
  const pk = (ph, k) => { let m = 0; for (let i = 0; i <= 18000; i++) { const s = C.sample(i / 18000); if (s.phase === ph) m = Math.max(m, s[k]); } return m; };
  ok("黃昏 dusk 最高到 1、清晨 dawn 最高到 1", near(pk("dusk", "dusk"), 1, 1e-6) && near(pk("dawn", "dawn"), 1, 1e-6));
  const d = C.sample(C.PRESETS.dusk), n = C.sample(C.PRESETS.night), w = C.sample(C.PRESETS.dawn), y = C.sample(C.PRESETS.day);
  ok("預設點：day＝正中午 12 點、白天", y.phase === "day" && near(y.hour, 12, 1e-6) && y.night === 0, JSON.stringify(y));
  ok("預設點：dusk＝黃昏最橘（dusk 1、還沒天黑）", d.phase === "dusk" && d.dusk > 0.99 && d.night < 0.05, JSON.stringify(d));
  ok("預設點：night＝半夜（night 1）", n.phase === "night" && n.night === 1);
  ok("預設點：dawn＝清晨最粉（dawn 1、天快亮）", w.phase === "dawn" && w.dawn > 0.99 && w.night < 0.2, JSON.stringify(w));
  // 時鐘：白天 06→17、黃昏 17→19、晚上 19→05、清晨 05→06
  ok("顯示時間：一開始 6 點、黃昏開始 17 點、晚上開始 19 點、清晨開始 5 點", near(C.sample(0).hour, 6) && near(C.sample(1020 / 1800).hour, 17) && near(C.sample(1200 / 1800).hour, 19) && near(C.sample(1620 / 1800).hour, 5));
  // body.night（night > 0.5）什麼時候換：印出來給整合參考
  let on = null, off = null; for (let i = 0; i < 18000; i++) { const a = C.sample(i / 18000), b = C.sample((i + 1) / 18000); if (a.night <= 0.5 && b.night > 0.5) on = (i + 1) / 10; if (a.night > 0.5 && b.night <= 0.5) off = (i + 1) / 10; }
  ok("night 越過 0.5：黃昏後段變晚上、清晨前段變白天", on > 1020 && on < 1200 && off > 1620 && off < 1800, `天黑 ${(on / 60).toFixed(2)} 分、天亮 ${(off / 60).toFixed(2)} 分`);
}

// ---------- 連續、沒有跳變（值和斜率都連續，含繞回 0 那一下）----------
{
  const N = 360000, step = 1 / N;   // 每 0.005 秒取一次
  let maxD = 0, maxDD = 0, where = "", hourJump = 0;
  let p = C.sample(-step), q = C.sample(0);
  for (let i = 1; i <= N + 1; i++) {
    const r = C.sample(i * step);
    for (const k of ["night", "dusk", "dawn"]) {
      const d1 = Math.abs(r[k] - q[k]); if (d1 > maxD) { maxD = d1; where = `${k}@${(i * step * 30).toFixed(3)}分`; }
      const dd = Math.abs((r[k] - q[k]) - (q[k] - p[k])); if (dd > maxDD) maxDD = dd;
    }
    let dh = Math.abs(r.hour - q.hour); if (dh > 12) dh = 24 - dh; hourJump = Math.max(hourJump, dh);
    p = q; q = r;
  }
  // 最快的變化：黃昏 night 在 108 秒內 0→1、smoothstep 最陡 1.5 倍 → 每 0.005 秒最多約 0.00007
  ok("每 0.005 秒值最多變 0.0002（不會跳）", maxD < 2e-4, `最大 ${maxD.toExponential(2)} 在 ${where}`);
  ok("斜率也連續（二階差分 < 1e-6，段落交界不會突然加速）", maxDD < 1e-6, maxDD.toExponential(2));
  ok("顯示時間連續（每步 < 0.01 小時，含 24→0 繞回）", hourJump < 0.01, hourJump.toFixed(5));
}

// ---------- 看不到（切背景／鎖螢幕）不前進；回來也不補算 ----------
{
  const now = fakeTime(); let vis = true;
  const clk = C.createClock({ now, storage: mem(), visible: () => vis, search: "" });
  clk.tick(); now.add(1000); clk.tick();
  ok("看得到：過 1 秒走 1 秒", near(clk.seconds(), 1, 1e-9), String(clk.seconds()));
  vis = false; for (let i = 0; i < 600; i++) { now.add(1000); clk.tick(); }
  ok("看不到 10 分鐘：時間不動", near(clk.seconds(), 1, 1e-9), String(clk.seconds()));
  vis = true; clk.tick();
  ok("回來第一下不補算背景那 10 分鐘", near(clk.seconds(), 1, 1e-9), String(clk.seconds()));
  now.add(1000); clk.tick();
  ok("回來之後照常走", near(clk.seconds(), 2, 1e-9), String(clk.seconds()));
  now.add(3 * 3600 * 1000); clk.tick();
  ok("兩次 tick 隔 3 小時（睡眠沒觸發 hidden）：最多只算 maxStep 5 秒", near(clk.seconds(), 7, 1e-9), String(clk.seconds()));
  now.add(-60000); clk.tick();
  ok("系統時間往回調：不倒退", near(clk.seconds(), 7, 1e-9), String(clk.seconds()));
  // 關掉遊戲：最後一次存的就是下次打開的時間
  const st = mem(), n2 = fakeTime(); const a = C.createClock({ now: n2, storage: st, visible: () => true, search: "" });
  a.tick(); for (let i = 0; i < 90; i++) { n2.add(1000); a.tick(); }
  n2.add(5 * 3600 * 1000);   // 關掉 5 小時
  const b = C.createClock({ now: n2, storage: st, visible: () => true, search: "" });
  ok("關掉 5 小時再打開：從關掉那一刻接著走（遊戲時間停住）", near(b.seconds(), 90, 1e-6), String(b.seconds()));
  b.tick(); n2.add(1000); b.tick();
  ok("重開後照常前進", near(b.seconds(), 91, 1e-6), String(b.seconds()));
}

// ---------- 存讀 localStorage ----------
{
  const st = mem(), now = fakeTime();
  const fresh = C.createClock({ now, storage: st, visible: () => true, search: "" });
  const s0 = fresh.get();
  ok("新安裝：白天剛開始（0 秒、6 點、全部 0）", fresh.seconds() === 0 && s0.phase === "day" && s0.night === 0 && s0.dusk === 0 && near(s0.hour, 6));
  fresh.tick(); now.add(1000); fresh.tick();
  const saved = JSON.parse(st.raw("zy_clock"));
  ok("存在 zy_clock：{ v, t 秒, at 毫秒 }", saved.v === 1 && near(saved.t, 1, 1e-6) && saved.at === now(), st.raw("zy_clock"));
  fresh.set("dusk");
  const re = C.createClock({ now, storage: st, visible: () => true, search: "" });
  ok("set(\"dusk\") 會存檔；新的時鐘讀回同一個時間", near(re.seconds(), C.PRESETS.dusk * 1800, 1e-3) && re.get().phase === "dusk", String(re.seconds()));
  // 兩個分頁同時開（共用同一份存檔）：時間不會變兩倍快
  const st2 = mem(), n2 = fakeTime(); const A = C.createClock({ now: n2, storage: st2, visible: () => true, search: "" }), B = C.createClock({ now: n2, storage: st2, visible: () => true, search: "" });
  A.tick(); n2.add(500); B.tick();
  for (let i = 0; i < 120; i++) { n2.add(500); A.tick(); n2.add(500); B.tick(); }
  const tA = C.readSaved(st2).t;
  ok("兩個分頁一起開 120 秒：時鐘只走約 120 秒（不是 240）", Math.abs(tA - 120) < 1.01, tA.toFixed(3));
}

// ---------- 舊資料壞掉不爆 ----------
{
  const cases = { "不是 JSON": "garbage{", "null": "null", "陣列": "[]", "t 不是數字": "{\"t\":\"abc\"}", "沒有 t": "{\"v\":1}", "空字串": "", "數字": "123" };
  for (const [name, raw] of Object.entries(cases)) {
    let err = null, clk = null; try { clk = C.createClock({ now: fakeTime(), storage: mem({ zy_clock: raw }), visible: () => true, search: "" }); clk.tick(); } catch (e) { err = e; }
    ok(`壞存檔（${name}）：不丟例外、當新安裝`, !err && clk && clk.seconds() === 0, err ? String(err) : String(clk && clk.seconds()));
  }
  const neg = C.createClock({ now: fakeTime(), storage: mem({ zy_clock: "{\"t\":-30}" }), search: "" });
  const big = C.createClock({ now: fakeTime(), storage: mem({ zy_clock: "{\"t\":3630.5}" }), search: "" });
  ok("t 超出範圍：繞回 0–1800（-30→1770、3630.5→30.5）", near(neg.seconds(), 1770) && near(big.seconds(), 30.5), `${neg.seconds()} ${big.seconds()}`);
  const boom = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceeded"); } };
  let err = null, clk = null; const nb = fakeTime();
  try { clk = C.createClock({ now: nb, storage: boom, visible: () => true, search: "" }); clk.tick(); nb.add(1000); clk.tick(); clk.set("night"); } catch (e) { err = e; }
  ok("localStorage 讀寫都丟例外（無痕模式）：照樣能走", !err && clk.get().phase === "night", err ? String(err) : "");
  let err2 = null; const n3 = fakeTime(); try { const c = C.createClock({ now: n3, storage: null, search: "" }); c.tick(); n3.add(2000); c.tick(); if (!near(c.seconds(), 2)) err2 = "沒前進 " + c.seconds(); } catch (e) { err2 = e; }
  ok("沒有 storage（null）：記憶體裡照樣走", !err2, String(err2 || ""));
  let err3 = null; try { const c = C.createClock({ now: () => NaN, storage: mem(), search: "" }); c.tick(); c.tick(); } catch (e) { err3 = e; }
  ok("now() 回 NaN：不爆、不前進", !err3);
  let err4 = null; try { const c = C.createClock({ now: fakeTime(), storage: mem(), visible: () => { throw new Error("x"); }, search: "" }); c.tick(); } catch (e) { err4 = e; }
  ok("visible() 丟例外：不爆", !err4);
}

// ---------- ?clock= 解析 ----------
{
  const P = C.PRESETS, q = C.parseClockQuery;
  ok("?clock=day|dusk|night|dawn → 預設點", q("?clock=day") === P.day && q("?clock=dusk") === P.dusk && q("?debug&clock=night") === P.night && q("?a=1&clock=dawn&b=2") === P.dawn);
  ok("大小寫、前後空白都可以", q("?clock=DUSK") === P.dusk && q("?clock=%20night%20") === P.night);
  ok("?clock=0.62／?clock=0／?clock=1／?clock=.5 → 比例", near(q("?clock=0.62"), 0.62) && q("?clock=0") === 0 && q("?clock=1") === 0 && near(q("?clock=.5"), 0.5));
  ok("亂寫的 ?clock=（noon、1.5、-0.2、空的、%E0）→ null", [q("?clock=noon"), q("?clock=1.5"), q("?clock=-0.2"), q("?clock="), q("?clock=%E0")].every(x => x === null));
  ok("舊的 ?night=1 → 半夜、?night=0 → 正中午", q("?night=1") === P.night && q("?debug&night=0") === P.day);
  ok("?clock 比 ?night 優先", q("?night=1&clock=dawn") === P.dawn && q("?clock=dusk&night=0") === P.dusk);
  ok("沒指定 → null；?weather=… 不會被誤認", q("") === null && q("?debug&weather=sunny") === null && q(undefined) === null);
  ok("0.62 落在黃昏", C.sample(q("?clock=0.62")).phase === "dusk");
  // 網址指定：固定不走、不寫存檔（不弄亂全家的時鐘）
  const st = mem({ zy_clock: JSON.stringify({ v: 1, t: 100, at: 0 }) }), now = fakeTime();
  const clk = C.createClock({ now, storage: st, visible: () => true, search: "?debug&clock=dusk" });
  clk.tick(); for (let i = 0; i < 60; i++) { now.add(1000); clk.tick(); }
  ok("網址 ?clock=dusk：固定在黃昏不走", clk.frozen && near(clk.seconds(), P.dusk * 1800, 1e-9) && clk.get().phase === "dusk");
  ok("網址指定時不寫 zy_clock（原本的 100 秒還在）", st.writes === 0 && JSON.parse(st.raw("zy_clock")).t === 100);
  clk.set("night");
  ok("網址固定時 set() 仍可換（測試用），但一樣不存檔", clk.get().phase === "night" && st.writes === 0);
  const n1 = C.createClock({ now, storage: st, search: "?night=1" });
  ok("舊的 ?night=1：時鐘固定在晚上", n1.frozen && n1.get().night === 1);
  // 倍速（?clockspeed=60）：30 秒跑完一輪，不存檔
  const n5 = fakeTime(), st5 = mem(), fast = C.createClock({ now: n5, storage: st5, visible: () => true, search: "?clockspeed=60" });
  fast.tick(); for (let i = 0; i < 17; i++) { n5.add(1000); fast.tick(); }
  ok("?clockspeed=60：17 秒＝遊戲 17 分鐘（進黃昏）、不存檔", near(fast.seconds(), 1020, 1e-6) && fast.get().phase === "dusk" && st5.writes === 0, String(fast.seconds()));
}

// ---------- set()／onPhase ----------
{
  const now = fakeTime(), clk = C.createClock({ now, storage: mem(), visible: () => true, search: "" });
  const calls = []; const off = clk.onPhase((ph, prev, s) => calls.push([ph, prev, s.phase]));
  clk.set("dusk"); clk.set("dusk"); clk.set(0.8); clk.set("bogus"); clk.set(NaN);
  ok("set() 換段時 onPhase 叫一次、同段不叫、亂傳不動", calls.length === 2 && calls[0].join() === "dusk,day,dusk" && calls[1].join() === "night,dusk,night" && clk.get().phase === "night", JSON.stringify(calls));
  off(); clk.set("day");
  ok("取消訂閱後不再叫", calls.length === 2);
  let thrown = 0; clk.onPhase(() => { thrown++; throw new Error("boom"); }); const after = []; clk.onPhase(ph => after.push(ph));
  let err = null; try { clk.set("night"); } catch (e) { err = e; }
  ok("某個 onPhase 回呼丟例外：不影響時鐘和其他回呼", !err && thrown === 1 && after.join() === "night");
  // tick 回傳的 sample 可以直接丟給 weather.setLight
  const s = clk.tick();
  ok("tick() 回傳 { phase, night, dusk, dawn, hour, frac, u }", ["phase", "night", "dusk", "dawn", "hour", "frac", "u"].every(k => k in s));
}

for (const l of out) console.log(l);
const bad = out.filter(l => l.startsWith("FAIL")).length; console.log(bad ? `\n${bad} FAILED / ${out.length}` : `\nALL PASS (${out.length})`);
process.exit(bad ? 1 : 0);
