// ===================== 注音小島：泡泡救援灣（泡泡龍玩法） =====================
// 小企鵝被泡泡困住，從下面發射注音泡泡；三顆以上相同符號連在一起就破掉，
// 跟天花板斷開的泡泡整片掉下來（企鵝掉下來＝救出）。救完這關所有企鵝就過關，不用清空。
// 給 5 歲小孩自己玩：沒有倒數、發射次數不限；大人的樂趣是找「支撐點」一發清一大片。
// v6（10-13）：第 4 區（31～40 關 ㄐㄑㄒ）起「天花板下壓」：每 N 發整片往下降一排（關卡的 drop＝N；天花板上的小燈每發熄一顆，
//   剩最後一顆時天花板輕輕抖），碰到底線＝這關重來（跟滿盤一樣）；第 5 區（41～50 關 ㄓㄔㄕㄖ）再加「石頭泡泡」（不會被同色消掉，只能跟天花板斷開掉下來）。
//   Boss 模式（爬塔用，主程式 playBubbleBoss）：碰到底線不重來 → api.onPress()、整片往上退 2 排、接著玩；不給星星。
//
// 介面（主程式照這個接）：
//   createBubbleGame(root, api) → { start(i, { drop, boss }?), stop(), sayCurrent(), relayout(), state(), debug }
//   api：say talk play later paused onWin onFull onPress（Boss）animalImgs（＋測試用可選 seed）
//
// 座標：泡泡半徑＝1 單位。場地寬 16 單位，偶數列 8 格、奇數列 7 格（往右移半格），列距 √3。
// 預測＝實際：瞄準線、示範、求解器、真正發射，全部用同一支 trace()＋resolve()。

// 全部會出現在泡泡上的符號（格子裡存的是這張表的編號；ㄅㄆㄇ 維持 0、1、2，舊關卡與存檔不受影響）
export const SYMS = ["ㄅ", "ㄆ", "ㄇ", "ㄉ", "ㄊ", "ㄋ", "ㄌ", "ㄍ", "ㄎ", "ㄏ", "ㄐ", "ㄑ", "ㄒ", "ㄓ", "ㄔ", "ㄕ", "ㄖ"];
// 每個符號固定一個顏色（CSS 的 .s0～.s8）：ㄅ紅 ㄆ藍 ㄇ黃 ㄉ橘 ㄊ天藍 ㄋ綠 ㄌ粉 ㄍ紫 ㄎ橘 ㄏ綠｜ㄐ紅 ㄑ天藍 ㄒ黃｜ㄓ紫 ㄔ黃 ㄕ青綠 ㄖ紅
// （同一區裡色相、亮度都拉開；符號字本身印在泡泡上，顏色只是幫忙）
const SYM_COLOR = [0, 1, 2, 3, 4, 5, 6, 7, 3, 5, 0, 4, 2, 7, 2, 8, 0];
// 五個區（每區 10 關）：符號、救的動物（名字＋圖的鍵，圖路徑由主程式的 api.animalImgs 給）
export const ZONES = [
  { syms: "ㄅㄆㄇ", key: "penguin", name: "小企鵝" },
  { syms: "ㄉㄊㄋㄌ", key: "crab", name: "小螃蟹" },
  { syms: "ㄍㄎㄏ", key: "whale", name: "小鯨魚" },
  { syms: "ㄐㄑㄒ", key: "elephant", name: "小象" },        // v6 第 4 區：天花板下壓（象＝ㄒㄧㄤˋ）
  { syms: "ㄓㄔㄕㄖ", key: "lion", name: "小獅子" },       // v6 第 5 區：下壓＋石頭泡泡（獅＝ㄕ）
];
export const LEVELS_PER_ZONE = 10;

