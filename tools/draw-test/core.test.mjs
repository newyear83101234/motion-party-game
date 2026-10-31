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

console.log(results.join("\n"));
const fail = results.filter(r => r.startsWith("❌")).length;
console.log(fail ? `\n${fail} 項失敗` : "\n全部通過");
process.exit(fail ? 1 : 0);
