// 方塊爆破 雲端排行榜 API 測試（Supabase 專案 block-blast-rank）
// 用法：node tools/bb-test/rank_api.mjs   （會寫入 device 開頭 00000000-0000-4000-8000- 的測試資料，測完用 Supabase SQL 刪掉）
// 金鑰是 Supabase「publishable key」：設計上就是公開給網頁用的，權限由資料庫端的函式控制（資料表本身不給讀寫）
const URL = "https://vtfkmvnksnzxrlpmhidv.supabase.co/rest/v1";
const KEY = "sb_publishable_v9oBuj-TyonYOCt0IzPDnA_73o1DPNT";
const rpc = async (fn, body) => {
  const r = await fetch(`${URL}/rpc/${fn}`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ok = (name, cond, info) => console.log((cond ? "✅ " : "❌ ") + name + "  " + JSON.stringify(info).slice(0, 160));
const D1 = "00000000-0000-4000-8000-000000000001", D2 = "00000000-0000-4000-8000-000000000002";
const sleep = ms => new Promise(r => setTimeout(r, ms));

let r = await rpc("bb_submit", { p_device: D1, p_name: "測試員A", p_score: 1234, p_moves: 50 });
ok("送分數（中文名字）", r.status === 200 && r.body[0].best === 1234, r);
await sleep(1200);
r = await rpc("bb_submit", { p_device: D1, p_name: "改名A", p_score: 10, p_moves: 3 });
ok("送比較低的分數 → 留最高分、名字更新", r.status === 200 && r.body[0].best === 1234, r);
r = await rpc("bb_submit", { p_device: D2, p_name: "測試員B🎮名字超過十二個字會被切掉嗎", p_score: 5000, p_moves: 80 });
ok("第二台手機、名字太長", r.status === 200 && r.body[0].rank === 1, r);
r = await rpc("bb_board", { p_limit: 50, p_device: D1 });
ok("排行榜不回傳 device_id、測試資料不上榜", r.status === 200 && Array.isArray(r.body) && !r.body.some(x => "device_id" in x) && !r.body.some(x => x.is_me), (r.body || []).length + " 筆");
r = await rpc("bb_me", { p_device: D1 });
ok("查自己（名字已改、留最高分）", r.status === 200 && r.body[0] && r.body[0].name === "改名A" && r.body[0].best === 1234, r.body);
r = await rpc("bb_submit", { p_device: D1, p_name: "x", p_score: 99999999, p_moves: 5 });
ok("分數超過上限被擋", r.status !== 200, r.body && r.body.message);
r = await rpc("bb_submit", { p_device: D1, p_name: "x", p_score: 900000, p_moves: 1 });
ok("不合理的分數被擋", r.status !== 200, r.body && r.body.message);
r = await rpc("bb_submit", { p_device: "not-a-uuid", p_name: "x", p_score: 1, p_moves: 1 });
ok("device 格式錯被擋", r.status !== 200, r.body && r.body.message);
r = await rpc("bb_submit", { p_device: D1, p_name: "<img src=x onerror=alert(1)>", p_score: 1, p_moves: 1 });
ok("HTML 名字照存成純文字（畫面用 textContent 顯示）", r.status === 200, r.body);
await sleep(1200);
r = await rpc("bb_submit", { p_device: D2, p_name: String.fromCharCode(0x202e, 0x200b, 0x200b) + "  ", p_score: 1, p_moves: 1 });
const me2 = await rpc("bb_me", { p_device: D2 });
ok("只有看不見字元的名字 → 變「玩家」", r.status === 200 && me2.body[0] && me2.body[0].name === "玩家", me2.body);
r = await rpc("bb_submit", { p_device: D1, p_name: "x", p_score: 400 * 3000 + 6000, p_moves: 400 });
ok("平均每塊超過 3000 分被擋", r.status !== 200, r.body && r.body.message);
const t = await fetch(`${URL}/bb_scores?select=*`, { headers: { apikey: KEY } });
ok("資料表不能直接讀", t.status === 401 || t.status === 403 || t.status === 404 || (await t.text()).includes("permission denied"), t.status);
