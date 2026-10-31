// draw-core 單元測試。用法：node tools/draw-test/core.test.mjs
import * as C from "../../js/draw-core.js";

const results = [];
const check = (name, ok, info = "") => results.push((ok ? "✅ " : "❌ ") + name + (info ? "  " + info : ""));

// 20×20 測試圖：外框黑線 + x=10 一條直線 → 裡面左右兩塊
function makeFrame() {
  const w = 20, h = 20, rgba = new Uint8ClampedArray(w * h * 4).fill(255);
  const black = (x, y) => { const p = (y * w + x) * 4; rgba[p] = rgba[p + 1] = rgba[p + 2] = 0; };
  for (let i = 0; i < 20; i++) { black(i, 0); black(i, 19); black(0, i); black(19, i); black(10, i); }
  return { w, h, rgba };
}

{
  const { w, h, rgba } = makeFrame();
  const m = C.lineMask(rgba, w, h);
  const lines = m.reduce((s, v) => s + v, 0);
  check("lineMask 數出線像素", lines === 20 * 4 - 4 + 18, `lines=${lines}`);

  const t = new Uint8ClampedArray(4 * 4 * 4); // 全透明 → 當白色，不是線
  check("透明像素不算線", C.lineMask(t, 4, 4).every(v => v === 0));

  const R = C.labelRegions(m, w, h);
  check("切出 2 塊", R.count === 2, `count=${R.count}`);
  const areas = R.boxes.map(b => b.area).sort((a, b) => a - b);
  check("兩塊面積 144 與 162", areas[0] === 144 && areas[1] === 162, areas.join(","));
  check("線像素標成 LINE", R.labels[0] === C.LINE && R.labels[10] === C.LINE);
  const left = R.labels[5 * w + 5], right = R.labels[5 * w + 15];
  check("左右兩塊編號不同", left >= 0 && right >= 0 && left !== right);
  const b = R.boxes[left];
  check("左塊外框 1..9 × 1..18", b.x0 === 1 && b.x1 === 9 && b.y0 === 1 && b.y1 === 18, JSON.stringify(b));
}

{
  const { w, h, rgba } = makeFrame();
  const R = C.labelRegions(C.lineMask(rgba, w, h), w, h);
  const left = R.labels[5 * w + 5], right = R.labels[5 * w + 15];

  check("regionAt 點在塊內", C.regionAt(R.labels, w, h, 5, 5) === left);
  const onLine = C.regionAt(R.labels, w, h, 10, 5);
  check("regionAt 點在線上 → 找最近的一塊", onLine === left || onLine === right, `got ${onLine}`);
  check("regionAt 半徑 0 點在線上 → -1", C.regionAt(R.labels, w, h, 0, 0, 0) === -1);
  check("regionAt 點在圖外 → -1", C.regionAt(R.labels, w, h, -3, 5) === -1);

  const m0 = C.regionMask(R.labels, w, h, left, R.boxes[left], 0);
  check("遮罩 pad=0 只含本塊 162 點", m0.data.filter(v => v).length === 162);
  const m2 = C.regionMask(R.labels, w, h, left, R.boxes[left], 2);
  check("遮罩 pad=2 外框 0,0,12,20", m2.x === 0 && m2.y === 0 && m2.w === 12 && m2.h === 20, `${m2.x},${m2.y},${m2.w},${m2.h}`);
  check("遮罩 pad=2 擴進黑線共 220 點", m2.data.filter(v => v).length === 220, `${m2.data.filter(v => v).length}`);
  let leak = 0;
  for (let j = 0; j < m2.h; j++) for (let i = 0; i < m2.w; i++)
    if (m2.data[j * m2.w + i] && R.labels[(m2.y + j) * w + m2.x + i] === right) leak++;
  check("遮罩不會漏進隔壁塊", leak === 0, `leak=${leak}`);

  const u = C.rectUnion({ x: 0, y: 0, w: 4, h: 4 }, { x: 2, y: 3, w: 4, h: 4 });
  check("rectUnion", u.x === 0 && u.y === 0 && u.w === 6 && u.h === 7, JSON.stringify(u));
  check("rectUnion 有 null", C.rectUnion(null, { x: 1, y: 1, w: 2, h: 2 }).w === 2);
  const c = C.rectClamp({ x: -2.5, y: 3.2, w: 10, h: 100 }, 20, 20);
  check("rectClamp 裁進畫布", c.x === 0 && c.y === 3 && c.w === 8 && c.h === 17, JSON.stringify(c));
  check("rectClamp 完全在外 → null", C.rectClamp({ x: 30, y: 0, w: 5, h: 5 }, 20, 20) === null);

  const H = new C.History(30);
  for (let i = 0; i < 35; i++) H.push(i);
  check("History 最多 30 步", H.size === 30);
  check("History pop 拿到最後一步", H.pop() === 34 && H.size === 29);
  H.clear();
  check("History 清空後 pop → null", H.pop() === null);
}

// 審查修正
{
  const H = new C.History(30, 100);
  H.push({ bytes: 60 }); H.push({ bytes: 60 }); H.push({ bytes: 60 });
  check("History 位元組上限：丟舊的只留 1 筆 60", H.size === 1 && H.bytes === 60, `size=${H.size} bytes=${H.bytes}`);
  H.pop();
  check("History pop 後 bytes 歸 0", H.bytes === 0 && H.size === 0);
  const H2 = new C.History(2, 1000);
  H2.push({ bytes: 10 }); H2.push({ bytes: 20 }); H2.push({ bytes: 30 });
  check("History 筆數上限時 bytes 同步扣掉", H2.size === 2 && H2.bytes === 50, `bytes=${H2.bytes}`);
  H2.push({ bytes: 5000 });
  check("單筆超過上限仍保留這一筆", H2.size === 1 && H2.bytes === 5000);
  H2.clear();
  check("History clear 後 bytes 歸 0", H2.bytes === 0);
  const H3 = new C.History(30);
  H3.push(1); H3.push(2);
  check("沒有 bytes 的項目當 0", H3.bytes === 0 && H3.size === 2);

  // 60×30：中間一條 16px 粗黑線（x=20..35），左塊 x<20、右塊 x>35
  const w = 60, h = 30, rgba = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < h; y++) for (let x = 20; x <= 35; x++) { const p = (y * w + x) * 4; rgba[p] = rgba[p + 1] = rgba[p + 2] = 0; }
  const R = C.labelRegions(C.lineMask(rgba, w, h), w, h);
  const left = R.labels[5 * w + 5];
  check("regionAt 預設半徑：粗線上離左塊 8px 也找得到", C.regionAt(R.labels, w, h, 27, 15) === left, `got ${C.regionAt(R.labels, w, h, 27, 15)}`);
  check("regionAt 半徑仍有限制（遠處空白 -1）", C.regionAt(new Int32Array(w * h).fill(-1), w, h, 27, 15) === -1);
}

console.log(results.join("\n"));
const fail = results.filter(r => r.startsWith("❌")).length;
console.log(fail ? `\n${fail} 項失敗` : "\n全部通過");
process.exit(fail ? 1 : 0);
