// 注音小島全套測試一鍵跑（10-31 阿葉同意「測試改快」）：node tools/zy-test/run-all.js [篩選字...]
// 需要：專案根目錄開著 python -m http.server 8765。一支一支跑（3D 測試重疊跑會 Target crashed）；
// 失敗（exit≠0 或有 FAIL 行）自動單獨重跑一次；每支記秒數；輸出存 %TEMP%\zy-run-all\<檔名>.txt，最後印總表。
//   node tools/zy-test/run-all.js            全套（不含量載入時間的 loadtime／loadprofile：那兩支要量線上網路，另外跑）
//   node tools/zy-test/run-all.js tops gamelist   只跑檔名含 tops 或 gamelist 的
//   ZY_RUN_ALL_LOAD=1 node tools/zy-test/run-all.js   連 loadtime／loadprofile 一起跑
// 10-31：不需要 3D 小島的測試開頁帶 no3d（flow、newmodes、polish、regress、bubble-boss、bubble-shots、levels）＝每次開頁省 15–20 秒軟體算圖
const { spawnSync } = require("child_process");
const path = require("path"), fs = require("fs"), os = require("os");
const DIR = __dirname, ROOT = path.resolve(DIR, "../..");
const OUT = process.env.ZY_RUN_ALL_OUT || path.join(os.tmpdir(), "zy-run-all");
fs.mkdirSync(OUT, { recursive: true });
const SKIP = new Set(["lib.js", "run-all.js"]);
const LOAD = new Set(["loadtime.js", "loadprofile.js"]);
const filters = process.argv.slice(2);
const files = fs.readdirSync(DIR).filter(f => /\.(m?js)$/.test(f) && !SKIP.has(f))
  .filter(f => process.env.ZY_RUN_ALL_LOAD || !LOAD.has(f))
  .filter(f => !filters.length || filters.some(k => f.includes(k)))
  .sort((a, b) => (/-unit\.mjs$/.test(b) - /-unit\.mjs$/.test(a)) || a.localeCompare(b));   // 不開瀏覽器的單元測試先跑（幾秒就知道邏輯有沒有壞）
const runOnce = f => {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(DIR, f)], { cwd: ROOT, encoding: "utf8", timeout: 20 * 60e3, maxBuffer: 64 * 1024 * 1024, env: process.env });
  const text = (r.stdout || "") + (r.stderr || "") + (r.error ? "\n[run-all] " + r.error.message : "");
  const fails = text.split("\n").filter(l => /^FAIL\b/.test(l));
  return { sec: Math.round((Date.now() - t0) / 1000), code: r.status, fails, pass: (text.match(/^PASS\b/gm) || []).length, text };
};
const rows = []; const T0 = Date.now();
for (const f of files) {
  process.stdout.write(`▶ ${f} … `);
  let r = runOnce(f), retried = false;
  if (r.code !== 0 || r.fails.length) { retried = true; const r2 = runOnce(f); r2.sec += r.sec; r = r2; }   // 偶發（3D 測試瀏覽器當掉、網路抖）單獨重跑一次
  fs.writeFileSync(path.join(OUT, f + ".txt"), r.text);
  const ok = r.code === 0 && !r.fails.length;
  rows.push({ f, ok, sec: r.sec, pass: r.pass, fails: r.fails, retried, code: r.code });
  console.log(`${ok ? "✅" : "❌"} ${r.sec} 秒（PASS ${r.pass}${r.fails.length ? "、FAIL " + r.fails.length : ""}${retried ? "、重跑過" : ""}）`);
}
const total = Math.round((Date.now() - T0) / 1000), bad = rows.filter(r => !r.ok);
console.log(`\n全部 ${rows.length} 支：${rows.length - bad.length} 支過、${bad.length} 支沒過；共 ${Math.floor(total / 60)} 分 ${total % 60} 秒`);
console.log("最久的 8 支：" + rows.slice().sort((a, b) => b.sec - a.sec).slice(0, 8).map(r => `${r.f} ${r.sec}s`).join("、"));
for (const r of bad) { console.log(`\n❌ ${r.f}（exit ${r.code}）`); r.fails.slice(0, 6).forEach(l => console.log("   " + l.slice(0, 200))); }
console.log(`\n每支完整輸出：${OUT}`);
fs.writeFileSync(path.join(OUT, "_summary.json"), JSON.stringify({ total, rows: rows.map(({ f, ok, sec, pass, fails, retried, code }) => ({ f, ok, sec, pass, fails, retried, code })) }, null, 1));
process.exitCode = bad.length ? 1 : 0;
