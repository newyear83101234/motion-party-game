// 注音小島 v8 唱片行「我的歌」：阿葉 11-01 指定的整首歌（YouTube 音訊，自己家裡用），每首一張唱片。
// 檔案在 audio/songs/<id>.bin：tools/audio/build_mysongs.py 剪頭尾空白、對齊 -18 LUFS、轉 mp3 後用 AES-GCM 加密（網站公開，不放能直接聽的 mp3）。
// 播的時候才下載＋解密成 blob 網址，交給音訊引擎用 <audio> 串流（js/zhuyin-audio.js addStream；整首解碼成 AudioBuffer 一首 70–80MB，iPad 撐不住）。
// 密碼不是秘密，只是讓檔案不能直接播；跟 build_mysongs.py 的 PW 一樣。加歌：兩邊同 id 各加一筆、重跑 build_mysongs.py。
import { decryptSong } from "./song-crypto.js";

const PW = "zy-island-songs";
const V = "1";                                    // 換歌檔內容時升這個（破 GitHub Pages 快取）
// bgm＝音訊引擎認的鍵（"my:"＋id）；by＝唱片牆名字下面那行小字
export const MY_SONGS = [
  { id: "my_soyeon", name: "SOYEON", by: "소연", e: "🎤", color: "#ff8fb1" },
  { id: "my_ateez", name: "BAD", by: "ATEEZ", e: "🔥", color: "#ff6f6f" },
  { id: "my_jay", name: "女兒殿下", by: "周杰倫", e: "👑", color: "#ffd166" },
  { id: "my_hero", name: "英雄爸爸", by: "愛好好聽", e: "🦸", color: "#5fb4ff" },
].map(s => ({ ...s, bgm: "my:" + s.id }));

const urls = new Map();
function songUrl(s) {
  if (!urls.has(s.id)) {
    const p = fetch(new URL(`../audio/songs/${s.id}.bin?v=${V}`, import.meta.url)).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
      .then(ab => decryptSong(ab, PW)).then(buf => URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" })));
    p.catch(() => urls.delete(s.id));               // 失敗（斷網）下次再試
    urls.set(s.id, p);
  }
  return urls.get(s.id);
}
// 主程式開頁時呼叫一次：每首登記成可以 playBgm("my:xxx") 的整首歌
export function registerSongs(A) { if (A && A.addStream) for (const s of MY_SONGS) A.addStream(s.bgm, () => songUrl(s)); }
