// 「畫變成音樂」：一道光從左掃到右，掃到哪一格有塗顏色，就用那個顏色的樂器彈出來（越上面越高音）
// 顏色→樂器：紅、粉＝木琴；橘、黃＝鐵琴；綠＝撥弦；藍、青＝笛子；紫＝鐵琴高八度；咖啡、深色＝鼓。沒塗的白色和黑線不出聲
// 每一直排最多 3 個音（挑塗得最滿的格子），音都在五聲音階上，怎麼塗都好聽
export const COLS = 16, ROWS = 7, STEP = 0.26;

// 把畫分成 COLS×ROWS 格，算每一格「有塗色的比例」和平均顏色；回傳每一排要彈的音
export function analyze(canvas) {
  const W = COLS * 12, H = ROWS * 12, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.imageSmoothingQuality = "high";
  x.drawImage(canvas, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data;
  c.width = c.height = 0;
  const steps = [];
  for (let col = 0; col < COLS; col++) {
    const cells = [];
    for (let row = 0; row < ROWS; row++) {
      let n = 0, r = 0, g = 0, b = 0;
      for (let y = row * 12; y < row * 12 + 12; y++) for (let xx = col * 12; xx < col * 12 + 12; xx++) {
        const p = (y * W + xx) * 4, R = d[p], G = d[p + 1], B = d[p + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        if (mx < 45 || (mx > 236 && mx - mn < 22)) continue;   // 黑線、沒塗的白色
        n++; r += R; g += G; b += B;
      }
      if (n < 144 * 0.3) continue;
      r /= n; g /= n; b /= n;
      cells.push({ row, fill: n / 144, rgb: [r | 0, g | 0, b | 0], kind: kindOf(r, g, b) });
    }
    cells.sort((p, q) => q.fill - p.fill);
    steps.push(cells.slice(0, 3));
  }
  return steps;
}
function kindOf(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510, s = mx === mn ? 0 : (mx - mn) / (255 - Math.abs(mx + mn - 255));
  if (l < 0.3 || (s < 0.25 && l < 0.6)) return "drum";   // 深色、咖啡、灰
  let h = 0;
  if (mx === r) h = ((g - b) / (mx - mn) + 6) % 6; else if (mx === g) h = (b - r) / (mx - mn) + 2; else h = (r - g) / (mx - mn) + 4;
  h *= 60;
  if (h < 20 || h >= 330) return "marimba";               // 紅、粉紅
  if (h < 70) return "glock";                             // 橘、黃
  if (h < 165) return "pluck";                            // 綠
  if (h < 255) return "flute";                            // 青、藍
  return "glockHi";                                       // 紫
}

// 播放：host 是要蓋光帶的容器，rect 是畫在 host 裡的位置（{ x, y, w, h }，相對 host 左上角）
// 回傳 { done: Promise, stop() }；A 是聲音模組（要有 inst），parts 是粒子（stars／splash，用螢幕座標）
export function play({ canvas, host, rect, A, parts }) {
  const steps = analyze(canvas), bar = document.createElement("div"), timers = [];
  bar.className = "music-bar";
  Object.assign(bar.style, { left: rect.x + "px", top: rect.y + "px", height: rect.h + "px" });
  host.append(bar);
  const hostR = host.getBoundingClientRect(), cw = rect.w / COLS, ch = rect.h / ROWS;
  steps.forEach((cells, col) => {
    for (const c of cells) {
      const i = c.kind === "drum" ? 0 : 3 + (ROWS - 1 - c.row) * 2 + (c.kind === "glockHi" ? 3 : 0);
      A.inst?.(c.kind === "glockHi" ? "glock" : c.kind, i, { gain: 0.16, at: col * STEP + 0.05 });
    }
    timers.push(setTimeout(() => {
      bar.style.transform = `translateX(${(col + 0.5) * cw}px)`;
      for (const c of cells) {
        const cx = rect.x + (col + 0.5) * cw, cy = rect.y + (c.row + 0.5) * ch, pop = document.createElement("i");
        pop.className = "music-pop";
        Object.assign(pop.style, { left: cx + "px", top: cy + "px", width: ch * 0.9 + "px", height: ch * 0.9 + "px", boxShadow: `0 0 0 5px rgb(${c.rgb}), 0 0 22px 6px rgb(${c.rgb})` });   // 白圈＋那一格的顏色光暈：塗什麼顏色上面都看得到
        host.append(pop);
        setTimeout(() => pop.remove(), 700);
        parts?.stars(hostR.left + cx, hostR.top + cy, ch * 0.8);
      }
    }, (col * STEP + 0.05) * 1000));
  });
  let finish;
  const done = new Promise(ok => { finish = ok; });
  const end = () => { timers.forEach(clearTimeout); bar.remove(); host.querySelectorAll(".music-pop").forEach(p => p.remove()); finish(); };
  timers.push(setTimeout(() => {   // 最後一個和弦＋彩帶
    [5, 7, 9].forEach(i => A.inst?.("glock", i, { gain: 0.14 }));
    parts?.splash(hostR.left + rect.x + rect.w / 2, hostR.top + rect.y + rect.h / 2, null);
    setTimeout(end, 500);
  }, COLS * STEP * 1000 + 80));
  return { done, stop: end, steps };
}
