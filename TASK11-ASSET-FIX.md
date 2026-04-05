# TASK11 — 直升機競賽素材顯示修復

> **目標：** 修復 5 個素材渲染問題
> **影響檔案：** 僅修改 `js/games/helicopter-race.js`
> **⚠️ 禁止修改：** 扭動偵測演算法、物理參數、遊戲邏輯、main.js、audio-manager.js

---

## 問題 1（P0）：直升機太小 — 放大 4 倍

### 目前問題
`drawHelicopter()` 的 `size = 50`，`drawW = s * 2.2 = 110px`，在手機畫面上幾乎看不到。

### 修改方式

找到 render 函式中呼叫 `drawHelicopter` 的地方（遊戲進行中繪製直升機的位置），將 size 參數從 `50` 改為 `200`。

同時在 `drawHelicopter` 函式中，螺旋槳長度 `pLen = s * 0.9` 和速度線的偏移量都會自動跟著 size 縮放，所以不需要額外調整。

結算畫面的 `drawHelicopter` 呼叫（約 line 351、364）目前已經是 `size=200`，不用改。

**關鍵：確認遊戲進行中 render 裡面繪製直升機的 size 參數，改為 200。**

---

## 問題 2（P0）：呼啦圈沒有「環住」腰部

### 目前問題
1. 呼啦圈圖片（hula_hoop.png）有白色背景矩形，直接 drawImage 會顯示白色方框
2. 尺寸太小（`hulaW = 160`），沒有覆蓋到整個腰部

### 修改方式

**放棄使用 hula_hoop.png 圖片，改為 Canvas 程式碼繪製彩色橢圓呼啦圈。**

找到呼啦圈繪製的程式碼區塊（約 line 558-533 附近，`// ── 呼啦圈` 的註解處），將整個區塊替換為：

```javascript
// ── 呼啦圈（Canvas 繪製彩色橢圓，環住腰部）──
if (p.hipVisible) {
  const lHip = lm ? lm[DET.hipL] : null;
  const rHip = lm ? lm[DET.hipR] : null;
  const lSh = lm ? lm[11] : null;
  const rSh = lm ? lm[12] : null;

  // 根據肩寬計算呼啦圈尺寸（肩寬 × 1.3）
  let hulaW = 350; // fallback
  if (lSh && rSh && lSh.visibility > 0.2 && rSh.visibility > 0.2) {
    hulaW = Math.abs(lSh.x - rSh.x) * _w * 1.3;
  }
  hulaW = Math.max(hulaW, 300); // 最小 300px
  const hulaH = hulaW * 0.35; // 透視壓扁（正面看呼啦圈）

  // 傾斜角度
  let tiltAngle = 0;
  if (lHip && rHip) {
    const dy = (lHip.y - rHip.y);
    tiltAngle = Math.max(-0.5, Math.min(0.5, dy * 5));
  }
  tiltAngle += Math.sin(Date.now() / 150) * p.currentIntensity * 0.3;

  ctx.save();
  ctx.translate(p.hipScreenX, p.hipScreenY);
  ctx.rotate(tiltAngle);

  // 繪製多圈彩色條紋呼啦圈
  const colors = ["#FF69B4", "#FFD700", "#00BFFF", "#32CD32", "#FF6347", "#9370DB"];
  const ringWidth = 12;
  for (let r = 0; r < colors.length; r++) {
    ctx.strokeStyle = colors[r];
    ctx.lineWidth = ringWidth;
    ctx.beginPath();
    ctx.ellipse(0, 0, hulaW / 2 - r * 3, hulaH / 2 - r * 1.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 外圈白色高光
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 0, hulaW / 2 + 2, hulaH / 2 + 1, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}
```

同時刪除 `else if (p.hipVisible)` 的 emoji fallback 區塊（🍑 那個），因為呼啦圈現在完全用 Canvas 畫，不需要 fallback。

---

## 問題 3（P1）：城市天際線有空白間隙 + 不夠透明

### 目前問題
檔案在城市天際線程式碼處被截斷（line 560 停在 `cityImg.natura` 中間）。需要補全。

### 修改方式

找到 `// 城市天際線（底部固定）` 的程式碼，刪除截斷的不完整程式碼，替換為：

```javascript
// 城市天際線（底部固定，無縫鋪滿，半透明）
if (imgReady(cityImg)) {
  const cityH = _h * 0.22; // 稍微放大（從 0.18 → 0.22）
  const cityW = cityH * (cityImg.naturalWidth / cityImg.naturalHeight);
  const cityY = _h - cityH;
  ctx.save();
  ctx.globalAlpha = 0.5; // 半透明融入背景
  // 無縫重複鋪滿整個畫面寬度
  let cx = 0;
  while (cx < _w) {
    ctx.drawImage(cityImg, cx, cityY, cityW, cityH);
    cx += cityW - 1; // 減 1 像素避免接縫
  }
  ctx.globalAlpha = 1.0;
  ctx.restore();
}
```

### 重要
城市天際線之後，還需要確認以下程式碼是否完整存在（如果被截斷丟失了，需要補回）：
- 直升機在遊戲進行中的繪製呼叫
- HUD 繪製呼叫（`renderHUD(ctx)`）
- 倒數繪製呼叫（`renderCountdown(ctx)`）
- 結算畫面繪製呼叫（`renderResults(ctx)`）
- 提前結束確認框繪製（`renderQuitConfirm(ctx)`）