// ---------- 關卡：'1'～'4' ＝這一關符號組的第幾個（預設用該區的符號：第 1 區 ㄅ紅 ㄆ藍 ㄇ黃）'A' 被困的動物 'X' 石頭泡泡 '.' 空；奇數列前面的空白只是排版 ----------
// 每關可以另外寫 syms:"ㄊㄋㄌ"（這一關自己的符號組，3 或 4 個）；沒寫就用該區的 ZONES[].syms。
// q＝開場的「目前這顆／下一顆」（教學關固定，之後隨機）。par 由 tools/zy-test/bubble.js 的求解器驗證過（含天花板下壓）。
// drop＝每幾發天花板降一排（0／沒寫＝不降）；teach＝教學關（閒置 4 秒出示範，同前 3 關）。
export const LEVELS = [
  { par: 2, q: "13", rows: [            // 1：一對ㄅ抱著企鵝 → 補一顆ㄅ就破（求解 1 發）
    "33.11.33",
    " ...A...",
  ] },
  { par: 2, q: "13", rows: [            // 2：打掉上面那對ㄅ，下面整串掉下來（1 發）
    "33.11.33",
    " ...3...",
    "...A....",
  ] },
  { par: 2, q: "31", rows: [            // 3：開場拿到ㄇ沒用 → 教「點泡泡換一顆」（1 發）
    "3..11..3",
    " ...3...",
    "...1....",
    " ..A....",
  ] },
  { par: 4, q: "12", rows: [            // 4：三種符號、兩隻企鵝各被一對抱著（中位 2 發）
    "11.22.33",
    " A.1.3.A",
    "2......2",
  ] },
  { par: 4, rows: [                     // 5：左右兩串，各打掉最上面那對整串掉（中位 2）
    "11....22",
    " 3....3.",
    "2A....A1",
    " 3....3.",
  ] },
  { par: 4, rows: [                     // 6：企鵝卡在天花板邊，要先湊對（中位 2）
    "12.12.12",
    " 3A2.1A3",
    "123..312",
    " .1...2.",
  ] },
  { par: 4, rows: [                     // 7：吊燈——一大團只靠右上一小撮ㄆ掛著（中位 2，一發掉 18 顆）
    "....22..",
    " ...2...",
    "2312....",
    " 1A31...",
    "23123...",
    " 12A1...",
    "2312....",
  ] },
  { par: 3, rows: [                     // 8：大吊燈，支撐點在左上，要靠左牆反彈（中位 2，一發掉 22 顆）
    ".11.....",
    " ..1....",
    "...31231",
    " ..12312",
    "...3A231",
    " ..12A1.",
    "..2312..",
    " ..1....",
  ] },
  { par: 4, rows: [                     // 9：兩盞吊燈、三隻企鵝，正上方那一格同時碰到兩個支撐點（中位 3）
    "..3322..",
    " .3...2.",
    "12....12",
    " 3A...A3",
    "123..312",
    " 3A...2.",
    "12....1.",
  ] },
  { par: 5, rows: [                     // 10：城堡掛在兩條繩子上，兩邊都剪斷才整座掉（中位 3）
    "22....11",
    " 2.....1",
    ".312312.",
    " .2A1A3.",
    "..1231..",
    " ..3A2..",
    "...23...",
  ] },

  // ===== 第 2 區（11～20 關）：ㄉ ㄊ ㄋ ㄌ，救小螃蟹。'1'ㄉ '2'ㄊ '3'ㄋ '4'ㄌ（橘／天藍／綠／粉）。11～13 關三種、14 關起四種 =====
  // 15、19、20 關和第 3 區 23、25～30 關的盤面是程式產生後用求解器挑難度的；其餘手排
  { par: 2, q: "12", rows: [            // 11：一對ㄉ抱著螃蟹，補一顆ㄉ就破
    "33.11.22",
    " ...A...",
  ] },
  { par: 2, q: "13", rows: [            // 12：打掉上面那對，下面整串掉下來
    "33.11.22",
    " ...3...",
    "...A....",
  ] },
  { par: 2, q: "31", rows: [            // 13：開場拿到ㄋ沒用，點泡泡換一顆
    "2..11..3",
    " ...3...",
    "...1....",
    " ..A....",
  ] },
  { par: 5, q: "12", rows: [            // 14：第一次出現ㄌ（先當路人）；兩隻螃蟹各被一對抱著
    "11.22.33",
    " A.1.3.A",
    "4......4",
  ] },
  { par: 4, rows: [            // 15：四種符號擠在一起，螃蟹藏在中間
    ".224....",
    " 1412...",
    "1.42331.",
    " 311..43",
    "..A3.A43",
    " .42443.",
  ] },
  { par: 4, rows: [            // 16：大吊燈，支撐點在左上，要靠左牆反彈
    ".11.....",
    " ..1....",
    "...41231",
    " ..12412",
    "...4A231",
    " ..12A1.",
    "..2412..",
    " ..1....",
  ] },
  { par: 5, rows: [            // 17：左右兩串，各打掉最上面那對整串掉
    "11....22",
    " 4....4.",
    "2A....A1",
    " 3....3.",
  ] },
  { par: 5, rows: [            // 18：吊燈：一大團只靠右上一小撮掛著
    "....22..",
    " ...2...",
    "2312....",
    " 1A41...",
    "23123...",
    " 12A1...",
    "2412....",
  ] },
  { par: 7, rows: [            // 19：三隻螃蟹散在四種符號裡
    "..321...",
    " .3213..",
    ".21A321.",
    " 2141214",
    "3A221A23",
    " ..132..",
    "..1324..",
  ] },
  { par: 8, rows: [            // 20：大城堡：四種符號、三隻螃蟹
    ".11.....",
    " 443....",
    "231122..",
    " 1324432",
    "A21.3232",
    " 41A43.1",
    "14.22.A1",
    " 121.443",
  ] },

  // ===== 第 3 區（21～30 關）：ㄍ ㄎ ㄏ，救小鯨魚。'1'ㄍ '2'ㄎ '3'ㄏ（紫／橘／綠；三種符號，但盤面越來越高、動物越來越多） =====
  { par: 2, q: "21", rows: [            // 21：一對ㄎ抱著鯨魚
    "33.22.11",
    " ...A...",
  ] },
  { par: 2, q: "32", rows: [            // 22：打掉那對，下面整串掉
    "11.33.11",
    " ...2...",
    "...A....",
  ] },
  { par: 3, rows: [            // 23：小吊燈，兩隻鯨魚
    ".....311",
    " ....322",
    "....2113",
    " ...2A32",
    "...11.21",
    " ..3A23.",
  ] },
  { par: 4, q: "23", rows: [            // 24：兩隻鯨魚各被一對抱著
    "22.33.11",
    " A.2.1.A",
    "3......3",
  ] },
  { par: 5, rows: [            // 25：三隻鯨魚，上面只靠一小撮
    "..311...",
    " .323A..",
    ".12122..",
    " 21A1A..",
    "123231..",
    " 1....1.",
    ".2....2.",
  ] },
  { par: 6, rows: [            // 26：七排，兩隻鯨魚藏在中間
    "223.....",
    " 131....",
    "2121....",
    " A3231..",
    "211.A33.",
    " 322321.",
    ".31.1332",
  ] },
  { par: 6, rows: [            // 27：八排，三隻鯨魚，右邊懸著
    "....223.",
    " ...1.31",
    "...13123",
    " ..322.A",
    "..A1331.",
    " .221A1.",
    ".1.332..",
    " 1322...",
  ] },
  { par: 6, rows: [            // 28：八排大團，三隻鯨魚
    "112.....",
    " .A1....",
    ".13A31..",
    " 1322133",
    "22113221",
    " 133.313",
    "1A..1.31",
    " ....1.2",
  ] },
  { par: 7, rows: [            // 29：九排，四隻鯨魚
    ".....223",
    " ....331",
    "....1212",
    " ...1332",
    "...3211A",
    " ..31A32",
    "..121312",
    " .3A.213",
    "..311.A1",
  ] },
  { par: 8, rows: [            // 30：最後一關：九排、四隻鯨魚
    ".....133",
    " ....12A",
    "....2311",
    " ...1.32",
    "....32.2",
    " ...32A1",
    "...1A312",
    " ..2.2.3",
    "..11A1.3",
  ] },
  // ===== v6 第 4 區（31～40 關）：ㄐ ㄑ ㄒ，救小象。'1'ㄐ '2'ㄑ '3'ㄒ（紅／天藍／黃）。天花板下壓：31 關 3 發、32 關 4 發（教學），33～35 關 8 發、36～40 關 7 發 =====
  // 盤面是程式隨機產生後、用求解器（含下壓）照難度挑的；par＝求解器 75 百分位（比前三區緊，教學關可多 1）
  { par: 3, drop: 3, teach: true, rows: [ // 31：第一次天花板下壓（3 發降一排，小燈示範）（求解器 2/3/3/5）
    "..2131..",
    " ...22.3",
    "..A11312",
    " ..322.2",
  ] },
  { par: 4, drop: 4, rows: [             // 32：兩隻小象，4 發降一排（求解器 2/3/4/5）
    ".22.13..",
    " 11.3A..",
    ".221322.",
    " 3312131",
    "1..213A.",
  ] },
  { par: 4, drop: 8, rows: [             // 33：起 8 發降一排（求解器 2/3/4/6）
    "..312.33",
    " .323321",
    "31123212",
    " 31221A2",
    "2..3123A",
  ] },
  { par: 5, drop: 8, rows: [             // 34：兩隻小象藏在中間（求解器 3/4/5/6）
    ".1222...",
    " .31131.",
    "12A12...",
    " 12..1.3",
    "2313132A",
    " 23.2232",
  ] },
  { par: 5, drop: 8, rows: [             // 35：七排、三隻（求解器 3/4/5/7）
    ".123112.",
    " 2132..3",
    "33213213",
    " 2A2.3A1",
    "11232123",
    " 2A13123",
    "2.22.31.",
  ] },
  { par: 6, drop: 7, rows: [             // 36：起 7 發降一排（求解器 3/5/6/8）
    "..3311..",
    " 1123221",
    "32..A13.",
    " 1232231",
    "12131112",
    " 231A.A2",
    "13.2113.",
  ] },
  { par: 6, drop: 7, rows: [             // 37：八排、三隻（求解器 4/5/6/9）
    "...32...",
    " ..2321.",
    ".21131.1",
    " 1222322",
    "12.31113",
    " A.3A223",
    "13123A3.",
    " 21311.1",
  ] },
  { par: 7, drop: 7, rows: [             // 38：八排、四隻（求解器 4/6/7/10）
    ".21331..",
    " .321212",
    "1.312323",
    " 321A1.1",
    "2133133.",
    " 321.21.",
    "A.12121.",
    " .A33A33",
  ] },
  { par: 8, drop: 7, rows: [             // 39：九排、四隻（求解器 4/6/8/10）
    ".3.23...",
    " ..3213.",
    ".1..1...",
    " 2.3A22.",
    ".22313.1",
    " 31223A2",
    "A13A1211",
    " 21321.2",
    ".2113213",
  ] },
  { par: 9, drop: 7, rows: [             // 40：九排、五隻（求解器 5/7/9/12）
    ".2.2....",
    " ..2323.",
    ".2113A11",
    " .33A1.3",
    "..113.23",
    " .332232",
    "..2.13..",
    " A131...",
    ".2A233A.",
  ] },

  // ===== v6 第 5 區（41～50 關）：ㄓ ㄔ ㄕ ㄖ，救小獅子。'1'ㄓ '2'ㄔ '3'ㄕ '4'ㄖ（紫／黃／青綠／紅）、'X' 石頭泡泡。下壓 41～45 關 7 發、46～50 關 6 發 =====
  { par: 2, drop: 7, teach: true, q: "12", rows: [   // 41：第一次出現石頭——石頭籠子只掛在一對ㄓ下面，補一顆ㄓ整個籠子掉下來（求解器 1 發）
    "2..11..3",
    " .XXX...",
    "..XAX...",
    " ..XX...",
  ] },
  { par: 4, drop: 7, rows: [             // 42：四種符號＋石頭（求解器 2/3/4/8）
    "33244...",
    " 4XA1...",
    "X2.32...",
    " 32.....",
    "244A2...",
  ] },
  { par: 5, drop: 7, rows: [             // 43（求解器 2/3/5/9）
    ".42.....",
    " 4.213..",
    "3141....",
    " 133X4..",
    "3AX1XA1.",
    " 433.4.1",
  ] },
  { par: 6, drop: 7, rows: [             // 44：三隻小獅子（求解器 3/4/6/8）
    "422.....",
    " .4133.4",
    ".314214.",
    " 324.4XA",
    "11XA14..",
    " 23X31A4",
    "234.4322",
  ] },
  { par: 7, drop: 7, rows: [             // 45：七排大團（求解器 3/5/7/11）
    ".4422.3.",
    " .131323",
    "24214AX2",
    " 412434.",
    "1.A.13X4",
    " 3.314AX",
    "311.4X23",
  ] },
  { par: 8, drop: 6, rows: [             // 46：起 6 發降一排（求解器 2/6/8/13）
    "..44..44",
    " 4233233",
    ".2121214",
    " 1344343",
    "X13X314.",
    " AXA2241",
    "34.4331.",
    " 311AX4.",
  ] },
  { par: 9, drop: 6, rows: [             // 47：四隻、石頭擋路（求解器 5/7/9/15）
    ".34.....",
    " 24.....",
    ".XA22...",
    " ..433..",
    "..12243.",
    " .A3X.2.",
    ".3X3A42.",
    " 3XAX243",
  ] },
  { par: 10, drop: 6, rows: [            // 48：九排、四隻（求解器 4/8/10/13）
    "..1442.1",
    " ...1X2.",
    "....XX..",
    " ...A431",
    "....4.XA",
    " ..14211",
    ".A312X34",
    " 4324A31",
    "34.24.1.",
  ] },
  { par: 11, drop: 6, rows: [            // 49：九排、四隻、石頭最多（求解器 3/6/11/20）
    "...32...",
    " ..31241",
    ".312X321",
    " 4X4AXAX",
    ".X124..3",
    " 13.413A",
    ".3114132",
    " 243XA.2",
    "321241..",
  ] },
  { par: 12, drop: 6, rows: [            // 50：最後一關：十排、五隻小獅子（求解器 4/11/12/20）
    ".22.....",
    " ..21...",
    "..442...",
    " ..1.3..",
    ".22423..",
    " .4XAX..",
    "..A.1...",
    " ..422X1",
    ".43A.XX2",
    " .22XA1A",
  ] },
];

LEVELS.forEach((d, i) => { d.zone = Math.floor(i / LEVELS_PER_ZONE); if (!d.syms) d.syms = ZONES[d.zone].syms; });

