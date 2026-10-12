// ===================== 注音小島：詞句小偵探 題庫 =====================
// 一題一行（tools/voice/build_lines.py 用正規表示式讀這個檔，格式請照抄）：
//   { id: "英數字代號", say: "要念的句子", options: ["正確（＝say）", "錯1", "錯2"], enabled: true },
// - say 一定要跟 options[0] 完全一樣（念的就是正確答案）；畫面上三張卡的位置每題隨機，跟這裡的順序無關。
// - 錯誤選項：換一個詞、相近的字、或調換順序；長度盡量一樣；不能只差標點、也不能只差「念起來一樣」的字
//   （tools/zy-test/detective.js 會用注音字典檢查三個選項念起來都不同）。
// - 關鍵詞（答對後高亮的字）預設自動算：正確句子裡跟錯誤選項不同的字。要自己指定就加
//   keys: [[0, 位置, 位置…]]（0＝正確選項；位置從 0 開始數，標點也算一格）。
// - br: 數字（選填）＝句子太長要換成兩行時，從第幾個字（從 0 數）開始換第二行；三張卡用同一個斷點。沒寫就自動找中間。寫在 enabled 後面（build_lines.py 的格式不變）。
// - enabled: false ＝候選草稿，不會出題（docs/zhuyin-detective-bank-draft.md 給阿葉確認）。
// - 新增或改句子後要做三件事：
//   1. PYTHONIOENCODING=utf-8 python tools/build_zhuyin_ui.py（國字注音）
//   2. python tools/voice/build_lines.py（登記配音；enabled 的題目句才會登記）→ 主對話跑 gen_batch.py 錄音
//   3. node tools/zy-test/detective.js（題庫檢查＋整套測試）
// 歌詞只放一句短句、不放原唱錄音；新歌詞要先給阿葉確認。

export const BANK = [
  // ---- 第一版（阿葉 10-12 交辦）----
  { id: "smile", say: "你笑起來真好看", options: ["你笑起來真好看", "你看起來真好笑", "你笑起來真好笑"], enabled: true },
  { id: "eyes", say: "你看著我的眼睛說", options: ["你看著我的眼睛說", "你看著我的眼睛唱", "你看著我的眼神說"], enabled: true },

  { id: "rice", say: "我愛你愛著你就像老鼠愛大米", options: ["我愛你愛著你就像老鼠愛大米", "我愛你愛著你就像老虎愛大米", "我愛你愛著你就像老鼠愛小米"], enabled: true, br: 6 },   // 阿葉 10-12 早上新增

  // ---- 傳統兒歌短句（10-12 阿葉「你自己決定」→ Claude 檢查都是傳統童謠的一句、只念不唱，全部啟用）----
  { id: "tiger", say: "兩隻老虎跑得快", options: ["兩隻老虎跑得快", "兩隻老鼠跑得快", "兩隻老虎跑得慢"], enabled: true },
  { id: "star", say: "滿天都是小星星", options: ["滿天都是小星星", "滿地都是小星星", "滿天都是大星星"], enabled: true },
  { id: "mouse", say: "小老鼠上燈台", options: ["小老鼠上燈台", "小老虎上燈台", "小老鼠下燈台"], enabled: true },
  { id: "hill", say: "上山打老虎", options: ["上山打老虎", "下山打老虎", "上山找老虎"], enabled: true },
  { id: "bridge", say: "倫敦鐵橋垮下來", options: ["倫敦鐵橋垮下來", "倫敦木橋垮下來", "倫敦鐵橋站起來"], enabled: true },
  { id: "farm", say: "王老先生有塊地", options: ["王老先生有塊地", "王老先生有塊糖", "王老太太有塊地"], enabled: true },
  { id: "pedicab", say: "三輪車跑得快", options: ["三輪車跑得快", "四輪車跑得快", "三輪車飛得快"], enabled: true },
  { id: "body", say: "頭兒肩膀膝腳趾", options: ["頭兒肩膀膝腳趾", "頭兒肚子膝腳趾", "頭兒肩膀手腳趾"], enabled: true },
  { id: "bday", say: "祝你生日快樂", options: ["祝你生日快樂", "祝我生日快樂", "祝你天天快樂"], enabled: true },
  { id: "happy", say: "如果你很快樂", options: ["如果你很快樂", "如果你很生氣", "如果我很快樂"], enabled: true },
];
