// 注音小島 v8 唱片行「我的歌」：阿葉指定的歌（YouTube 音訊，自己家裡用），每首一張唱片。
// 11-03 阿葉「選擇每一個唱片只要播放該歌曲的副歌」→ audio/songs/<id>.bin 只剩副歌那一段（約 30～40 秒）：
//   tools/audio/build_mysongs.py 剪副歌、對齊 -18 LUFS、轉 mp3 後用 AES-GCM 加密（網站公開，不放能直接聽的 mp3）。
// 播的時候才下載＋解密成 blob 網址（唱片牆一打開就全部先抓：一首約 0.5MB），交給音訊引擎用 <audio> 串流（js/zhuyin-audio.js addStream）。
// 密碼不是秘密，只是讓檔案不能直接播；跟 build_mysongs.py 的 PW 一樣。加歌：兩邊同 id 各加一筆、重跑 build_mysongs.py。
import { decryptSong } from "./song-crypto.js";

const PW = "zy-island-songs";
const V = "2";                                    // 換歌檔內容時升這個（破 GitHub Pages 快取）；11-03 改成副歌片段＝2
// bgm＝音訊引擎認的鍵（"my:"＋id）；by＝唱片牆名字下面那行小字
export const MY_SONGS = [
  { id: "my_soyeon", name: "SOYEON", by: "소연", e: "💼", color: "#ff8fb1" },   // 〈퇴사할게여〉＝「我要辭職囉」→ 公事包
  { id: "my_ateez", name: "BAD", by: "ATEEZ", e: "🏴‍☠️", color: "#ff6f6f" },   // ATEEZ 的招牌是海盜船長 → 海盜旗
  { id: "my_jay", name: "女兒殿下", by: "周杰倫", e: "👑", color: "#ffd166" },
  { id: "my_hero", name: "英雄爸爸", by: "愛好好聽", e: "🦸‍♂️", color: "#5fb4ff" },   // 英雄爸爸 → 男超人
  { id: "my_eyes", name: "看著我的眼睛說", by: "張遠", e: "👀", color: "#c79bff" },   // 11-01 阿葉加的第 5 首
  { id: "my_smile", name: "你笑起來真好看", by: "萌妞贊隊", e: "😊", color: "#ffb36b" },   // 11-03 阿葉加
  { id: "my_maruko", name: "稍息立正站好", by: "櫻桃小丸子", e: "🍒", color: "#ff7a8a" },   // 11-03 阿葉加：櫻桃小丸子主題曲中文版（只要歌的部分）
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
// 主程式開頁時呼叫一次：每首登記成可以 playBgm("my:xxx") 的歌
// loop:false：阿葉 11-01「放完之後就變成原本遊戲的背景音樂」→ 副歌放一次，放完唱片行收掉、換回原本的小島音樂；resume:false＝每次都從副歌開頭放
export function registerSongs(A) { if (A && A.addStream) for (const s of MY_SONGS) A.addStream(s.bgm, () => songUrl(s), { loop: false, resume: false }); }