// ---------- 幾何常數 ----------
const PEN = 99, STONE = 98, NONE = -1;    // 格子的值：0～16 是符號編號、PEN＝被困的動物、STONE＝石頭泡泡（不會被消掉，只會掉下來）
const ROWS = 12;                         // 第 0～11 列可以放；停在第 12 列＝碰到底線
const MAXR = 14;                         // 模擬列數上限（含底線下面那一列）
const RH = Math.sqrt(3);
const COLL = 1.7;                        // 飛行碰撞距離（< 2：泡泡比較好鑽進縫）
const DEAD_Y = 1 + (ROWS - 1) * RH + 1;  // 底線＝第 11 列泡泡的下緣
const SHOOT_X = 8, SHOOT_Y = DEAD_Y + 2.55;
const FIELD_W = 16, FIELD_H = SHOOT_Y + 2.05;
const NEXT_X = SHOOT_X + 3.5, NEXT_Y = SHOOT_Y + 0.5, NEXT_S = 0.72;
const A_MIN = 10 * Math.PI / 180, A_MAX = Math.PI - A_MIN;
const SPEED = 40;                        // 飛行速度（單位／秒）
const IDLE_MS = 4000;                    // 前 3 關：這麼久沒動作就出示範

// ---------- 純模擬（UI、示範、求解器共用） ----------
const rowLen = r => (r & 1 ? 7 : 8);
const cellX = (r, c) => 1 + 2 * c + (r & 1);
const cellY = r => 1 + r * RH;
const key = (r, c) => r * 8 + c;
function nbrs(r, c) {
  const o = r & 1, out = [];
  const add = (a, b) => { if (a >= 0 && a < MAXR && b >= 0 && b < rowLen(a)) out.push([a, b]); };
  add(r, c - 1); add(r, c + 1);
  add(r - 1, c - 1 + o); add(r - 1, c + o);
  add(r + 1, c - 1 + o); add(r + 1, c + o);
  return out;
}
// 盤面＝MAXR 列的陣列，列號從天花板算起（第 0 列黏在天花板上）；g.top＝天花板已經往下降了幾排（畫面上第 r 列在 r＋top 的位置）。
// 天花板下降只改 top，不搬格子：每一列的奇偶（往右移半格）不變，泡泡不會左右跳。
const emptyGrid = () => { const g = Array.from({ length: MAXR }, (_, r) => new Array(rowLen(r)).fill(NONE)); g.top = 0; return g; };
const cloneGrid = g => { const c = g.map(row => row.slice()); c.top = g.top || 0; return c; };
const topOf = g => g.top || 0;
const gy = (g, r) => cellY(r) + topOf(g) * RH;           // 第 r 列在畫面上的 y（含天花板下降）
const isSym = v => v >= 0 && v !== PEN && v !== STONE;
// 這一關的符號組 → 編號陣列（'1' 對應第 1 個…）。沒寫 syms 的自訂盤面（測試用）當作 ㄅㄆㄇ
function symIds(def) { return [...(def.syms || "ㄅㄆㄇ")].map(ch => { const i = SYMS.indexOf(ch); if (i < 0) throw new Error("bubble level: bad symbol " + ch); return i; }); }
const digitOf = (ids, ch) => { const k = "123456789".indexOf(ch); return k >= 0 && k < ids.length ? ids[k] : -1; };
function parseLevel(def) {
  const g = emptyGrid(), ids = symIds(def);
  if (def.rows.length > ROWS) throw new Error("bubble level: too many rows");
  def.rows.forEach((s, r) => {
    const t = s.replace(/\s/g, "");
    if (t.length !== rowLen(r)) throw new Error(`bubble level: row ${r} needs ${rowLen(r)} cells, got "${t}"`);
    [...t].forEach((ch, c) => { g[r][c] = ch === "A" ? PEN : ch === "X" ? STONE : ch === "." ? NONE : digitOf(ids, ch); if (g[r][c] === -1 && ch !== ".") throw new Error("bubble level: bad cell " + ch); });
  });
  return g;
}
function each(g, fn) { for (let r = 0; r < MAXR; r++) for (let c = 0; c < g[r].length; c++) if (g[r][c] !== NONE) fn(r, c, g[r][c]); }
function present(g) { const s = new Set(); each(g, (r, c, v) => { if (isSym(v)) s.add(v); }); return [...s].sort((a, b) => a - b); }
function penguinsLeft(g) { let n = 0; each(g, (r, c, v) => { if (v === PEN) n++; }); return n; }

// 從發射口沿角度 ang（弧度，0＝右、π/2＝正上）飛：撞牆反彈、碰到泡泡或天花板就停，吸到最近的空格
function trace(g, ang) {
  let x = SHOOT_X, y = SHOOT_Y, dx = Math.cos(ang), dy = -Math.sin(ang);
  const occ = []; each(g, (r, c) => occ.push([cellX(r, c), gy(g, r)]));
  const pts = [[x, y]], ceil = 1 + topOf(g) * RH;          // 天花板（第 0 列泡泡的中心線）跟著下降
  for (let seg = 0; seg < 40; seg++) {
    const tW = dx > 1e-9 ? (FIELD_W - 1 - x) / dx : dx < -1e-9 ? (1 - x) / dx : Infinity;
    const tC = dy < -1e-9 ? (ceil - y) / dy : Infinity;
    let tH = Infinity;
    for (const [bx, by] of occ) {
      const px = x - bx, py = y - by, b = px * dx + py * dy;
      if (b > 0) continue;                                   // 正在遠離
      const disc = b * b - (px * px + py * py - COLL * COLL);
      if (disc < 0) continue;
      const t = Math.max(0, -b - Math.sqrt(disc));
      if (t < tH) tH = t;
    }
    if (tH <= tW || tC <= tW) { const t = Math.min(tH, tC); x += dx * t; y += dy * t; pts.push([x, y]); break; }
    x += dx * tW; y += dy * tW; pts.push([x, y]); dx = -dx;  // 撞牆反彈
  }
  return { pts, x, y, cell: snap(g, x, y) };
}
function snap(g, x, y) {
  let best = null, bd = Infinity;
  const r0 = Math.max(0, Math.floor((y - 1) / RH - topOf(g)) - 2), r1 = Math.min(MAXR - 1, r0 + 5);
  for (let r = r0; r <= r1; r++) for (let c = 0; c < rowLen(r); c++) {
    if (g[r][c] !== NONE) continue;
    if (r > 0 && !nbrs(r, c).some(([a, b]) => g[a][b] !== NONE)) continue;
    const d = (cellX(r, c) - x) ** 2 + (gy(g, r) - y) ** 2;
    if (d < bd) { bd = d; best = [r, c]; }
  }
  return best;
}
function flood(g, starts, ok) {               // BFS，回傳順序＝離起點由近到遠（破泡泡的漣漪順序）
  const seen = new Set(), out = [], q = [];
  for (const [r, c] of starts) if (ok(r, c) && !seen.has(key(r, c))) { seen.add(key(r, c)); q.push([r, c]); }
  while (q.length) {
    const [r, c] = q.shift(); out.push([r, c]);
    for (const [a, b] of nbrs(r, c)) if (!seen.has(key(a, b)) && ok(a, b)) { seen.add(key(a, b)); q.push([a, b]); }
  }
  return out;
}
// 黏上去之後的判定（直接改 g）：同符號 ≥3 消除 → 旁邊的企鵝救出 → 跟天花板斷開的全部掉下來（石頭泡泡只會在這一步掉）
function resolve(g, r, c, v) {
  g[r][c] = v;
  const res = { cell: [r, c], v, popped: [], rescued: [], dropped: [], full: false };
  const grp = flood(g, [[r, c]], (a, b) => g[a][b] === v);
  if (grp.length >= 3) {
    for (const [a, b] of grp) { res.popped.push([a, b, v]); g[a][b] = NONE; }
    const seen = new Set();
    for (const [a, b] of grp) for (const [p, q] of nbrs(a, b)) if (g[p][q] === PEN && !seen.has(key(p, q))) { seen.add(key(p, q)); res.rescued.push([p, q, "near"]); g[p][q] = NONE; }
  }
  const roots = []; for (let c2 = 0; c2 < 8; c2++) if (g[0][c2] !== NONE) roots.push([0, c2]);
  const keep = new Set(flood(g, roots, (a, b) => g[a][b] !== NONE).map(([a, b]) => key(a, b)));
  each(g, (a, b, w) => { if (keep.has(key(a, b))) return; if (w === PEN) res.rescued.push([a, b, "fall"]); else res.dropped.push([a, b, w]); g[a][b] = NONE; });
  if (!present(g).length) each(g, (a, b, w) => { if (w === PEN) { res.rescued.push([a, b, "auto"]); g[a][b] = NONE; } });   // 符號泡泡都沒了（只剩石頭也算）＝剩下的企鵝自己飛出來
  res.full = touching(g);
  return res;
}
// 有沒有泡泡碰到底線（畫面上的第 ROWS 列）
function touching(g) { let t = false; const top = topOf(g); each(g, a => { if (a + top >= ROWS) t = true; }); return t; }
// 天花板往下降一排（直接改 g）：回傳降完是不是碰到底線
function lower(g) { g.top = topOf(g) + 1; return touching(g); }
// Boss：整片往上退 n 排（n 要偶數，列的奇偶才不會變）。天花板降過 n 排以上＝天花板往回收；不夠的話＝最上面 n 列被天花板收走
// （符號／石頭泡泡消失、困在裡面的動物算救出），其餘整片往上搬 n 列。回傳被收走的格子 { gone: [[r,c,v]], freed: [[r,c]] }
function raise(g, n = 2) {
  const out = { gone: [], freed: [] };
  if (topOf(g) >= n) { g.top -= n; return out; }
  for (let r = 0; r < n; r++) for (let c = 0; c < g[r].length; c++) { const v = g[r][c]; if (v === PEN) out.freed.push([r, c]); else if (v !== NONE) out.gone.push([r, c, v]); }
  for (let r = 0; r < MAXR; r++) g[r] = r + n < MAXR ? g[r + n] : new Array(rowLen(r)).fill(NONE);
  return out;
}
// 示範與求解器用的分數：救出×100＋消除與掉落顆數×5＋有消除 10；其餘是小數點級的偏好（沒得消時：靠近同色、位置高）
function scoreOf(res, g, sym) {
  if (res.full && penguinsLeft(g) > 0) return -1000;
  let s = res.rescued.length * 100 + (res.popped.length + res.dropped.length) * 5 + (res.popped.length ? 10 : 0);
  if (!res.popped.length) { const [r, c] = res.cell; s += nbrs(r, c).filter(([a, b]) => g[a][b] === sym).length * 1.5 - r * 0.15; }
  return s;
}
// 掃角度（1° 一步）：每個落點只算一次，角度取「打得到同一格」那段的正中間（小孩手抖也打得中）
function evalShots(g, sym) {
  const m = new Map();
  for (let deg = 10; deg <= 170; deg++) {
    const a = deg * Math.PI / 180, tr = trace(g, a);
    if (!tr.cell) continue;
    const k = key(tr.cell[0], tr.cell[1]);
    let e = m.get(k);
    if (!e) { const g2 = cloneGrid(g); const res = resolve(g2, tr.cell[0], tr.cell[1], sym); e = { cell: tr.cell, degs: [], res, g2, score: scoreOf(res, g2, sym) }; m.set(k, e); }
    e.degs.push(deg);
  }
  for (const e of m.values()) {                // 最長連續的一段 → 中間角度
    let bs = 0, bl = 0, s = 0;
    for (let i = 1; i <= e.degs.length; i++) if (i === e.degs.length || e.degs[i] !== e.degs[i - 1] + 1) { if (i - s > bl) { bl = i - s; bs = s; } s = i; }
    e.angle = e.degs[bs + Math.floor((bl - 1) / 2)] * Math.PI / 180; e.width = bl;
    e.bounces = trace(g, e.angle).pts.length - 2;
  }
  return [...m.values()];
}
// 同分時：不用反彈的優先（示範線好懂），再來是打得中的角度範圍大的（小孩手抖也中）
function better(a, b) {
  if (a.score !== b.score) return a.score > b.score;
  const ea = Math.min(a.width, 4) - a.bounces * 2, eb = Math.min(b.width, 4) - b.bounces * 2;
  return ea !== eb ? ea > eb : a.width > b.width;
}
function bestFor(g, sym) { let best = null; for (const e of evalShots(g, sym)) if (!best || better(e, best)) best = e; return best; }

