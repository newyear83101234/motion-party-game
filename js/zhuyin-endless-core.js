// ===================== 無限玩遊戲的共用出題核心（11-01，docs/zhuyin-endless-plan.md §1）=====================
// 給「跑跑大冒險」（js/zhuyin-run.js）和「小魚長大記」（js/zhuyin-grow.js）共用：純邏輯、不碰畫面。
//
// 題目階梯 6 級（tier）：
//   1 聲母（選項彼此差很多）   2 聲母＋長得像／聽起來像   3 韻母（含ㄧㄨㄩ）
//   4 一個字的拼音（聽「貓」選ㄇㄠ）   5 聲調（聽「馬」選ㄇㄚˇ／ㄇㄚˊ…）   6 兩個字的詞
// 區域（zone，0 起算）決定「計畫的級數」ZONE_TIER；8 區走完＝第 2 圈（loop ≥ 1），題目 3–6 級混著出。
// 自動調整：連錯 2 題 → 退一級（ease +1，畫面可以放慢）；之後連對 3 題 → 升回去。小孩看到的區域照走，不會覺得被降級。
//
// 題目物件 q：
//   { tier, kind: "sym"|"syl"|"tone"|"word", answer: "ㄇㄠ", options: ["ㄇㄠ","ㄋㄠ","ㄇㄡ"]（已洗牌、含 answer）,
//     say: 要念的字（預錄的鑰匙：注音符號或國字）, alt: 還沒錄音時給系統語音念的字（沒有＝跟 say 一樣）,
//     pic: 圖（表情符號；聽音題沒有圖＝null）, word: 詞庫那筆（4–6 級）或 null, id: 去重用 }
import { WORDS } from "./zhuyin-words.js";

export const ZONES_N = 8;
export const ZONE_TIER = [1, 2, 3, 3, 4, 5, 6, 6];           // 第 1–8 區計畫的級數（第 4 區還是韻母：小孩最容易卡在這裡，多練一區）
export const TIER_NAME = ["", "聲母", "像的聲母", "韻母", "一個字", "聲調", "兩個字"];
export const INITIALS = [..."ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ"];
export const FINALS = [..."ㄧㄨㄩㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ"];
// 長得像或聽起來像的一組（第 2、3 級一定放一個進選項）
const LOOK = [["ㄅ", "ㄆ"], ["ㄉ", "ㄊ"], ["ㄋ", "ㄌ"], ["ㄍ", "ㄎ"], ["ㄐ", "ㄑ"], ["ㄓ", "ㄗ"], ["ㄔ", "ㄘ"], ["ㄕ", "ㄙ"], ["ㄈ", "ㄏ"], ["ㄖ", "ㄌ"], ["ㄇ", "ㄋ"],
  ["ㄢ", "ㄤ"], ["ㄣ", "ㄥ"], ["ㄛ", "ㄡ"], ["ㄜ", "ㄝ"], ["ㄟ", "ㄝ"], ["ㄧ", "ㄩ"], ["ㄠ", "ㄡ"], ["ㄞ", "ㄟ"], ["ㄨ", "ㄛ"], ["ㄚ", "ㄛ"]];
// 符號還沒預錄的（Gemini 額度用完前只錄了泡泡用的 17 個聲母）：系統語音念這個字（音一樣）
export const ALT = { "ㄈ": "佛", "ㄗ": "資", "ㄘ": "疵", "ㄙ": "思", "ㄧ": "衣", "ㄨ": "屋", "ㄩ": "迂", "ㄚ": "啊", "ㄛ": "喔", "ㄜ": "鵝", "ㄝ": "耶",
  "ㄞ": "哀", "ㄟ": "欸", "ㄠ": "凹", "ㄡ": "歐", "ㄢ": "安", "ㄣ": "恩", "ㄤ": "骯", "ㄥ": "鞥", "ㄦ": "兒" };
const TONES = ["", "ˊ", "ˇ", "ˋ", "˙"];
// 不拿來當「聽音題的答案」（可以當錯的選項）：ㄦ太少用；ㄝ、ㄟ、ㄥ 沒有同音的常用字給系統語音念（耶＝ㄧㄝ、欸是破音字、鞥罕用；櫻木 11-01）→ 等 Gemini 補錄好再開
const NO_ASK = ["ㄦ", "ㄝ", "ㄟ", "ㄥ"];