render 函式的完整結尾應該像這樣：

```javascript
    // 城市天際線...（如上）

    // 遊戲中的直升機繪製
    if (gameState === "playing" || gameState === "countdown") {
      players.forEach((p, i) => {
        let heliX;
        if (_mode === "dual") {
          heliX = i === 0 ? _w * 0.3 : _w * 0.7;
        } else {
          heliX = _w / 2;
        }
        const heliY = _h * 0.85 - (p.height / PHYSICS.maxHeight) * (_h * 0.7);
        drawHelicopter(ctx, heliX, heliY, p.color, p.propellerAngle, p.currentIntensity, 200, i);
      });
    }

    // 遊戲狀態 UI
    if (gameState === "countdown") {
      renderCountdown(ctx);
    } else if (gameState === "playing") {
      renderHUD(ctx);
      if (quitConfirmOpen) renderQuitConfirm(ctx);
    } else if (gameState === "finished") {
      renderResults(ctx);
    }
  },
```

**確認 render 函式完整後，確保匯出物件（`const helicopterRace = { ... }; export default helicopterRace;`）完整無缺。**

---

## 問題 4（P1）：白雲看不到

### 目前問題
雲朵繪製程式碼存在（line 506-533），但使用 `cloudImg`（整張圖片）直接縮放繪製。問題可能是：
1. cloud.png 也有白色背景（跟呼啦圈一樣的問題）
2. 雲朵透明度太低（`opacity: 0.3~0.7`），在鏡頭實景背景上不夠明顯

### 修改方式

把雲朵從圖片改為 Canvas 繪製（跟呼啦圈一樣的理由 — 圖片可能有白色背景）：

找到雲朵繪製的 `_clouds.forEach` 區塊（約 line 508-533），將 `if (imgReady(cloudImg))` 整個分支刪除，只保留 Canvas fallback 繪製，並強化視覺效果：

```javascript
_clouds.forEach(c => {
  c.x += c.speed;
  if (c.x > _w + c.size) c.x = -c.size;
  const parallax = 0.2 + c.layer * 0.25;
  const screenY = c.baseY + maxH * _h * parallax;
  if (screenY < -c.size || screenY > _h + c.size) return;

  ctx.save();
  ctx.globalAlpha = c.opacity + 0.2; // 提高可見度
  ctx.fillStyle = "white";
  ctx.shadowColor = "rgba(255,255,255,0.5)";
  ctx.shadowBlur = 15;

  // 用多個圓形組合成蓬鬆雲朵
  const s = c.size;
  ctx.beginPath();
  ctx.arc(c.x, screenY, s * 0.45, 0, Math.PI * 2);
  ctx.arc(c.x - s * 0.35, screenY + s * 0.05, s * 0.32, 0, Math.PI * 2);
  ctx.arc(c.x + s * 0.35, screenY + s * 0.05, s * 0.32, 0, Math.PI * 2);
  ctx.arc(c.x - s * 0.15, screenY - s * 0.2, s * 0.28, 0, Math.PI * 2);
  ctx.arc(c.x + s * 0.15, screenY - s * 0.15, s * 0.28, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.restore();
});
```

---

## 問題 5（P2）：飛行員護目鏡位置問題

### 目前問題
鏡頭拍不到臉（只拍到胸部以下），所以護目鏡不顯示。

### 修改方式

找到護目鏡繪製區塊（`// ── 飛行員護目鏡` 註解處），把定位邏輯從「鼻樑 landmark 1」改為「肩膀中點向上偏移」：

```javascript
// ── 飛行員護目鏡（改用肩膀定位，避免臉不在畫面時不顯示）──
if (lm && imgReady(gogglesImg)) {
  const lSh = lm[11], rSh = lm[12];
  if (lSh && rSh && lSh.visibility > 0.2 && rSh.visibility > 0.2) {
    const shoulderCX = (1 - (lSh.x + rSh.x) / 2) * _w;
    const shoulderCY = ((lSh.y + rSh.y) / 2) * _h;
    const shoulderW = Math.abs(lSh.x - rSh.x) * _w;

    // 護目鏡位於肩膀上方（頭部位置）
    const gogglesW = shoulderW * 0.55;
    const gogglesH = gogglesW * (gogglesImg.naturalHeight / gogglesImg.naturalWidth);
    const gogglesY = shoulderCY - shoulderW * 0.85; // 肩膀上方約一個肩寬距離

    ctx.save();
    ctx.drawImage(gogglesImg, shoulderCX - gogglesW / 2, gogglesY - gogglesH / 2, gogglesW, gogglesH);
    ctx.restore();
  }
}
```

---

## 驗證清單

- [ ] 直升機在遊戲中明顯可見（約佔螢幕寬度 25-30%）
- [ ] 呼啦圈是彩色橢圓環，環住玩家腰部/屁股位置，無白色方框
- [ ] 城市天際線連續無縫鋪滿底部，半透明
- [ ] 白雲在畫面中可見，緩慢飄移
- [ ] 護目鏡顯示在頭部位置（即使臉不在畫面中）
- [ ] 遊戲完整可運行，無 console 錯誤
- [ ] 結算畫面正常顯示
