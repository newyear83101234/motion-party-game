/**
 * camera.js — 前置鏡頭管理模組
 * （沿用自舊專案 party game，已驗證可用，不需修改）
 * 負責開啟前置鏡頭並回傳 video 元素
 */

/**
 * 開啟前置鏡頭
 * 注意：iOS Safari 一定要在「使用者點擊之後」才能呼叫，否則會被擋。
 * @param {HTMLVideoElement} videoEl - video 元素
 * @param {number} width - 期望解析度寬度
 * @param {number} height - 期望解析度高度
 * @returns {Promise<HTMLVideoElement>} 已就緒的 video 元素
 */
export async function startCamera(videoEl, width = 640, height = 480) {
  const constraints = {
    video: {
      facingMode: "user", // 前置鏡頭
      width: { ideal: width },
      height: { ideal: height },
    },
    audio: false,
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  videoEl.srcObject = stream;

  // 等待 video 真正可播放
  return new Promise((resolve) => {
    videoEl.onloadeddata = () => {
      videoEl.play();
      resolve(videoEl);
    };
  });
}
