/**
 * song-crypto.js — 用密碼解密 .enc 歌曲檔（對齊 tools/encrypt_song.py）。
 * 檔案結構：salt(16) || iv(12) || ciphertext(含GCM tag)。
 * PBKDF2-HMAC-SHA256 200000 次派生 AES-256-GCM 金鑰。
 */
const ITER = 200000;
export async function decryptSong(encBytes, password) {
  if (typeof password !== "string") throw new TypeError("password 必須是字串");
  const buf = new Uint8Array(encBytes);
  const salt = buf.slice(0, 16);
  const iv = buf.slice(16, 28);
  const ct = buf.slice(28);
  const baseKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" },
    baseKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );
  return await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
}