const lookOf = c => { const out = new Set(); for (const g of LOOK) if (g.includes(c)) g.forEach(x => x !== c && out.add(x)); return [...out]; };
const splitSyl = s => { const t = TONES.indexOf(s[s.length - 1]); return t > 0 ? { sym: s.slice(0, -1), tone: t } : { sym: s, tone: 0 }; };
const joinSyl = ({ sym, tone }) => sym + TONES[tone];
const initOf = sym => (INITIALS.includes(sym[0]) ? sym[0] : "");
const ONE = WORDS.filter(w => !w.z.includes(" ") && !w.z.includes("˙"));                       // 一個字（36 個左右）
const TWO = WORDS.filter(w => w.z.split(" ").length === 2 && !w.z.includes("˙"));               // 兩個字、沒有輕聲

// 把一個音節換掉一個地方（聲母／韻母），盡量換成長得像的；換不出來回傳 null
function mutate(syl, rnd, part) {
  const { sym, tone } = splitSyl(syl), ini = initOf(sym), fin = sym.slice(ini.length);
  const pick = a => a[Math.floor(rnd() * a.length)];
  if (part === "ini" && ini) {
    const pool = lookOf(ini).filter(x => INITIALS.includes(x)); const n = pool.length && rnd() < 0.7 ? pick(pool) : pick(INITIALS.filter(x => x !== ini));
    return joinSyl({ sym: n + fin, tone });
  }
  if (fin) {
    const last = fin[fin.length - 1], head = fin.slice(0, -1);
    const pool = lookOf(last).filter(x => FINALS.includes(x) && x !== head); const n = pool.length && rnd() < 0.7 ? pick(pool) : pick(FINALS.filter(x => x !== last && x !== head && !"ㄦ".includes(x)));
    return joinSyl({ sym: ini + head + n, tone });
  }
  return null;
}
function shuffle(a, rnd) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// rnd：亂數（測試可以給固定種子）；opts(tier, zone) → 這題要幾個選項（遊戲決定；預設 3）
export function createAsker({ rnd = Math.random, opts = () => 3 } = {}) {
  const st = { zone: 0, loop: 0, ease: 0, okRun: 0, ngRun: 0, recent: [], asked: 0, right: 0 };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const planned = () => (st.loop > 0 ? 3 + Math.floor(rnd() * 4) : ZONE_TIER[Math.min(st.zone, ZONES_N - 1)]);
  const fresh = (list, key) => { const ok = list.filter(x => !st.recent.includes(key(x))); return ok.length ? ok : list; };
  function remember(id) { st.recent.push(id); if (st.recent.length > 5) st.recent.shift(); }
  function fill(answer, cands, n) {                     // 選項：answer＋候選（去重、排除 answer）湊到 n 個
    const out = [answer];
    for (const c of cands) { if (out.length >= n) break; if (c && !out.includes(c)) out.push(c); }
    return out;
  }
  function symQ(tier, n) {
    const pool = tier === 3 ? FINALS.filter(x => !NO_ASK.includes(x)) : tier === 2 ? INITIALS.filter(x => lookOf(x).some(y => INITIALS.includes(y))) : INITIALS;
    const a = pick(fresh(pool, x => x));
    const same = tier === 3 ? FINALS : INITIALS, near = lookOf(a).filter(x => same.includes(x));
    const far = shuffle(same.filter(x => x !== a && !near.includes(x) && x !== "ㄦ"), rnd);
    const cands = tier === 1 ? far : [...shuffle(near, rnd).slice(0, 1), ...far];
    return { kind: "sym", answer: a, options: shuffle(fill(a, cands, n), rnd), say: a, alt: ALT[a] || a, pic: null, word: null, id: a };
  }
  function sylQ(tier, n) {
    const w = pick(fresh(ONE, x => x.h)), a = w.z;
    let cands;
    if (tier === 5) {                                   // 聲調：同一個音、換聲調（不出輕聲）
      const { sym, tone } = splitSyl(a); cands = shuffle([0, 1, 2, 3].filter(t => t !== tone), rnd).map(t => joinSyl({ sym, tone: t }));
    } else {
      cands = []; for (let k = 0; k < 12 && cands.length < n + 2; k++) { const m = mutate(a, rnd, k % 2 ? "fin" : "ini"); if (m && m !== a && !cands.includes(m)) cands.push(m); }
    }
    return { kind: tier === 5 ? "tone" : "syl", answer: a, options: shuffle(fill(a, cands, n), rnd), say: w.h, alt: w.h, pic: w.e, word: w, id: w.h };
  }
  function wordQ(n) {
    const w = pick(fresh(TWO, x => x.h)), a = w.z, syls = a.split(" "), cands = [];
    for (let k = 0; k < 16 && cands.length < n + 2; k++) {            // 每個錯的選項只差一個地方（一個字的聲母／韻母／聲調）
      const i = Math.floor(rnd() * syls.length), r = rnd(), s = [...syls];
      if (r < 0.25) { const { sym, tone } = splitSyl(s[i]); s[i] = joinSyl({ sym, tone: pick([0, 1, 2, 3].filter(t => t !== tone)) }); }
      else { const m = mutate(s[i], rnd, r < 0.6 ? "ini" : "fin"); if (!m) continue; s[i] = m; }
      const c = s.join(" "); if (c !== a && !cands.includes(c)) cands.push(c);
    }
    return { kind: "word", answer: a, options: shuffle(fill(a, cands, n), rnd), say: w.h, alt: w.h, pic: w.e, word: w, id: w.h };
  }
  const api = {
    // 換區：zone 0 起算；超過 ZONES_N 自動算成第 2 圈
    setZone(z) { st.zone = z % ZONES_N; st.loop = Math.floor(z / ZONES_N); },
    tier() { return Math.max(1, (st.loop > 0 ? 6 : ZONE_TIER[Math.min(st.zone, ZONES_N - 1)]) - st.ease); },   // 現在這區的級數（第 2 圈＝最高 6 級；實際出題時第 2 圈 3–6 級隨機）
    ease() { return st.ease; },                         // 0＝照計畫；1–2＝小孩在卡，遊戲可以放慢一點
    next() {
      const tier = Math.max(1, planned() - st.ease), n = Math.max(2, opts(tier, st.zone + st.loop * ZONES_N) | 0);
      let q = null;
      for (let k = 0; k < 6 && !q; k++) {
        const c = tier <= 3 ? symQ(tier, n) : tier <= 5 ? sylQ(tier, n) : wordQ(n);
        if (c.options.length >= 2) q = c;
      }
      q.tier = tier; remember(q.id); st.asked++;
      return q;
    },
    // 回報這題結果；回傳 { ease, changed }（changed＝級數剛變了）
    report(ok) {
      const before = st.ease;
      if (ok) { st.right++; st.ngRun = 0; st.okRun++; if (st.ease > 0 && st.okRun >= 3) { st.ease--; st.okRun = 0; } }
      else { st.okRun = 0; st.ngRun++; if (st.ngRun >= 2) { st.ease = Math.min(2, st.ease + 1); st.ngRun = 0; } }
      st.ease = Math.min(st.ease, st.loop > 0 ? 2 : ZONE_TIER[Math.min(st.zone, ZONES_N - 1)] - 1);   // 第 1 級沒得退
      return { ease: st.ease, changed: st.ease !== before };
    },
    stats() { return { asked: st.asked, right: st.right, zone: st.zone, loop: st.loop, ease: st.ease }; },
  };
  return api;
}

