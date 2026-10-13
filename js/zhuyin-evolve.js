// ===================== 注音小島：寵物進化演出（v7，docs/zhuyin-v7-plan.md §2.3；分身 P 2026-10-13）=====================
// 阿葉：「進化特效可以參考數碼寶貝的進化特效那樣，會旋轉，然後有一個酷炫特效進化音樂」
// 節奏（約 10 秒，第 8 秒爆開對齊進化曲高潮）：暗場、數位格線＋光帶 → 寵物浮起（蓄力）→ 越轉越快、變成發光剪影，旋轉光環＋數位碼雨，字幕「XX進化——」
//   → 白光爆開（震動、衝擊圈）→ 新外型亮相（背光放射、星星徽記、閃光、彩帶）→「閃耀XX！」橫幅 → 「太棒了」鈕。
// 做法：DOM＋CSS＋一張 canvas（背景的透視格線、光帶、注音碼雨），不開 three.js（iPad 不多開一個 WebGL）。樣式：css/zhuyin.css 最後「寵物進化演出」段。
// 這個檔不放任何畫面上的國字（字幕、名字、按鈕字都由 zhuyin.js 傳進來）→ 注音字典工具（tools/build_zhuyin_ui.py）不用多掃這個檔。
//
// playEvolve(opts) → Promise<{ skipped }>：按「太棒了」關掉時 resolve。
//   opts = { img 寵物 2D 圖, callText「XX進化——」, revealText「閃耀XX！」, okText 按鈕字, canSkip 第二次起可點一下跳過, reduce 減少動態,
//            ready: Promise（音效預載；最多等 1.2 秒才開始，暗場會先出來）, sfx(name), music(on) 進化曲開／停, say(text), confetti(host),
//            onDark() 畫面全黑蓋住之後呼叫（主程式把 3D 小島停掉省電）, host 掛在哪（預設 body） }
// 介面副作用：只在 host 裡加一個 .overlay.evo-ov（z-index 45，蓋住全部按鈕；結束自己移除），不碰其他畫面、不呼叫 nav。
// 測試：.evo-ov 的 data-phase＝dark→charge→rise→spin→sil→burst→reveal→done；data-skipped＝1 表示跳過了。

// 對齊進化曲（audio/bgm/evolve.mp3，22 秒不循環；manifest bgm.evolve.hitTime＝8.0）：音樂跟蓄力同時開始，第 8.0 秒是高潮爆開
// → 白光在 7.9 秒開始亮（0.12 秒到全白）＝8.0 秒全白，8.25 秒白光退開看到新外型。曲子換了 hitTime 要跟著改 HIT。
const HIT = 8000;
const TL = {   // 每一段開始的時間（毫秒，從暗場全黑、音樂開始算）
  full: { rise: 900, spin: 2300, sil: 4700, call: 4800, charge2: 5300, burst: HIT - 100, reveal: HIT + 250, banner: HIT + 750, ok: HIT + 2400 },
  calm: { rise: 800, spin: 1e9, sil: 3000, call: 3100, charge2: 1e9, burst: HIT - 100, reveal: HIT + 250, banner: HIT + 750, ok: HIT + 2400 },   // 減少動態：不轉、不震、沒有碼雨（時間照樣對齊音樂）
};
const SPIN0 = 0.5, SPIN1 = 7;          // 旋轉速度：一開始每秒 0.5 圈 → 爆開前每秒 7 圈（越轉越快）
const RAIN = "01ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒ<>/{}=+*#";   // 數位碼雨的字（注音符號＝這個遊戲的「資料」；畫在 canvas 上，不會被加注音）

const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const ease = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

