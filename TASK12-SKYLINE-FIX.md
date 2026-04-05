# TASK12 — 城市天際線改為 Canvas 純繪製

## 問題描述

`city_skyline.png` 自帶橙色漸層背景，拼接時每塊圖片的背景邊界清晰可見，導致地平線不連續。`globalAlpha = 0.5` 透明度也不夠，看起來不像背景。

## 修改目標

移除對 `city_skyline.png` 圖片的依賴，改用 Canvas 直接繪製城市剪影，達成：
1. 完全無縫（沒有圖片拼接問題）
2. 更高透明度，融入鏡頭實景背景
3. 保持底部裝飾感，不搶主角直升機的視覺焦點

## 修改檔案

`js/games/helicopter-race.js`

## 修改內容

### 步驟 1：找到城市天際線渲染區塊

搜尋 `// 城市天際線` 註解，目前程式碼大約長這樣：

```js
// 城市天際線（底部固定，連續鋪滿）
if (imgReady(cityImg)) {
  const cityH = _h * 0.22;
  const cityW = cityH * (cityImg.naturalWidth / cityImg.naturalHeight);
  ctx.save();
  ctx.globalAlpha = 0.5;
  let ox = 0;
  while (ox < _w) {
    ctx.drawImage(cityImg, ox, _h - cityH, cityW, cityH);
    ox += cityW - 1;
  }
  ctx.restore();
}
```

### 步驟 2：整段替換為以下 Canvas 繪製程式碼

```js
// 城市天際線（Canvas 繪製，無縫 + 半透明剪影）
{
  ctx.save();
  ctx.globalAlpha = 0.25; // 低透明度，融入背景

  const baseY = _h; // 底部基準線
  const skyH = _h * 0.18; // 天際線最高高度

  // 定義建築輪廓（x 比例 0~1，h 比例 0~1 相對於 skyH）
  // 重複兩次確保無縫覆蓋任何寬度
  const buildings = [
    // 第一組城市
    { x: 0.00, w: 0.04, h: 0.45 },
    { x: 0.04, w: 0.03, h: 0.70 },
    { x: 0.07, w: 0.05, h: 0.55 },
    { x: 0.12, w: 0.02, h: 0.85 },  // 高塔
    { x: 0.14, w: 0.04, h: 0.50 },
    { x: 0.18, w: 0.06, h: 0.40 },
    { x: 0.24, w: 0.03, h: 0.90 },  // 最高塔
    { x: 0.27, w: 0.05, h: 0.55 },
    { x: 0.32, w: 0.04, h: 0.65 },
    { x: 0.36, w: 0.03, h: 0.45 },
    { x: 0.39, w: 0.05, h: 0.35 },
    { x: 0.44, w: 0.02, h: 0.75 },
    { x: 0.46, w: 0.06, h: 0.50 },
    // 第二組城市（稍微變化）
    { x: 0.52, w: 0.04, h: 0.55 },
    { x: 0.56, w: 0.03, h: 0.80 },
    { x: 0.59, w: 0.05, h: 0.45 },
    { x: 0.64, w: 0.02, h: 0.70 },
    { x: 0.66, w: 0.04, h: 0.60 },
    { x: 0.70, w: 0.06, h: 0.38 },
    { x: 0.76, w: 0.03, h: 0.85 },
    { x: 0.79, w: 0.04, h: 0.50 },
    { x: 0.83, w: 0.05, h: 0.65 },
    { x: 0.88, w: 0.03, h: 0.42 },
    { x: 0.91, w: 0.04, h: 0.55 },
    { x: 0.95, w: 0.05, h: 0.48 },
  ];

  // 繪製建築剪影
  ctx.fillStyle = "#1a1a2e"; // 深藍黑色
  buildings.forEach(b => {
    const bx = b.x * _w;
    const bw = b.w * _w;
    const bh = b.h * skyH;
    ctx.fillRect(bx, baseY - bh, bw, bh);
  });

  // 少量窗戶光點
  ctx.fillStyle = "rgba(255, 220, 100, 0.6)";
  buildings.forEach(b => {
    if (b.h < 0.5) return; // 矮建築不加窗
    const bx = b.x * _w;
    const bw = b.w * _w;
    const bh = b.h * skyH;
    const cols = Math.max(1, Math.floor(bw / 8));
    const rows = Math.max(1, Math.floor(bh / 14));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // 隨機亮燈（用固定 seed 避免閃爍）
        if (((r * 7 + c * 13 + Math.floor(b.x * 100)) % 3) === 0) {
          const wx = bx + 4 + c * (bw - 8) / cols;
          const wy = baseY - bh + 6 + r * 14;
          ctx.fillRect(wx, wy, 4, 6);
        }
      }
    }
  });

  ctx.restore();
}
```

### 步驟 3：移除不再需要的圖片預載（選做）

檔案頂部 `const cityImg = new Image(); cityImg.src = "IMAGES/city_skyline.png";` 這行可以移除或註解掉，因為不再使用。如果擔心其他地方有引用，可以先保留。

## 驗證

1. `node -c js/games/helicopter-race.js` 語法檢查通過
2. 開啟遊戲，確認底部出現深色城市剪影
3. 剪影應完全無縫，沒有方塊邊界
4. 透明度低（0.25），看起來像淡淡的背景裝飾
5. 建築上有少量黃色窗戶光點
