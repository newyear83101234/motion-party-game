// 線上冒煙測試（阿葉授權之後才跑）：node tools/plaza/smoke.mjs
// 注意：會真的在「本週」加 3（goal），測完若在意可到試算表「本週」分頁把大家合計減 3。
// 加 --read-only 只讀不寫。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { webAppUrl } = JSON.parse(fs.readFileSync(path.join(here, 'config.json'), 'utf8'));
const readOnly = process.argv.includes('--read-only');

async function call(method, body) {
  const res = await fetch(webAppUrl, {
    method,
    redirect: 'follow',
    headers: body ? { 'Content-Type': 'text/plain;charset=utf-8' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  try { return { status: res.status, json: JSON.parse(text) }; }
  catch { return { status: res.status, json: null, text: text.slice(0, 200).replace(/\s+/g, ' ') }; }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let bad = 0;
const check = (cond, msg, got) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg + '  ' + JSON.stringify(got)); if (!cond) bad++; };

main();
async function main() {
const g0 = await call('GET');
if (!g0.json) {
  console.log(`GET 回的不是 JSON（HTTP ${g0.status}）：${g0.text}`);
  console.log('→ 多半是還沒授權：請阿葉照 README「第一次授權」做完再跑。');
  process.exitCode = 2; return;
}
console.log('GET 原文：' + JSON.stringify(g0.json));
check(g0.json.ok === true && /^\d{4}-\d{2}-\d{2}$/.test(g0.json.w), 'doGet 正常', { w: g0.json.w, total: g0.json.total });
if (readOnly) { process.exitCode = bad ? 1 : 0; return; }

const w = g0.json.w;
const nextW = new Date(Date.parse(w + 'T00:00:00Z') + 7 * 86400000).toISOString().slice(0, 10);
const p1 = await call('POST', { w, k: 'goal', n: 3 });
check(p1.json && p1.json.ok === true, 'POST goal 3 → ok', p1.json || p1.text);
const p2 = await call('POST', { w, k: 'goal', n: 999 });
check(p2.json && p2.json.ok === false && p2.json.why === 'bad_n', 'POST n=999 被拒', p2.json || p2.text);
const p3 = await call('POST', { w: nextW, k: 'goal', n: 1 });
check(p3.json && p3.json.ok === false && p3.json.why === 'bad_week', 'POST 錯週被拒', p3.json || p3.text);
const p4 = await call('POST', { w, k: 'goal', n: 1, id: 'x' });
check(p4.json && p4.json.ok === false && p4.json.why === 'bad_body', 'POST 多欄位被拒', p4.json || p4.text);

console.log('等 31 秒讓讀取快取過期…');
await sleep(31000);
const g1 = await call('GET');
check(g1.json && g1.json.total - g0.json.total >= 3, `doGet total 增加 ≥3（${g0.json.total} → ${g1.json && g1.json.total}）`, g1.json);
process.exitCode = bad ? 1 : 0;
}
