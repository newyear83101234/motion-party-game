/**
 * fps-counter.js — 即時 FPS 計數器
 * 追蹤幀率並定期更新顯示
 */

export class FPSCounter {
  /**
   * @param {HTMLElement} displayEl - 顯示 FPS 的 DOM 元素
   * @param {number} updateInterval - 更新顯示的間隔（毫秒）
   */
  constructor(displayEl, updateInterval = 500) {
    this.displayEl = displayEl;
    this.updateInterval = updateInterval;
    this.frames = [];
    this.lastUpdate = 0;
  }

  /**
   * 每幀呼叫，記錄時間戳並更新顯示
   * @param {number} timestamp - requestAnimationFrame 時間戳
   */
  tick(timestamp) {
    this.frames.push(timestamp);

    // 只保留最近 120 幀
    if (this.frames.length > 120) {
      this.frames.shift();
    }

    // 定期更新 DOM 顯示
    if (timestamp - this.lastUpdate >= this.updateInterval) {
      this.lastUpdate = timestamp;
      const fps = this.getFPS();
      this.displayEl.textContent = `FPS: ${fps}`;

      // FPS 低於 20 時變紅色警示
      this.displayEl.style.color =
        fps < 20 ? "rgba(255, 60, 60, 0.9)" : "rgba(0, 255, 0, 0.7)";
    }
  }

  /**
   * 計算當前 FPS
   * @returns {number}
   */
  getFPS() {
    if (this.frames.length < 2) return 0;
    const elapsed = this.frames[this.frames.length - 1] - this.frames[0];
    if (elapsed === 0) return 0;
    return Math.round(((this.frames.length - 1) / elapsed) * 1000);
  }
}