export function playEvolve(opts = {}) {
  const o = { host: document.body, sfx() {}, music() {}, say() {}, confetti: null, onDark: null, ready: null, canSkip: false, reduce: false, ...opts };
  const T = o.reduce ? TL.calm : TL.full;
  return new Promise(resolve => {
    // ---------- 畫面 ----------
    const ov = h("div", "overlay evo-ov" + (o.reduce ? " calm" : "")); ov.dataset.phase = "dark";
    const cv = h("canvas", "evo-cv"), stage = h("div", "evo-stage");
    const rays = h("div", "evo-rays"), halo = h("div", "evo-halo"), ringA = h("div", "evo-ring a"), ringB = h("div", "evo-ring b"), wave = h("div", "evo-wave");
    const pet = h("div", "evo-pet"), img = h("img", "evo-img"), sil = h("img", "evo-sil"), badge = h("span", "evo-badge big");
    img.src = sil.src = o.img || ""; img.alt = sil.alt = ""; badge.appendChild(h("i"));
    pet.append(img, sil, badge);
    stage.append(rays, halo, ringB, pet, ringA, wave);
    const cap = h("div", "evo-cap"), banner = h("div", "evo-banner"), flash = h("div", "evo-flash"), cf = h("div", "cf-layer evo-cf"), sparks = h("div", "evo-sparks");
    const ok = h("button", "big-btn evo-ok", o.okText || "OK"), skip = h("div", "evo-skip", "⏭️");
    ov.append(cv, stage, sparks, cap, banner, flash, cf, ok);
    if (o.canSkip) ov.append(skip);
    (o.host || document.body).appendChild(ov);
    requestAnimationFrame(() => ov.classList.add("on"));   // 暗場淡入（0.6 秒）

    // ---------- 背景 canvas：透視格線（地板＋天花板）、光帶、注音碼雨 ----------
    const cx2 = cv.getContext("2d"); let W = 0, H = 0, dpr = 1, cols = [];
    const fit = () => {
      const r = ov.getBoundingClientRect(), d = Math.min(1.5, window.devicePixelRatio || 1);
      if (Math.abs(r.width - W) < 1 && Math.abs(r.height - H) < 1 && d === dpr) return;
      W = r.width; H = r.height; dpr = d; cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
      const fs = Math.max(12, Math.min(W, H) * 0.032), n = Math.ceil(W / (fs * 1.6));
      cols = Array.from({ length: n }, (_, i) => ({ x: (i + 0.5) * W / n, y: Math.random() * H * 1.5 - H * 0.5, v: 0.6 + Math.random() * 0.8, fs, on: Math.random() }));
    };
    const glyph = () => RAIN[Math.floor(Math.random() * RAIN.length)];
    function drawBg(t, k, warm) {   // k＝激烈程度 0..1；warm＝亮相後轉成金色
      fit(); const c = cx2; c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.globalCompositeOperation = "source-over";
      c.fillStyle = o.reduce ? "#050a1c" : `rgba(4,7,22,${0.26 + 0.1 * (1 - k)})`; c.fillRect(0, 0, W, H);   // 半透明蓋上一層＝殘影（碼雨拖尾）
      const col = warm ? [255, 214, 110] : [70, 235, 255], rgba = a => `rgba(${col[0]},${col[1]},${col[2]},${a.toFixed(3)})`;
      const sp = o.reduce ? 0 : (t / 1000) * (0.35 + 2.4 * k), cxp = W / 2;
      // 地板格線：往遠方收到地平線；橫線一條條往鏡頭跑（速度跟著 k）
      for (const [hz, dir, aMul] of [[H * 0.62, 1, 1], [H * 0.38, -1, 0.45]]) {
        const span = dir > 0 ? H - hz : hz;
        c.lineWidth = 1.2; c.strokeStyle = rgba(0.22 * aMul + 0.18 * k * aMul);
        c.beginPath();
        for (let i = -12; i <= 12; i++) { c.moveTo(cxp + i * W * 0.012, hz); c.lineTo(cxp + i * W * 0.16, hz + dir * span); }
        c.stroke();
        for (let j = 0; j < 12; j++) {
          const z = ((j + (sp % 1)) / 12), y = hz + dir * span * Math.pow(z, 2.2);
          c.strokeStyle = rgba((0.1 + 0.5 * z) * aMul * (0.6 + 0.6 * k)); c.lineWidth = 0.8 + 1.6 * z;
          c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
        }
      }
      // 光帶：三條彩色光柱橫向掃過（數碼寶貝進化的流動光）
      c.globalCompositeOperation = "lighter";
      const HUE = warm ? [[255, 200, 80], [255, 140, 60], [255, 240, 160]] : [[40, 220, 255], [190, 90, 255], [80, 255, 160]];
      for (let i = 0; i < 3; i++) {
        const u = o.reduce ? (i + 0.5) / 3 : ((t / 1000) * (0.08 + 0.22 * k) + i / 3) % 1, x = -W * 0.25 + u * W * 1.5, bw = W * (0.1 + 0.06 * i);
        const g = c.createLinearGradient(x - bw, 0, x + bw, 0), [r, gg, b] = HUE[i];
        g.addColorStop(0, `rgba(${r},${gg},${b},0)`); g.addColorStop(0.5, `rgba(${r},${gg},${b},${(0.07 + 0.13 * k).toFixed(3)})`); g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
        c.fillStyle = g; c.fillRect(x - bw, 0, bw * 2, H);
      }
      // 注音碼雨（減少動態：不下）
      if (!o.reduce && k > 0.05) {
        c.textAlign = "center"; c.textBaseline = "middle";
        for (const cl of cols) {
          if (cl.on > 0.35 + 0.6 * (1 - k)) continue;   // k 越大、越多條在下
          cl.y += cl.v * cl.fs * (0.25 + 0.9 * k);
          if (cl.y > H + cl.fs * 8) { cl.y = -Math.random() * H * 0.4; cl.on = Math.random(); }
          c.font = `bold ${cl.fs.toFixed(0)}px monospace`;
          c.fillStyle = "rgba(235,255,255,0.95)"; c.fillText(glyph(), cl.x, cl.y);
          c.fillStyle = rgba(0.55); c.fillText(glyph(), cl.x, cl.y - cl.fs * 1.1);
        }
      }
      c.globalCompositeOperation = "source-over";
    }

    // ---------- 時間軸 ----------
    let t0 = 0, raf = 0, closed = false, quiet = false, skipped = false, warm = false, angle = 0, ringAng = 0, last = 0, ev = 0;
    const S = fn => (...a) => { if (!quiet) try { fn(...a); } catch (e) {} };   // 跳過時：中間那些音效、語音不出（畫面狀態照樣套上）
    const sfx = S(o.sfx), say = S(o.say);
    const phase = p => { ov.dataset.phase = p; };
    const EVENTS = [
      { at: 0, fn: () => { phase("charge"); sfx("ev_charge"); if (!quiet) try { o.music(true); } catch (e) {} } },
      { at: T.rise, fn: () => { phase("rise"); stage.classList.add("rise"); } },
      { at: T.spin, fn: () => { phase("spin"); stage.classList.add("spin"); } },
      { at: T.sil, fn: () => { phase("sil"); pet.classList.add("sil"); } },
      { at: T.call, fn: () => { cap.textContent = o.callText || ""; cap.classList.add("on"); say(o.callText || ""); } },
      { at: T.charge2, fn: () => sfx("ev_charge", 1.26) },   // 第二段蓄力（高一點，更緊張）
      { at: T.burst, fn: () => {
        phase("burst"); sfx("ev_burst"); cap.classList.remove("on");
        flash.classList.remove("go"); void flash.offsetWidth; flash.classList.add("go");
        wave.classList.remove("go"); void wave.offsetWidth; wave.classList.add("go");
        stage.classList.remove("spin"); stage.classList.add("burst"); pet.classList.remove("sil"); pet.classList.add("new"); angle = 0;
        if (!o.reduce) try { ov.animate([{ transform: "none" }, { transform: "scale(1.05) translate(-1.6vmin,1vmin)" }, { transform: "scale(1.05) translate(1.4vmin,-1.2vmin)" }, { transform: "scale(1.03) translate(-0.8vmin,0.6vmin)" }, { transform: "none" }], { duration: 420 }); } catch (e) {}   // 放大一點再震：邊緣不會露出底下的小島
      } },
      { at: T.reveal, fn: () => {
        phase("reveal"); warm = true; stage.classList.add("reveal"); sfx("ev_sparkle");
        if (!quiet || skipped) burstSparks();
        if (o.confetti) try { o.confetti(cf); } catch (e) {}
      } },
      { at: T.banner, fn: () => { banner.textContent = o.revealText || ""; banner.classList.add("on"); say(o.revealText || ""); } },
      { at: T.ok, fn: () => { phase("done"); ok.classList.add("on"); skip.remove(); } },
    ].sort((a, b) => a.at - b.at);   // 減少動態的「不轉」＝時間 1e9：排到最後（永遠不會到）
    function burstSparks() {   // 亮相：一圈閃光往外飛
      const n = o.reduce ? 8 : 18;
      for (let i = 0; i < n; i++) {
        const s = h("i", "evo-spark", i % 3 ? "✦" : "✨"), a = (i / n) * Math.PI * 2 + Math.random() * 0.3, d = 22 + Math.random() * 16;
        s.style.setProperty("--dx", (Math.cos(a) * d).toFixed(1) + "vmin"); s.style.setProperty("--dy", (Math.sin(a) * d * 0.8).toFixed(1) + "vmin");
        s.style.animationDelay = (Math.random() * 0.25).toFixed(2) + "s"; sparks.appendChild(s); setTimeout(() => s.remove(), 1800);
      }
    }
    function intensity(t) {   // 背景激烈程度：蓄力慢慢上來、旋轉時最大、亮相後平靜一點
      if (t < T.rise) return 0.15 + 0.15 * (t / T.rise);
      if (t < T.burst) return 0.3 + 0.7 * ease((t - T.rise) / (T.burst - T.rise));
      return Math.max(0.35, 1 - (t - T.burst) / 1600);
    }
    function frame(now) {
      if (closed) return;
      const t = now - t0, dt = Math.min(0.05, Math.max(0, (now - (last || now)) / 1000)); last = now;
      while (ev < EVENTS.length && t >= EVENTS[ev].at) EVENTS[ev++].fn();
      drawBg(t, intensity(t), warm);
      // 寵物：浮起＋上下輕晃；旋轉（rotateY）越轉越快：角速度 ω＝SPIN0＋(SPIN1−SPIN0)·u²
      const up = ease((t - T.rise) / 900) * (o.reduce ? 4 : 8), bob = t > T.rise ? Math.sin(t / 380) * (o.reduce ? 0.5 : 1) : 0;
      if (!o.reduce && t >= T.spin && t < T.burst) { const u = (t - T.spin) / (T.burst - T.spin); angle += (SPIN0 + (SPIN1 - SPIN0) * u * u) * 360 * dt; }
      const grow = t < T.burst ? 1 + 0.08 * ease((t - T.rise) / (T.burst - T.rise)) : 1.22;
      pet.style.transform = `translateY(${(-up + bob).toFixed(2)}vmin) rotateY(${(angle % 360).toFixed(1)}deg) scale(${grow.toFixed(3)})`;
      // 光環：兩圈斜放的橢圓，跟著越轉越快（反方向）
      const rs = t < T.spin ? 40 : t < T.burst ? 40 + 900 * ((t - T.spin) / (T.burst - T.spin)) ** 2 : 30;
      ringAng += rs * dt * (o.reduce ? 0.3 : 1);
      ringA.style.transform = `translate(-50%,-50%) rotateX(72deg) rotateZ(${ringAng.toFixed(1)}deg)`;
      ringB.style.transform = `translate(-50%,-50%) rotateX(68deg) rotateY(14deg) rotateZ(${(-ringAng * 1.3).toFixed(1)}deg)`;
      raf = requestAnimationFrame(frame);
    }
    function doSkip(e) {   // 第二次起：點一下＝直接跳到白光爆開
      if (!o.canSkip || skipped || closed || !t0) return;
      const t = performance.now() - t0; if (t >= T.burst - 150) return;
      if (e) { e.preventDefault(); e.stopPropagation(); }
      skipped = true; ov.dataset.skipped = "1";
      try { o.music(false); } catch (err) {}
      quiet = true; t0 = performance.now() - (T.burst - 120);
      while (ev < EVENTS.length && EVENTS[ev].at < T.burst - 120) EVENTS[ev++].fn();   // 中間的畫面狀態照樣套上（不出聲）
      quiet = false; cap.classList.remove("on");
    }
    function close() {
      if (closed) return; closed = true; cancelAnimationFrame(raf);
      try { o.music(false); } catch (e) {}
      ov.classList.add("out"); setTimeout(() => { ov.remove(); resolve({ skipped }); }, 350);
    }
    ok.addEventListener("click", e => { e.stopPropagation(); if (ok.classList.contains("on")) close(); });
    ov.addEventListener("pointerdown", e => { if (e.target !== ok) doSkip(e); });

    // 暗場先出來；音效最多等 1.2 秒（主程式已經在選單時預載過，通常馬上好）→ 全黑後停掉 3D 小島 → 開始
    const go = () => {
      if (closed) return;
      if (o.onDark) try { o.onDark(); } catch (e) {}
      t0 = performance.now(); last = 0; raf = requestAnimationFrame(frame);
    };
    const born = performance.now();   // 暗場淡入至少 0.65 秒才開始（不然一開場就閃）
    Promise.race([Promise.resolve(o.ready).catch(() => {}), new Promise(r => setTimeout(r, 1200))]).then(() => setTimeout(go, Math.max(0, 650 - (performance.now() - born))));
  });
}