function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function pick(g, rnd) { const p = present(g); return p.length ? p[Math.floor(rnd() * p.length)] : NONE; }
function newRun(def, seed) {
  const g = parseLevel(def), rnd = rng32(seed), p = present(g), ids = symIds(def);
  const q = (def.q || "").split("").map(ch => digitOf(ids, ch));
  const cur = p.includes(q[0]) ? q[0] : pick(g, rnd);
  const next = p.includes(q[1]) ? q[1] : pick(g, rnd);
  return { g, rnd, cur, next, need: penguinsLeft(g), ids };
}
function refill(s) {                          // 發射完：下一顆變目前這顆（場上沒有這個符號就重抽），再抽新的下一顆
  const p = present(s.g);
  s.cur = p.includes(s.next) ? s.next : pick(s.g, s.rnd);
  s.next = pick(s.g, s.rnd);
}

// 求解器：貪婪＋一步前瞻（同一套 trace/resolve；天花板下壓照關卡的 drop 算，這一發會讓天花板降下來就連降完一起看）。
// 回傳 { win, shots, swaps, full, drops }；def 給了就解這個盤面（關卡設計工具用）
export function solveLevel(i, { seed = 1, maxShots = 60, look = 6, def = null, drop = null } = {}) {
  const d = def || LEVELS[i], N = drop != null ? drop : (d.drop || 0);
  const s = newRun(d, seed);
  let shots = 0, swaps = 0, left = N, drops = 0;
  while (penguinsLeft(s.g) > 0 && shots < maxShots) {
    const dropNow = N > 0 && left === 1;
    const opts = [];
    for (const sw of s.next !== NONE && s.next !== s.cur ? [false, true] : [false]) {
      const sym = sw ? s.next : s.cur;
      for (const e of evalShots(s.g, sym)) opts.push(Object.assign(e, { sw, sym, val: e.score }));
    }
    opts.sort((a, b) => b.score - a.score || (a.sw - b.sw));
    for (const o of opts.slice(0, look)) {
      if (o.score <= -1000) continue;
      if (penguinsLeft(o.g2) === 0) { o.val = o.score + 10000 - (o.sw ? 1 : 0); continue; }
      if (dropNow && lower(o.g2)) { o.val = -1000; continue; }          // 這一發之後天花板降下來就碰底線
      const nx = o.sw ? s.cur : s.next, p = present(o.g2);
      const cands = p.includes(nx) ? [nx] : p;
      let sum = 0; for (const sym of cands) { const b = bestFor(o.g2, sym); sum += b ? Math.max(0, b.score) : 0; }
      o.val = o.score + 0.8 * sum / Math.max(1, cands.length) - (o.sw ? 0.5 : 0);
    }
    let ch = opts[0]; for (const o of opts) if (o.val > ch.val) ch = o;
    if (!ch) break;
    if (ch.sw) { [s.cur, s.next] = [s.next, s.cur]; swaps++; }
    const res = resolve(s.g, ch.cell[0], ch.cell[1], s.cur); shots++;
    if (res.full && penguinsLeft(s.g) > 0) return { win: false, shots, swaps, full: true, drops };
    if (penguinsLeft(s.g) === 0) break;
    if (N > 0 && --left === 0) { left = N; drops++; if (lower(s.g)) return { win: false, shots, swaps, full: true, drops }; }
    refill(s);
  }
  return { win: penguinsLeft(s.g) === 0, shots, swaps, full: false, drops };
}

// 測試／關卡設計用（主程式不需要）
export const bubbleSim = { parseLevel, trace, resolve, evalShots, bestFor, present, penguinsLeft, cloneGrid, newRun, refill, lower, raise, touching, PEN, STONE };

// ---------- 自己附注音的字（國字旁邊都要有注音；不靠主程式字典，所以字典沒收的字也不會漏） ----------
const ZR = { 第: "ㄉㄧˋ", 關: "ㄍㄨㄢ", 已: "ㄧˇ", 救: "ㄐㄧㄡˋ", 需: "ㄒㄩ", 發: "ㄈㄚ", 射: "ㄕㄜˋ", 全: "ㄑㄩㄢˊ", 部: "ㄅㄨˋ", 出: "ㄔㄨ", 來: "ㄌㄞˊ", 了: "ㄌㄜ˙" };
const TONE = { "ˊ": 2, "ˇ": 3, "ˋ": 4, "˙": 5 };
function zh(text) {
  const f = document.createDocumentFragment();
  for (const ch of text) {
    const z = ZR[ch];
    if (!z) { f.appendChild(document.createTextNode(ch)); continue; }
    const s = document.createElement("span"), t = TONE[z[z.length - 1]] || 0, sym = t ? z.slice(0, -1) : z;
    s.className = "ac n" + Math.min(4, sym.length) + (t ? " t" + t : ""); s.dataset.z = sym; s.textContent = ch; f.appendChild(s);
  }
  return f;
}