// ===================== 看圖選注音（跑跑大冒險 v2，阿葉 11-01）=====================
// 阿葉原話：「不要用聽聲音的，要用一個動作或物品，來去看說兩邊哪個才是正確的注音，接著速度要越來越快，總共先設定 30 個」
// 只出有圖（表情符號）的詞，不念題；兩個選項（左右兩邊）。難度跟著「第幾題／共幾題」走：
//   第 1 級（前 27%）一個字、錯的選項是別的字（聲母韻母都不一樣，差很多）
//   第 2 級（到 54%）一個字、錯的選項只差一個符號（盡量挑長得像的）
//   第 3 級（到 74%）一個字、錯的選項只差聲調
//   第 4 級（最後）  兩個字的詞（動作多在這裡：跑步、游泳、睡覺、唱歌、跳舞）、錯的選項只差一個地方
// 連錯 2 題 → 接下來 3 題降一級（不會低於第 1 級）。q 的格式跟 createAsker 一樣（answer／options／pic／word／say＝國字）。
export const PIC_LEVEL_NAME = ["", "差很多", "像的注音", "聲調", "兩個字"];
// 跑跑用的 30 張圖（阿葉 11-01「顯示的大圖也用 GPT 生成，預設圖示都太醜了」）：國字 → IMAGE/zhuyin/pic/<檔名>.webp（ChatGPT 洋紅底整張生、tools/draw-art/cut_sheet.py 切）
// 22 個一個字（第 1–3 級）＋8 個兩個字（第 4 級）＝一局 30 道門剛好每張各出一次；圖還沒好或載不到＝模組退回表情符號
export const PIC_DIR = "IMAGE/zhuyin/pic/";
export const PIC_WORDS = { 貓: "cat", 狗: "dog", 魚: "fish", 鳥: "bird", 牛: "cow", 豬: "pig", 蛋: "egg", 麵: "noodles", 碗: "bowl", 船: "boat", 球: "ball", 書: "book",
  床: "bed", 門: "door", 手: "hand", 花: "flower", 樹: "tree", 雨: "rain", 火: "fire", 山: "mountain", 笑: "laugh", 哭: "cry",
  跑步: "run", 游泳: "swim", 睡覺: "sleep", 唱歌: "sing", 跳舞: "dance", 蘋果: "apple", 雨傘: "umbrella", 飛機: "airplane" };
// 阿葉自己加的題目（11-01「題目我想自己增加幾個，你穿插在其中」；放公開網站是阿葉選的；原本還有一個地名，阿葉後來說拿掉）：不在貼紙詞庫裡（不給貼紙），每局一定出、穿插在 CUSTOM_AT 這幾題（0 起算）
// 圖不畫真人長相、不畫商標：周杰倫＝戴墨鏡彈琴的卡通歌手、清心福全＝一杯珍珠飲料
export const PIC_CUSTOM = [
  { h: "周杰倫", z: "ㄓㄡ ㄐㄧㄝˊ ㄌㄨㄣˊ", e: "🎹", img: "jay" },
  { h: "清心福全", z: "ㄑㄧㄥ ㄒㄧㄣ ㄈㄨˊ ㄑㄩㄢˊ", e: "🧋", img: "bubbletea" },
  { h: "鯨魚家", z: "ㄐㄧㄥ ㄩˊ ㄐㄧㄚ", e: "🐳", img: "whalehome" },
];
const CUSTOM_AT = [6, 15, 24];                        // 第 7、16、25 題
export function createPicAsker({ rnd = Math.random, pics = PIC_WORDS, custom = PIC_CUSTOM } = {}) {
  const st = { recent: [], ngRun: 0, easy: 0, asked: 0, right: 0, level: 1 };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const fresh = list => { const ok = list.filter(w => !st.recent.includes(w.h)); return ok.length ? ok : list; };
  // 一局裡每張圖先各出一次（不重複），用完才重抽
  const inSet = w => !pics || Object.prototype.hasOwnProperty.call(pics, w.h);
  const POOL1 = ONE.filter(w => w.e && inSet(w)), POOL2 = TWO.filter(w => w.e && inSet(w));
  const left = { 1: [...POOL1], 2: [...POOL2] };
  const draw = two => { const k = two ? 2 : 1, src = left[k].length ? left[k] : fresh(two ? POOL2 : POOL1), w = pick(src); left[k] = left[k].filter(x => x !== w); return w; };
  const levelOf = (i, n) => { const p = n > 1 ? i / (n - 1) : 0; return p < 0.27 ? 1 : p < 0.54 ? 2 : p < 0.74 ? 3 : 4; };
  function wrongFor(lv, w) {
    const a = w.z;
    if (lv === 1) {                                     // 別的字：聲母、韻母都不一樣
      const { sym } = splitSyl(a), ini = initOf(sym), fin = sym.slice(ini.length);
      const far = ONE.filter(x => { const s = splitSyl(x.z).sym, i2 = initOf(s); return x.h !== w.h && i2 !== ini && s.slice(i2.length) !== fin; });
      return far.length ? pick(far).z : null;
    }
    if (lv === 2) { for (let k = 0; k < 8; k++) { const m = mutate(a, rnd, k % 2 ? "fin" : "ini"); if (m && m !== a) return m; } return null; }
    if (lv === 3) { const { sym, tone } = splitSyl(a); return joinSyl({ sym, tone: pick([0, 1, 2, 3].filter(t => t !== tone)) }); }
    const syls = a.split(" ");
    for (let k = 0; k < 12; k++) {
      const i = Math.floor(rnd() * syls.length), s = [...syls], r = rnd();
      if (r < 0.3) { const { sym, tone } = splitSyl(s[i]); s[i] = joinSyl({ sym, tone: pick([0, 1, 2, 3].filter(t => t !== tone)) }); }
      else { const m = mutate(s[i], rnd, r < 0.65 ? "ini" : "fin"); if (!m) continue; s[i] = m; }
      const c = s.join(" "); if (c !== a) return c;
    }
    return null;
  }
  return {
    // 第 i 題（0 起算）／共 n 題
    next(i, n) {
      const lv = Math.max(1, levelOf(i, n) - (st.easy > 0 ? 1 : 0)); if (st.easy > 0) st.easy--;
      let q = null;
      const ci = custom && n >= 20 ? CUSTOM_AT.indexOf(i) : -1;   // 自訂題（局太短就不出）
      if (ci >= 0 && custom[ci]) {
        const w = custom[ci], syls = w.z.split(" ");
        for (let k = 0; k < 16 && !q; k++) {              // 錯的選項：第 1 級改兩個字的聲母（差很多）、第 2 級改一個地方、第 3 級改一個聲調、第 4 級三選一
          const s = [...syls], idx = shuffle(syls.map((_, j) => j), rnd);
          const nChange = lv === 1 ? Math.min(2, syls.length) : 1;
          for (let c = 0; c < nChange; c++) {
            const j = idx[c], how = lv === 3 ? "tone" : lv === 4 ? pick(["tone", "ini", "fin"]) : lv === 1 ? "ini" : pick(["ini", "fin"]);
            if (how === "tone") { const { sym, tone } = splitSyl(s[j]); s[j] = joinSyl({ sym, tone: pick([0, 1, 2, 3].filter(t => t !== tone)) }); }
            else { const m = mutate(s[j], rnd, how); if (m) s[j] = m; }
          }
          const bad = s.join(" ");
          if (bad !== w.z) q = { kind: "pic", tier: lv, answer: w.z, options: shuffle([w.z, bad], rnd), say: w.h, alt: w.h, pic: w.e, word: null, id: w.h, custom: true,
            img: w.img ? PIC_DIR + w.img + ".webp" : null };
        }
        if (q) { st.level = q.tier; st.asked++; return q; }
      }
      for (let k = 0; k < 8 && !q; k++) {
        const w = draw(lv === 4), bad = wrongFor(lv, w);
        if (bad && bad !== w.z) q = { kind: "pic", tier: lv, answer: w.z, options: shuffle([w.z, bad], rnd), say: w.h, alt: w.h, pic: w.e, word: w, id: w.h,
          img: pics && pics[w.h] ? PIC_DIR + pics[w.h] + ".webp" : null };
      }
      if (!q) {                                           // 保底（目前詞庫不會走到）：8 次都湊不出錯的選項 → 第一個字＋換聲調，遊戲才不會卡住
        const w = POOL1[0] || ONE[0], { sym, tone } = splitSyl(w.z), bad = joinSyl({ sym, tone: (tone + 1) % 4 });
        q = { kind: "pic", tier: 1, answer: w.z, options: shuffle([w.z, bad], rnd), say: w.h, alt: w.h, pic: w.e, word: w, id: w.h, img: pics && pics[w.h] ? PIC_DIR + pics[w.h] + ".webp" : null };
      }
      st.level = q.tier; st.recent.push(q.id); if (st.recent.length > 8) st.recent.shift(); st.asked++;
      return q;
    },
    report(ok) { if (ok) { st.right++; st.ngRun = 0; } else if (++st.ngRun >= 2) { st.easy = 3; st.ngRun = 0; } return { easy: st.easy }; },
    stats() { return { asked: st.asked, right: st.right, level: st.level, easy: st.easy }; },
  };
}

// 區域名稱／表情（兩款遊戲各自用自己的主題，這裡只放共用的「第幾圈」說法）
export const loopName = loop => (loop > 0 ? `第 ${loop + 1} 圈` : "");