// ===================== 畫面＋操作 =====================
export function createBubbleGame(root, api) {
  let run = 0;                 // 每次 start/stop 換號：舊的 later 回呼看到號碼不同就作廢
  let st = null;               // 這一局
  let D = null;                // DOM
  let raf = 0, idleTok = 0, talkedSwap = false, talkedIntro = false, talkedDrop = false;
  const talkedZone = {};       // 每個新區第一次進來說一次「這次要救○○」（第 4、5 區順便講新機制）
  const ZONE_INTRO = [null, "這次要救小螃蟹喔！", "這次要救小鯨魚喔！", "這次要救小象喔！天花板會慢慢降下來喔！", "這次要救小獅子喔！灰色的石頭打不破，要讓它掉下來！"];
  const DROP_TIP = "天花板降下來了！小燈都熄掉，就會往下降喔！";   // 第一次看到天花板降下來時說（Boss 模式不說）
  const offs = [];             // 自己掛的事件（stop 時全部拆）
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };
  const later = (fn, ms) => { const my = run; api.later(() => { if (my === run && st) fn(); }, ms); };
  const play = (n, r = 1) => { try { api.play(n, r); } catch (e) { /* 音效失敗不影響遊戲 */ } };
  const mk = (tag, cls, parent, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; if (parent) parent.appendChild(e); return e; };
  const SVGNS = "http://www.w3.org/2000/svg";
  const canAct = () => !!st && !st.busy && !st.full && !st.won && !api.paused();
  // 這一關要救的動物：名字來自 ZONES，圖來自主程式給的 api.animalImgs（沒給就退回舊的 api.animalImg）
  const animal = () => { const z = ZONES[st ? st.zone : 0] || ZONES[0]; return { name: z.name, img: (api.animalImgs && api.animalImgs[z.key]) || api.animalImg || "" }; };

  // ---------- DOM ----------
  function build() {
    root.classList.add("bb-root");
    const wrap = mk("div", "bb-wrap", root);
    const field = mk("div", "bb-field", wrap);
    const zone = mk("div", "bb-zone", field); zone.style.setProperty("--y", DEAD_Y);   // 發射區底色
    const dead = mk("div", "bb-dead", field); dead.style.setProperty("--y", DEAD_Y);
    const aim = document.createElementNS(SVGNS, "svg"); aim.setAttribute("class", "bb-aim"); aim.setAttribute("viewBox", `0 0 ${FIELD_W} ${FIELD_H}`); aim.setAttribute("preserveAspectRatio", "none"); field.appendChild(aim);
    const layer = mk("div", "bb-layer", field);
    const ceil = mk("div", "bb-ceil", field); ceil.setAttribute("aria-hidden", "true");   // 會往下降的天花板（有 drop 的關才顯示）＋上面的小燈
    const ghost = mk("div", "bb-b bb-ghost", field);
    const ring = mk("div", "bb-ring", field);
    const base = mk("div", "bb-base", field); base.style.setProperty("--x", SHOOT_X); base.style.setProperty("--y", SHOOT_Y);
    const cur = mk("div", "bb-b bb-cur", field); cur.setAttribute("role", "button"); cur.style.setProperty("--x", SHOOT_X); cur.style.setProperty("--y", SHOOT_Y);
    const swap = mk("div", "bb-swap", field, "⇄"); swap.style.setProperty("--x", (SHOOT_X + NEXT_X) / 2 + 0.15); swap.style.setProperty("--y", SHOOT_Y + 0.35);
    const next = mk("div", "bb-b bb-next", field); next.setAttribute("role", "button"); next.style.setProperty("--x", NEXT_X); next.style.setProperty("--y", NEXT_Y);
    const finger = mk("div", "bb-finger", field, "👆");
    const goal = mk("div", "bb-goal", wrap); goal.setAttribute("role", "status");
    const lvl = mk("div", "bb-lvl", goal);
    const slots = mk("div", "bb-slots", goal);
    const count = mk("div", "bb-count", goal);
    const fire = mk("button", "bb-fire", wrap); fire.type = "button"; fire.setAttribute("aria-label", "發射");
    mk("span", "bb-fire-ic", fire, "🚀"); mk("span", "bb-fire-tx", fire).appendChild(zh("發射"));
    const fx = mk("div", "bb-fx", wrap);
    D = { wrap, field, aim, layer, ceil, ghost, ring, base, cur, next, swap, finger, goal, lvl, slots, count, fire, fx, bmap: new Map(), fly: null };
    on(field, "pointerdown", onDown); on(field, "pointermove", onMove); on(field, "pointerup", onUp); on(field, "pointercancel", onUp); on(field, "lostpointercapture", onUp);
    on(cur, "pointerdown", e => { if (st) st.curTap = [...toUnits(e), e.pointerId]; });   // 不攔：交給場地的 onDown（拖了＝瞄準，沒拖＝放開時換球）
    on(next, "pointerdown", onSwapTap); on(swap, "pointerdown", onSwapTap);
    on(fire, "click", () => fire_());
  }
  function teardown() {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    while (offs.length) offs.pop()();
    if (D) { D.wrap.remove(); D = null; }
    root.classList.remove("bb-root");
  }

  function relayout() {
    if (!D) return;
    const rc = root.getBoundingClientRect();
    const W = rc.width || window.innerWidth, H = rc.height || window.innerHeight, vm = Math.min(W, H) / 100;
    const land = W >= H * 1.1;
    let u, fl, ft;
    D.wrap.classList.toggle("bb-land", land); D.wrap.classList.toggle("bb-port", !land);
    D.wrap.style.setProperty("--vm", vm + "px");
    if (land) {
      u = Math.min((H - 4 * vm) / FIELD_H, (W - 2 * 27 * vm) / FIELD_W);
      fl = (W - FIELD_W * u) / 2; ft = (H - FIELD_H * u) / 2;
      const side = fl, fr = fl + FIELD_W * u;
      place(D.goal, side / 2, Math.max(H * 0.47, 30 * vm), Math.min(side - 4 * vm, 34 * vm)); D.goal.style.maxWidth = "";
      place(D.fire, fr + (W - fr) / 2, H * 0.64);
    } else {
      const top = 15 * vm, bot = 25 * vm;
      u = Math.min((H - top - bot - 2 * vm) / FIELD_H, (W - 4 * vm) / FIELD_W);
      fl = (W - FIELD_W * u) / 2; ft = top + (H - top - bot - FIELD_H * u) / 2;
      const by = ft + FIELD_H * u + (H - ft - FIELD_H * u) / 2, fw = 33 * vm;   // 直式：目標靠左、發射鈕靠右
      place(D.goal, 3 * vm, by); D.goal.style.width = ""; D.goal.style.maxWidth = Math.max(30 * vm, W - fw - 9 * vm) + "px";
      place(D.fire, W - 3 * vm - fw / 2, by);
    }
    Object.assign(D.field.style, { left: fl + "px", top: ft + "px", width: FIELD_W * u + "px", height: FIELD_H * u + "px" });
    D.wrap.style.setProperty("--u", u + "px");
    D.u = u;
  }
  function place(e, x, y, w) { e.style.left = x + "px"; e.style.top = y + "px"; if (w) e.style.width = w + "px"; }

  // ---------- 泡泡元素 ----------
  function bubbleEl(v, parent, x, y) {
    const e = mk("div", "bb-b", parent);
    paint(e, v);
    e.style.setProperty("--x", x); e.style.setProperty("--y", y);
    return e;
  }
  const PAINT_CLS = ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "bb-pen", "bb-stone"];
  function paint(e, v) {
    e.classList.remove(...PAINT_CLS);
    e.textContent = "";
    if (v === PEN) { e.classList.add("bb-pen"); const im = mk("img", "", e); im.src = animal().img; im.alt = ""; im.draggable = false; mk("i", "bb-shine", e); }
    else if (v === STONE) { e.classList.add("bb-stone"); mk("i", "bb-rock", e); }
    else if (v >= 0) { e.classList.add("s" + SYM_COLOR[v]); mk("span", "bb-sym", e, SYMS[v]); }
  }
  // 泡泡元素放在 .bb-layer 裡、用「從天花板算的列」定位；整層再跟著天花板往下移（--top，CSS 有過場動畫）
  function renderBoard() {
    D.layer.textContent = ""; D.bmap.clear();
    each(st.g, (r, c, v) => { const e = bubbleEl(v, D.layer, cellX(r, c), cellY(r)); if (v === PEN) e.style.animationDelay = (-(r * 0.37 + c * 0.53) % 2.4) + "s"; D.bmap.set(key(r, c), e); });
  }
  // 天花板位置：jump＝不要過場動畫（Boss 收走最上面兩列時，先瞬間對齊再滑上去）
  function setTop(jump, extra = 0) {
    D.field.classList.toggle("bb-jump", !!jump);
    D.field.style.setProperty("--top", topOf(st.g) + extra);
    if (jump) { void D.field.offsetWidth; D.field.classList.remove("bb-jump"); }
  }
  // 天花板上的小燈：每發熄一顆，全熄＝天花板降一排；剩最後一顆時天花板輕輕抖（不用數字、不用紅色）
  function renderCeil() {
    const on = st.drop > 0;
    D.field.classList.toggle("bb-hasceil", on); D.ceil.hidden = !on;
    if (!on) return;
    if (D.ceil.children.length !== st.drop) {
      D.ceil.textContent = "";
      const gap = Math.min(2, 13.5 / Math.max(1, st.drop - 1));          // 燈的間距（單位）：最多 2（一顆泡泡寬），燈多就擠一點
      for (let i = 0; i < st.drop; i++) { const l = mk("i", "bb-lamp", D.ceil); l.style.setProperty("--x", (FIELD_W / 2 + (i - (st.drop - 1) / 2) * gap).toFixed(3)); }
    }
    [...D.ceil.children].forEach((l, i) => l.classList.toggle("on", i < st.left));
    D.ceil.classList.toggle("bb-warn", st.left === 1 && !st.won && !st.full);
  }
  function renderQueue(anim) {
    const c = st.cur, n = st.next;
    D.cur.classList.toggle("bb-empty", c === NONE); D.next.classList.toggle("bb-empty", n === NONE);
    if (c !== NONE) paint(D.cur, c); else D.cur.textContent = "";
    if (n !== NONE) paint(D.next, n); else D.next.textContent = "";
    D.cur.setAttribute("aria-label", c === NONE ? "" : `目前的泡泡 ${SYMS[c]}，點一下跟下一顆交換`);
    D.next.setAttribute("aria-label", n === NONE ? "" : `下一顆 ${SYMS[n]}`);
    if (anim) { bump(D.cur, "bb-load"); bump(D.next, "bb-load"); }
  }
  function bump(e, cls) { e.classList.remove(cls); void e.offsetWidth; e.classList.add(cls); }
  function renderGoal(pulse) {
    const need = st.need, got = st.shown;
    D.lvl.textContent = ""; if (st.boss) D.lvl.append("🗼"); else D.lvl.append(zh("第"), " " + (st.lv + 1) + " ", zh("關"));   // Boss（爬塔）不顯示泡泡灣的關卡號碼
    D.goal.classList.toggle("bb-many", need > 3);      // 救 4 隻以上（第 29、30、38～40、47～50 關）：直式的小格子改兩排、縮小（不然會鑽到發射鈕底下；v6 測試抓到第 30 關本來就擠出去）
    if (D.slots.children.length !== need) { D.slots.textContent = ""; for (let i = 0; i < need; i++) { const s = mk("div", "bb-slot", D.slots); const im = mk("img", "", s); im.src = animal().img; im.alt = ""; im.draggable = false; } }
    [...D.slots.children].forEach((s, i) => s.classList.toggle("on", i < got));
    D.count.textContent = "";
    const r1 = mk("div", "bb-crow", D.count), r2 = mk("div", "bb-crow", D.count);
    mk("span", "", r1).appendChild(zh("已救")); r1.appendChild(mkNum(got));
    mk("span", "", r2).appendChild(zh("需救")); r2.appendChild(mkNum(need));
    D.goal.setAttribute("aria-label", `${animal().name} 已救 ${got} 隻，需救 ${need} 隻`);
    if (pulse) { bump(D.count, "bb-tick"); const s = D.slots.children[got - 1]; if (s) bump(s, "bb-got"); }
  }
  function mkNum(n) { const b = document.createElement("b"); b.textContent = String(n); return b; }

  // ---------- 瞄準線 ----------
  function drawAim(mode) {                    // mode: "aim"｜"demo"｜""（不畫）
    const svg = D.aim; svg.textContent = "";
    D.ghost.className = "bb-b bb-ghost"; D.ring.classList.remove("on");
    if (!mode || !st || st.cur === NONE) return null;
    const tr = trace(st.g, st.aim);
    if (!tr.cell) return tr;
    const cyy = gy(st.g, tr.cell[0]);                 // 畫面座標（含天花板下降）
    const pts = tr.pts.concat([[cellX(...tr.cell), cyy]]);
    const g = document.createElementNS(SVGNS, "g"); g.setAttribute("class", "bb-dots " + (mode === "demo" ? "bb-gold" : "s" + SYM_COLOR[st.cur]));
    let carry = 1.6;                             // 第一顆點離開發射口一點
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], L = Math.hypot(x1 - x0, y1 - y0);
      let d = carry;
      for (; d < L; d += 0.95) { const c = document.createElementNS(SVGNS, "circle"); c.setAttribute("cx", (x0 + (x1 - x0) * d / L).toFixed(3)); c.setAttribute("cy", (y0 + (y1 - y0) * d / L).toFixed(3)); c.setAttribute("r", mode === "demo" ? 0.24 : 0.19); g.appendChild(c); }
      carry = d - L;
    }
    svg.appendChild(g);
    const ar = document.createElementNS(SVGNS, "path");      // 發射口的小箭頭
    const a = st.aim, ux = Math.cos(a), uy = -Math.sin(a), px = -uy, py = ux, R = 1.25;
    const tip = [SHOOT_X + ux * (R + 0.75), SHOOT_Y + uy * (R + 0.75)], b1 = [SHOOT_X + ux * R + px * 0.5, SHOOT_Y + uy * R + py * 0.5], b2 = [SHOOT_X + ux * R - px * 0.5, SHOOT_Y + uy * R - py * 0.5];
    ar.setAttribute("d", `M${tip.join(",")}L${b1.join(",")}L${b2.join(",")}Z`); ar.setAttribute("class", "bb-arrow"); svg.appendChild(ar);
    D.ghost.classList.add("s" + SYM_COLOR[st.cur], "on"); D.ghost.style.setProperty("--x", cellX(...tr.cell)); D.ghost.style.setProperty("--y", cyy);
    D.ghost.textContent = ""; mk("span", "bb-sym", D.ghost, SYMS[st.cur]);
    if (mode === "demo") { D.ring.style.setProperty("--x", cellX(...tr.cell)); D.ring.style.setProperty("--y", cyy); D.ring.classList.add("on"); }
    return tr;
  }
  const showAim = () => drawAim(canAct() ? (st.demo === "line" ? "demo" : "aim") : "");

  // ---------- 示範（前 3 關） ----------
  function bestShot() {
    if (!st || st.cur === NONE) return null;
    const a = bestFor(st.g, st.cur);
    const b = st.next !== NONE && st.next !== st.cur ? bestFor(st.g, st.next) : null;
    const pack = (e, sw) => e && { angle: e.angle, deg: Math.round(e.angle * 180 / Math.PI), cell: e.cell.slice(), score: e.score, swap: sw, popped: e.res.popped.length, dropped: e.res.dropped.length, rescued: e.res.rescued.length };
    if (b && b.score > a.score && (b.score >= a.score + 40 || (b.res.popped.length && !a.res.popped.length))) return pack(b, true);
    return pack(a, false);
  }
  function showDemo(noSwap) {
    if (!st || !st.teach || !canAct()) return;
    let b = bestShot(); if (!b) return;
    if (b.swap && noSwap) { const a = bestFor(st.g, st.cur); b = { angle: a.angle, swap: false }; }
    hideDemo(true);
    if (b.swap) {                                // 換一顆比較好：手指點目前這顆
      st.demo = "swap"; D.cur.classList.add("bb-hint");
      fingerAt(SHOOT_X, SHOOT_Y + 0.2);
      if (!talkedSwap) { talkedSwap = true; api.talk("點一下泡泡，可以換一顆喔！"); }
      showAim(); return;
    }
    st.demo = "line"; st.aim = b.angle;
    const tr = showAim();
    const [x0, y0] = tr.pts[0], [x1, y1] = tr.pts[1], L = Math.hypot(x1 - x0, y1 - y0), d = Math.min(L * 0.62, 11);   // 手指放在第一段上（點那裡＝同一個角度）
    fingerAt(x0 + (x1 - x0) * d / L, y0 + (y1 - y0) * d / L);
    D.fire.classList.add("bb-hint");
  }
  function fingerAt(x, y) { D.finger.style.setProperty("--x", x); D.finger.style.setProperty("--y", y); D.finger.classList.add("on"); }
  function hideDemo(silent) {
    if (!st) return;
    const had = st.demo; st.demo = "";
    D.finger.classList.remove("on"); D.fire.classList.remove("bb-hint"); D.cur.classList.remove("bb-hint");
    if (had && !silent) showAim();
  }
  function armIdle() {
    const tok = ++idleTok;
    if (!st || !st.teach) return;
    later(() => { if (tok === idleTok && canAct() && !st.demo && !st.dragging) showDemo(); }, IDLE_MS);
  }

  // ---------- 操作 ----------
  function toUnits(e) { const r = D.field.getBoundingClientRect(); return [(e.clientX - r.left) / D.u, (e.clientY - r.top) / D.u]; }
  function aimAt(x, y) {
    const dx = x - SHOOT_X, dy = SHOOT_Y - y;
    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return;
    let a = Math.atan2(dy, dx);
    if (a < 0) a = dx < 0 ? A_MAX : A_MIN;
    st.aim = Math.min(A_MAX, Math.max(A_MIN, a));
  }
  function onDown(e) {
    if (!canAct()) return;
    e.preventDefault();
    if (st.dragging && e.pointerId !== st.pid) return;   // 第二隻手指不搶角度
    const onCur = !!(st.curTap && st.curTap[2] === e.pointerId); if (!onCur) st.curTap = null;
    try { D.field.setPointerCapture(e.pointerId); } catch (err) { /* 有些瀏覽器合成事件沒有 pointer id */ }
    st.dragging = true; st.pid = e.pointerId; idleTok++;
    if (!onCur) { hideDemo(true); aimAt(...toUnits(e)); showAim(); }   // 按在發射口的泡泡上：等看是點（換球）還是拖（瞄準）再決定
  }
  function onMove(e) {
    if (!st || !st.dragging || !canAct() || e.pointerId !== st.pid) return;
    if (e.pointerType === "mouse" && !e.buttons) { onUp(e); return; }   // 放開在場地外又沒抓到 pointerup
    const u = toUnits(e);
    if (st.curTap) { if (Math.hypot(u[0] - st.curTap[0], u[1] - st.curTap[1]) <= 0.5) return; st.curTap = null; hideDemo(true); }   // 拖動了：是瞄準
    aimAt(...u); showAim();
  }
  function onUp(e) {
    if (!st || !st.dragging || (e && e.pointerId !== undefined && e.pointerId !== st.pid)) return;
    st.dragging = false;
    const tap = st.curTap; st.curTap = null;
    if (tap && e && e.type === "pointerup") { swapQueue(); return; }   // 點一下發射口的泡泡（沒拖）＝換一顆
    armIdle();
  }
  function onSwapTap(e) { e.stopPropagation(); e.preventDefault(); swapQueue(); }
  function swapQueue() {
    if (!canAct() || st.next === NONE || st.cur === NONE) return false;
    const wasDemo = st.demo;
    [st.cur, st.next] = [st.next, st.cur];
    play("select"); renderQueue(false); bump(D.cur, "bb-swapin"); bump(D.next, "bb-swapin");
    api.say(SYMS[st.cur]);
    idleTok++; hideDemo(true);
    if (wasDemo) showDemo(true); else { showAim(); armIdle(); }
    return true;
  }

  function fire_() {
    if (!canAct() || st.cur === NONE) return false;
    hideDemo(true); idleTok++;
    const tr = trace(st.g, st.aim);
    if (!tr.cell) { play("ng"); return false; }
    st.busy = true; st.shots++; st.dragging = false;
    const sym = st.cur;
    drawAim(""); D.fire.classList.add("bb-busy");
    D.cur.classList.add("bb-empty"); D.cur.textContent = "";
    play("tap", 1.35);
    const pts = tr.pts.concat([[cellX(...tr.cell), gy(st.g, tr.cell[0])]]);
    const ms = Math.max(260, pathLen(pts) / SPEED * 1000);
    fly(pts, ms, sym);
    later(() => land(tr.cell, sym), ms);
    return tr.cell.slice();
  }
  function pathLen(p) { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; }
  function fly(pts, ms, sym) {
    const e = bubbleEl(sym, D.field, pts[0][0], pts[0][1]); e.classList.add("bb-flying"); D.fly = e;
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = cum[cum.length - 1]; let el = 0, last = performance.now(), seg = 1;
    const step = now => {
      raf = 0; if (!D || D.fly !== e) return;
      const dt = Math.min(50, now - last); last = now;
      if (!api.paused()) el += dt;                         // 暫停時泡泡停在半空
      const d = Math.min(1, el / ms) * total;
      while (seg < pts.length - 1 && cum[seg] < d) { seg++; if (seg < pts.length - 1) play("tap", 1.7); }   // 撞牆小聲「叩」
      let i = 1; while (i < pts.length - 1 && cum[i] < d) i++;
      const f = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
      e.style.setProperty("--x", pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f);
      e.style.setProperty("--y", pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f);
      if (d < total) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  // ---------- 落點之後：消除、掉落、救出（全部走 api.later） ----------
  function land(cell, sym) {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    if (D.fly) { D.fly.remove(); D.fly = null; }
    const [r, c] = cell;
    const res = resolve(st.g, r, c, sym);
    st.last = { cell: [r, c], sym: SYMS[sym], popped: res.popped.length, dropped: res.dropped.length, rescued: res.rescued.length,
      near: res.rescued.filter(x => x[2] === "near").length, fall: res.rescued.filter(x => x[2] === "fall").length, auto: res.rescued.filter(x => x[2] === "auto").length, full: res.full };
    st.rescued += res.rescued.length;
    const e = bubbleEl(sym, D.layer, cellX(r, c), cellY(r)); D.bmap.set(key(r, c), e); bump(e, "bb-stick");
    let t = 0, arrive = 0;
    if (res.popped.length) {
      res.popped.forEach(([a, b], i) => later(() => { popEl(a, b); play("pop", Math.min(2.2, Math.pow(2, i / 8))); }, 120 + i * 85));
      t = 120 + res.popped.length * 85;
    } else play("tap", 0.75);
    const near = res.rescued.filter(x => x[2] === "near"), fall = res.rescued.filter(x => x[2] === "fall"), auto = res.rescued.filter(x => x[2] === "auto");
    let k = 0;
    near.forEach(([a, b]) => { const at = t + 60 + (k++) * 160; later(() => rescueEl(a, b, k), at); arrive = Math.max(arrive, at + 900); });
    if (res.dropped.length || fall.length) {
      const t0 = t + 80;
      later(() => { play("flip"); dropEls(res.dropped); fall.forEach(([a, b]) => { const el = D.bmap.get(key(a, b)); if (el) el.classList.add("bb-wob"); }); }, t0);
      fall.forEach(([a, b]) => { const at = t0 + 260 + (k++) * 160; later(() => rescueEl(a, b), at); arrive = Math.max(arrive, at + 900); });
      t = t0 + 500;
    }
    auto.forEach(([a, b]) => { const at = t + 100 + (k++) * 200; later(() => rescueEl(a, b), at); arrive = Math.max(arrive, at + 900); });
    later(() => endTurn(res), Math.max(t, arrive) + 180);
  }
  function popEl(a, b) {
    const e = D.bmap.get(key(a, b)); if (!e) return; D.bmap.delete(key(a, b));
    e.classList.add("bb-pop"); e.addEventListener("animationend", () => e.remove(), { once: true });
    sparks(e, 6);
  }
  function dropEls(list) {
    list.forEach(([a, b], i) => {
      const e = D.bmap.get(key(a, b)); if (!e) return; D.bmap.delete(key(a, b));
      const dist = (FIELD_H - gy(st.g, a) + 3) * D.u, rot = (i % 2 ? 1 : -1) * (20 + (i * 37) % 50);
      const an = e.animate([{ transform: "translate(0,0) rotate(0deg)", opacity: 1 }, { transform: `translate(${((i * 53) % 7 - 3) * 0.3 * D.u}px, ${dist}px) rotate(${rot}deg)`, opacity: 0.2 }],
        { duration: 620 + (i % 4) * 60, delay: (i % 5) * 25, easing: "cubic-bezier(.4,0,.9,.6)", fill: "forwards" });
      an.onfinish = () => e.remove();
    });
  }
  // 企鵝救出：泡泡殼破掉 → 企鵝跳出來、冒愛心 → 飛到目標計數器 → 計數跳一下
  function rescueEl(a, b) {
    const e = D.bmap.get(key(a, b)); if (!e) return; D.bmap.delete(key(a, b));
    const wr = D.wrap.getBoundingClientRect(), er = e.getBoundingClientRect();
    const sx = er.left + er.width / 2 - wr.left, sy = er.top + er.height / 2 - wr.top;
    e.getAnimations().forEach(an => an.cancel()); e.classList.remove("bb-wob");
    e.classList.add("bb-pop"); e.addEventListener("animationend", () => e.remove(), { once: true });
    play("pop", 1.5);
    const idx = st.flying++;
    const slot = D.slots.children[Math.min(st.need - 1, st.shown + idx)] || D.count;
    const tr = slot.getBoundingClientRect(), tx = tr.left + tr.width / 2 - wr.left, ty = tr.top + tr.height / 2 - wr.top;
    const p = mk("img", "bb-flyp", D.fx); p.src = animal().img; p.alt = ""; p.draggable = false;
    const size = Math.max(er.width, 10); p.style.width = p.style.height = size * 1.1 + "px"; p.style.left = sx + "px"; p.style.top = sy + "px";
    const mx = (sx + tx) / 2, my = Math.min(sy, ty) - 18 * parseFloat(D.wrap.style.getPropertyValue("--vm"));
    const k = tr.width / (size * 1.1);
    p.animate([
      { transform: "translate(-50%,-50%) scale(0.6)", offset: 0 },
      { transform: "translate(-50%,-50%) translateY(-30%) scale(1.35)", offset: 0.18 },
      { transform: `translate(-50%,-50%) translate(${mx - sx}px, ${my - sy}px) scale(1.15) rotate(-12deg)`, offset: 0.55 },
      { transform: `translate(-50%,-50%) translate(${tx - sx}px, ${ty - sy}px) scale(${k}) rotate(0deg)`, offset: 1 },
    ], { duration: 880, easing: "ease-in-out", fill: "forwards" }).onfinish = () => p.remove();
    for (let i = 0; i < 5; i++) {
      const h = mk("div", "bb-heart", D.fx, "❤"); h.style.left = sx + "px"; h.style.top = sy + "px";
      h.style.setProperty("--hx", ((i - 2) * 3.2) + "vmin"); h.style.setProperty("--hd", (i * 70) + "ms"); h.addEventListener("animationend", () => h.remove(), { once: true });
    }
    later(() => { st.flying = Math.max(0, st.flying - 1); st.shown = Math.min(st.need, st.shown + 1); renderGoal(true); play("sticker", 1 + st.shown * 0.12); }, 880);
  }
  function sparks(e, n) {
    const wr = D.wrap.getBoundingClientRect(), er = e.getBoundingClientRect();
    const x = er.left + er.width / 2 - wr.left, y = er.top + er.height / 2 - wr.top;
    for (let i = 0; i < n; i++) {
      const s = mk("i", "bb-spark", D.fx); s.style.left = x + "px"; s.style.top = y + "px";
      const a = i / n * Math.PI * 2 + 0.4; s.style.setProperty("--sx", Math.cos(a) * er.width * 0.9 + "px"); s.style.setProperty("--sy", Math.sin(a) * er.width * 0.9 + "px");
      s.addEventListener("animationend", () => s.remove(), { once: true });
    }
  }
  function endTurn(res) {
    st.shown = st.rescued; st.flying = 0; renderGoal(false);
    if (penguinsLeft(st.g) === 0) return win();
    if (res.full) return touchBottom();
    if (st.drop > 0 && --st.left <= 0) { st.left = st.drop; return dropCeil(); }   // 小燈全熄：天花板降一排
    nextShot();
  }
  function nextShot(noRefill) {                // 換下一顆、可以再發射（noRefill：測試的 dropNow 沒有發射，不換球）
    if (!noRefill) refill(st); st.busy = false; D.fire.classList.remove("bb-busy");
    renderQueue(true); api.say(SYMS[st.cur]);
    renderCeil(); showAim(); armIdle();
  }
  function dropCeil(noRefill) {
    const full = lower(st.g); st.drops++;
    renderCeil(); setTop(false); play("flip", 0.6); bump(D.ceil, "bb-thud");
    if (!talkedDrop && !st.boss) { talkedDrop = true; later(() => api.talk(DROP_TIP), 350); }
    later(() => { if (full) touchBottom(); else nextShot(noRefill); }, 650);   // 等天花板滑下來（CSS 0.5 秒）
  }
  // 泡泡碰到底線：一般關＝這關重來（主程式 onFull）；Boss＝扣一下（onPress）、整片往上退 2 排、接著玩
  function touchBottom() {
    if (st.boss) return press();
    st.full = true; st.busy = false; D.wrap.classList.add("bb-isfull"); D.fire.classList.add("bb-busy"); renderCeil();
    play("ng"); api.onFull({ level: st.lv });
  }
  function press() {
    st.presses++; st.left = st.drop;
    play("pop", 0.6); bump(D.wrap, "bb-press");
    try { if (api.onPress) api.onPress({ level: st.lv, presses: st.presses, shots: st.shots }); } catch (e) { console.warn("[bubble] onPress", e); }
    const out = raise(st.g, 2);
    if (out.gone.length || out.freed.length) {     // 天花板沒降那麼多：最上面兩列被收進天花板（動物算救出），其餘瞬間對齊後滑上去
      out.gone.forEach(([a, b]) => popEl(a, b)); out.freed.forEach(([a, b]) => rescueEl(a, b));
      st.rescued += out.freed.length;
      later(() => { renderBoard(); setTop(true, 2); setTop(false); }, 320);
    } else setTop(false);
    renderCeil();
    later(() => { st.shown = st.rescued; st.flying = 0; renderGoal(false); if (penguinsLeft(st.g) === 0) return win(); nextShot(); }, 950);
  }
  function win() {
    st.won = true; st.busy = false; drawAim(""); D.fire.classList.add("bb-busy"); D.wrap.classList.add("bb-won"); renderCeil();
    const stars = st.boss ? 0 : st.shots <= st.par ? 3 : st.shots <= st.par + 2 ? 2 : 1;   // v6：2 星門檻 par+3 → par+2；Boss 不給星星
    const info = { level: st.lv, shots: st.shots, par: st.par, stars, rescued: st.rescued };
    if (st.boss) Object.assign(info, { boss: true, presses: st.presses });
    st.winInfo = info;
    later(() => {
      const bn = mk("div", "bb-banner", D.fx); bn.appendChild(zh("全部救出來了！"));
      if (!st.boss) { const sr = mk("div", "bb-banner-stars", bn); for (let i = 0; i < 3; i++) mk("span", i < stars ? "on" : "", sr, "★"); }
      play("win"); for (const s of D.slots.children) bump(s, "bb-got");
      for (let i = 0; i < 14; i++) { const q = mk("i", "bb-conf s" + (i % 3), D.fx); q.style.left = (8 + (i * 61) % 84) + "%"; q.style.setProperty("--d", (i * 90) % 700 + "ms"); q.addEventListener("animationend", () => q.remove(), { once: true }); }
    }, 250);
    later(() => { if (!st.winSent) { st.winSent = true; api.onWin(info); } }, 1900);
  }

  // ---------- 公開介面 ----------
  // o：{ drop: 每幾發天花板降一排（蓋過關卡的 drop）, boss: 爬塔 Boss 模式（碰底線不重來、不給星星、沒有示範與區開場語） }
  function start(i, def, o) {
    stop();
    run++;
    o = o || {};
    const lv = Math.max(0, Math.min(LEVELS.length - 1, i | 0)), d = def || LEVELS[lv];
    const seed = typeof api.seed === "number" ? api.seed + lv : (Math.random() * 4294967296) >>> 0;
    const s = newRun(d, seed), boss = !!o.boss;
    const drop = Math.max(0, Math.floor(+(o.drop != null ? o.drop : d.drop || 0)) || 0);
    st = Object.assign(s, { lv, zone: d.zone != null ? d.zone : Math.floor(lv / LEVELS_PER_ZONE), par: d.par || 5, shots: 0, rescued: 0, shown: 0, flying: 0, aim: Math.PI / 2, busy: false, full: false, won: false, demo: "", dragging: false, last: null, seed,
      drop, left: drop, drops: 0, boss, presses: 0, teach: !boss && (lv <= 2 || !!d.teach) });
    build(); relayout(); renderBoard(); setTop(true); renderCeil(); renderQueue(false); renderGoal(false);
    showAim();
    api.say(SYMS[st.cur]);
    if (boss) { /* 爬塔：開場由爬塔模組自己講 */ }
    else if (lv === 0 && !talkedIntro) { talkedIntro = true; later(() => api.talk("三個一樣的連在一起，就會破掉喔！把小企鵝救出來！"), 1300); }
    else if (st.zone > 0 && lv % LEVELS_PER_ZONE === 0 && !talkedZone[st.zone]) { const z = st.zone; talkedZone[z] = true; later(() => api.talk(ZONE_INTRO[z]), 1300); }
    if (st.teach) later(() => { if (canAct() && !st.demo && !st.dragging && st.shots === 0) showDemo(); }, 900);
    armIdle();
  }
  function stop() {
    const was = st;
    run++; idleTok++;
    teardown();
    st = null;
    if (was && api.onStop) { try { api.onStop({ level: was.lv, boss: !!was.boss, won: !!was.won }); } catch (e) { console.warn("[bubble] onStop", e); } }   // 主程式用來知道 Boss 被收掉了
  }
  function boardRows() {
    if (!st) return [];
    let last = -1; each(st.g, r => { last = Math.max(last, r); });
    const out = []; for (let r = 0; r <= last; r++) out.push(st.g[r].map(v => v === PEN ? "A" : v === STONE ? "X" : v === NONE ? "." : String(st.ids.indexOf(v) + 1)).join(""));
    return out;
  }
  function state() {
    if (!st) return null;
    let stones = 0, low = -1;
    const counts = {}; st.ids.forEach(i => counts[SYMS[i]] = 0); each(st.g, (r, c, v) => { low = Math.max(low, r + topOf(st.g)); if (v === STONE) stones++; else if (v !== PEN) counts[SYMS[v]] = (counts[SYMS[v]] || 0) + 1; });
    return { level: st.lv, shots: st.shots, par: st.par, rescued: st.rescued, need: st.need, busy: st.busy, full: st.full, won: st.won,
      cur: st.cur === NONE ? null : SYMS[st.cur], next: st.next === NONE ? null : SYMS[st.next], aim: st.aim, demo: st.demo, seed: st.seed,
      penguinsLeft: penguinsLeft(st.g), counts, stones, board: boardRows(), last: st.last, win: st.winInfo || null,
      top: topOf(st.g), low, drop: st.drop, left: st.left, drops: st.drops, boss: st.boss, presses: st.presses, teach: st.teach };   // low＝最下面那顆在畫面第幾列（≥ 12＝碰底線）
  }
  const symIdx = s => (typeof s === "number" ? s : SYMS.indexOf(s));
  const debug = {
    aim(angle) { if (!st) return null; hideDemo(true); idleTok++; st.aim = Math.min(A_MAX, Math.max(A_MIN, angle)); const tr = showAim(); armIdle(); return tr && tr.cell ? tr.cell.slice() : null; },
    fire: () => fire_(),
    bestShot,
    predict() { if (!st) return null; const tr = trace(st.g, st.aim); return { cell: tr.cell && tr.cell.slice(), pts: tr.pts.map(p => p.map(v => +v.toFixed(3))) }; },
    showDemo: () => showDemo(),
    swap: () => swapQueue(),
    load(def, i = 0, o) { start(i, def, o); },                             // 測試用：載入自訂盤面（o＝{ drop, boss }）
    setQueue(c, n) { if (!st) return; st.cur = symIdx(c); if (n != null) st.next = symIdx(n); renderQueue(false); showAim(); },
    dropNow() { if (!canAct() || !st.drop) return false; st.busy = true; D.fire.classList.add("bb-busy"); hideDemo(true); drawAim(""); st.left = st.drop; dropCeil(true); return true; },   // 測試用：馬上降一排
    geom: { FIELD_W, FIELD_H, SHOOT_X, SHOOT_Y, DEAD_Y, ROWS },
  };
  return { start: (i, o) => start(i, null, o), stop, sayCurrent: () => { if (st && st.cur !== NONE) api.say(SYMS[st.cur]); }, relayout, state, debug };
}
