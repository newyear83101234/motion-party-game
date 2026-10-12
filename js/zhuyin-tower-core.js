// ===================== 注音小島：挑戰燈塔（爬塔）純邏輯 =====================
// 規格 docs/zhuyin-v6-plan.md §5（櫻木設計、米卡莎隱私有條件 PASS）。這個檔不碰 DOM／網路，node 可以直接測（tools/zy-test/tower-unit.mjs）。
// 內容：24 個代號、10 段 × 10 層的樓層表（每層玩哪個遊戲、幾題、等級、沙漏、記憶／藏圖）、Boss、愛心、存檔點、獎勵、保底、本機存檔清洗、
//       跟後端同步（tw_ping／tw_score：傳進來的 post 函式負責真的送）。
// 畫面與流程在 js/zhuyin-tower.js；主程式接線在 js/zhuyin.js「挑戰燈塔」段。國字都會被 tools/build_zhuyin_ui.py 收進注音字典。

export const TOP = 100;                                  // 登頂樓層
export const HEARTS = 3;                                 // 一般愛心上限
export const MODES7 = ["fish", "order", "build", "hunt", "tone", "whack", "frog"];   // 一層一個遊戲（短題輪替）
export const READ_MODES = new Set(["order", "hunt"]);    // 看注音的遊戲：flash（注音亮 2 秒蓋起來）只用在這兩個
export const EAR_MODES = new Set(["fish", "tone", "whack", "frog"]);   // 聽音題：noPic（題目圖藏起來）只用在這幾個

// 24 個代號（12 生肖＋12 星座）：id 跟後端 tools/plaza/gas/Code.js 的 PLAZA.TOWER_CODES 一樣（順序也一樣）
export const CODES = [
  { id: "rat", e: "🐭", name: "鼠" }, { id: "ox", e: "🐮", name: "牛" }, { id: "tiger", e: "🐯", name: "虎" }, { id: "rabbit", e: "🐰", name: "兔" },
  { id: "dragon", e: "🐲", name: "龍" }, { id: "snake", e: "🐍", name: "蛇" }, { id: "horse", e: "🐴", name: "馬" }, { id: "goat", e: "🐑", name: "羊" },
  { id: "monkey", e: "🐵", name: "猴" }, { id: "rooster", e: "🐔", name: "雞" }, { id: "dog", e: "🐶", name: "狗" }, { id: "pig", e: "🐷", name: "豬" },
  { id: "aries", e: "♈", name: "牡羊座" }, { id: "taurus", e: "♉", name: "金牛座" }, { id: "gemini", e: "♊", name: "雙子座" }, { id: "cancer", e: "♋", name: "巨蟹座" },
  { id: "leo", e: "♌", name: "獅子座" }, { id: "virgo", e: "♍", name: "處女座" }, { id: "libra", e: "♎", name: "天秤座" }, { id: "scorpio", e: "♏", name: "天蠍座" },
  { id: "sagittarius", e: "♐", name: "射手座" }, { id: "capricorn", e: "♑", name: "摩羯座" }, { id: "aquarius", e: "♒", name: "水瓶座" }, { id: "pisces", e: "♓", name: "雙魚座" },
];
export const codeOf = id => CODES.find(c => c.id === id) || null;
export const SEC_RE = /^[0-9a-f]{32}$/;                   // 秘密碼：128-bit 隨機數的 hex（只存本機；後端只存 SHA-256 雜湊）

// 第 100 層最後一關「用積木拼出登頂」的題目（詞物件格式跟 js/zhuyin-words.js 一樣）
export const SUMMIT_WORD = { h: "登頂", z: "ㄉㄥ ㄉㄧㄥˇ", e: "🏔️", c: "thing" };

// ---------- 10 段的參數（§5.3 表）----------
// lv＝主程式 §2.3 的等級；timer：off 不計時／silver 沙漏跑完只變銀／heart 沙漏跑完扣心；n＝每層題數；flash／noPic 見上；
// key＝這段的新東西（教學層貓頭鷹講的那句在 js/zhuyin-tower.js LINES.seg[key]）；pref＝教學層（每段第 1 層）要用哪幾個遊戲才看得到新東西
export const SEGS = [
  { lv: 1, timer: "off", n: 3, key: "start", pref: ["fish"] },                   // 1–10（第 1 層＝最熟的釣魚）
  { lv: 2, timer: "off", n: 3, key: "look" },                                    // 11–20 干擾變像
  { lv: 3, timer: "silver", n: 3, key: "sand", pref: ["fish", "order", "build", "hunt", "tone", "frog"] },   // 21–30 金星沙漏（打地鼠不計時）
  { lv: 3, timer: "heart", n: 4, key: "time", pref: ["fish", "order", "build", "hunt", "tone", "frog"] },    // 31–40 超時會掉心
  { lv: 4, timer: "heart", n: 4, key: "move", pref: ["fish", "tone"] },          // 41–50 東西會動（魚游、氣球飄）
  { lv: 4, timer: "heart", n: 4, flash: true, key: "flash", pref: ["order", "hunt"] },   // 51–60 記憶
  { lv: 5, timer: "heart", n: 4, key: "hard" },                                  // 61–70 最難參數
  { lv: 5, timer: "heart", n: 4, flash: true, key: "hardflash", pref: ["order", "hunt"] },   // 71–80
  { lv: 5, timer: "heart", n: 4, flash: true, noPic: true, key: "ears", pref: ["fish", "tone", "frog"] },   // 81–90 只靠耳朵
  { lv: 5, timer: "heart", n: 5, flash: true, noPic: true, key: "last" },        // 91–100 每層 5 題
];
// 泡泡 Boss：盤面＝現有關卡由易到難（0 起；只用第 1–3 區的 30 關，不依賴新區）、天花板每幾發下壓一排
export const BOSS_BUBBLE = { 10: { level: 2, every: 8 }, 30: { level: 8, every: 8 }, 50: { level: 14, every: 7 }, 70: { level: 20, every: 7 }, 90: { level: 26, every: 6 }, 100: { level: 29, every: 6 } };
export const MIX_N = 6;                                   // 6 題連戰：每題換一種遊戲

export const segOf = f => Math.max(0, Math.min(9, Math.floor((f - 1) / 10)));   // 第 1–10 層＝第 0 段
export const isBoss = f => f >= 10 && f % 10 === 0;
export const bossKind = f => (!isBoss(f) ? "" : f === TOP ? "final" : (f / 10) % 2 === 1 ? "bubble" : "mix");   // 10/30/50/70/90 泡泡、20/40/60/80 連戰、100 最後
export const isTeach = f => f % 10 === 1;                 // 每段第 1 層（1、11、21…）＝教學層：不扣心
export const isHeal = f => f % 10 === 5;                  // 第 5、15、25…層開場補 1 顆心（上限 3）
export const nextBoss = f => Math.min(TOP, Math.floor(f / 10) * 10 + 10);   // f 層之後的下一個 Boss（f 本身是 Boss 就是再上去那個）
export const startFloor = t => Math.min(TOP, (t.cp | 0) + 1);

// ---------- 確定性亂數（樓層表依樓層編號固定，不是每次隨機）----------
export function rng(seed) {                               // mulberry32（跟偵探模組同一個）
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(a, rnd) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// 一段的 9 個一般層（10s+1 … 10s+9）各玩哪個遊戲：7 種都至少一次、不連續重複、教學層用 pref 裡的
const segCache = new Map();
export function segModes(s) {
  if (segCache.has(s)) return segCache.get(s).slice();
  const rnd = rng(9001 + s * 7919), pref = SEGS[s].pref || MODES7;
  const extra = [MODES7[(s * 2) % 7], MODES7[(s * 2 + 1) % 7]];   // 多出來的 2 層輪流給不同遊戲（10 段下來每個遊戲次數差不多）
  let seq = null;
  for (let k = 0; k < 2000 && !seq; k++) {
    const c = shuffle([...MODES7, ...extra], rnd);
    if (!pref.includes(c[0])) continue;
    if (c.some((m, i) => i > 0 && m === c[i - 1])) continue;
    seq = c;
  }
  if (!seq) seq = [...MODES7, ...extra];                  // （理論上不會到這裡）
  segCache.set(s, seq);
  return seq.slice();
}
// Boss 連戰的 6 題：6 種不同的遊戲（依段固定）
export function mixModes(s) { return shuffle(MODES7, rng(5003 + s * 104729)).slice(0, MIX_N); }

// 一個「玩」的步驟（交給主程式 playFloor 的 opts；onEvent 由畫面模組補）
function floorStep(seg, mode, n, timer) {
  const S = SEGS[seg], extra = {};
  if (S.flash && READ_MODES.has(mode)) extra.flash = true;
  if (S.noPic && EAR_MODES.has(mode)) extra.noPic = true;
  return { type: "floor", mode, n, lv: S.lv, timer: timer || S.timer, extra };
}
// 第 f 層要玩什麼：{ f, seg, kind: "normal"|"bubble"|"mix"|"final", teach, heal, boss, steps:[…] }
//   steps：{ type:"floor", mode, n, lv, timer, extra } 或 { type:"bubble", level, every }
export function floorPlan(f) {
  f = Math.max(1, Math.min(TOP, f | 0));
  const seg = segOf(f), S = SEGS[seg], kind = bossKind(f) || "normal";
  const plan = { f, seg, kind, teach: isTeach(f), heal: isHeal(f), boss: kind !== "normal", key: S.key, steps: [] };
  if (kind === "normal") plan.steps.push(floorStep(seg, segModes(seg)[(f - 1) % 10], S.n));
  else if (kind === "bubble") plan.steps.push({ type: "bubble", ...BOSS_BUBBLE[f] });
  else {
    for (const m of mixModes(seg)) plan.steps.push(floorStep(seg, m, 1, "heart"));   // 連戰：每題換一種遊戲、超時扣心、參數用該段
    if (kind === "final") {
      plan.steps.push({ type: "bubble", ...BOSS_BUBBLE[TOP] });
      const b = floorStep(seg, "build", 1, "heart"); b.extra = { words: [SUMMIT_WORD] }; plan.steps.push(b);   // 用積木拼出「登頂」
    }
  }
  return plan;
}
// 整座塔每一層的遊戲（測試、家長看用）
export const towerTable = () => Array.from({ length: TOP }, (_, i) => floorPlan(i + 1));

// ---------- 愛心 ----------
// { red: 0..3 一般愛心, gold: 0..2 保底送的金色愛心 }；掉心先掉紅的（補心只補紅的，金色的留到最後當保險）
export const newHearts = (gold = 0) => ({ red: HEARTS, gold: Math.max(0, Math.min(2, gold | 0)) });
export const heartsLeft = h => h.red + h.gold;
export function loseHeart(h) { if (h.red > 0) return { ...h, red: h.red - 1 }; if (h.gold > 0) return { ...h, gold: h.gold - 1 }; return { ...h }; }
export const healHeart = h => ({ ...h, red: Math.min(HEARTS, h.red + 1) });
export const refillHearts = h => ({ ...h, red: HEARTS });
// 這一件事要不要扣心：教學層不扣；wrong 一定扣；timeout 只在沙漏「扣心」模式；press＝泡泡碰到底線
export function costsHeart(plan, step, ev) {
  if (!plan || plan.teach || !ev) return false;
  if (ev.type === "wrong" || ev.type === "press") return true;
  if (ev.type === "timeout") return !!step && step.timer === "heart";
  return false;
}
// 保底（§5.3）：同一段連輸 3 場 → 開場多 1 顆金色愛心；連輸 5 場 → 多 2 顆
export function goldFor(t, floor) { const s = segOf(floor), n = t.lose && t.lose.s === s ? t.lose.n : 0; return n >= 5 ? 2 : n >= 3 ? 1 : 0; }

// ---------- 存檔 ----------
// 本機（localStorage zy{存檔位}_tower）：
//   code 代號 id／sec 秘密碼（只在本機）／cp 存檔點（打過的最高 Boss 層，0..90）／best 最高通過樓層（上排行榜的數字）／last 上一場插旗的樓層／
//   sent 後端確認收到的最高樓層／lose { s 段, n 同段連輸幾場 }／paid5 拿過星星的最高 5 倍數層（不歸零）／badges 打倒過的 Boss 層（塔徽章，不歸零）／
//   crown 登頂王冠（不歸零）／gDay、gN 今天給過幾場保底星星／pingDay 上次回報「來了」的日子（只在本機，後端不存登入日）／
//   notice 代號被收回了要跟小孩說（"lost"）／runs 爬過幾場／seen 聽過開場教學
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const int = (v, lo, hi, d = lo) => { const n = Math.floor(+v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
export function cleanTower(raw) {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const code = typeof r.code === "string" && codeOf(r.code) ? r.code : "";
  const sec = code && typeof r.sec === "string" && SEC_RE.test(r.sec) ? r.sec : "";
  const t = {
    code: code && sec ? code : "", sec: code && sec ? sec : "",
    cp: Math.floor(int(r.cp, 0, 90) / 10) * 10,
    best: int(r.best, 0, TOP), last: int(r.last, 0, TOP), sent: int(r.sent, 0, TOP),
    lose: { s: int(r.lose && r.lose.s, 0, 9), n: int(r.lose && r.lose.n, 0, 99) },
    paid5: int(r.paid5, 0, TOP),
    badges: [...new Set(Array.isArray(r.badges) ? r.badges.map(x => Math.floor(+x)).filter(x => x <= TOP && isBoss(x)) : [])].sort((a, b) => a - b),   // 超出範圍的丟掉（不夾）
    crown: r.crown ? 1 : 0,
    gDay: typeof r.gDay === "string" && DAY_RE.test(r.gDay) ? r.gDay : "", gN: int(r.gN, 0, 3),
    pingDay: typeof r.pingDay === "string" && DAY_RE.test(r.pingDay) ? r.pingDay : "",
    notice: r.notice === "lost" ? "lost" : "",
    runs: int(r.runs, 0, 99999), seen: r.seen ? 1 : 0,
  };
  if (t.best < t.cp) t.best = t.cp;                       // 存檔點一定是通過過的
  if (!t.code) t.sent = 0;
  if (t.sent > t.best) t.sent = t.best;
  return t;
}
// 代號被收回（一週沒來被釋出、被別人選走、家長放棄）：本機樓層歸零，徽章／王冠／拿過的星星保留
export function applyLost(t, notice = "lost") {
  t.code = ""; t.sec = ""; t.cp = 0; t.best = 0; t.last = 0; t.sent = 0; t.lose = { s: 0, n: 0 }; t.pingDay = ""; t.notice = notice === "lost" ? "lost" : "";
  return t;
}
// 選到代號了（tw_claim 成功）：f＝後端回的樓層（同一個人重新選才可能 > 0）
export function applyClaim(t, code, sec, f, day) {
  t.code = code; t.sec = sec; t.notice = ""; t.pingDay = day || ""; t.sent = Math.min(t.best, Math.max(0, f | 0));
  return t;
}
export const scorePending = t => !!(t.code && t.sec && t.best > t.sent);

// ---------- 一層通過的獎勵（§5.5：只獎勵第一次）----------
// 回 { star 0|1 第一次到這個 5 的倍數層, coin 0|1 第一次打倒這個 Boss, badge 0|Boss 層, crown 第一次登頂, boss, cp 新存檔點 }
export function clearFloor(t, f) {
  const r = { star: 0, coin: 0, badge: 0, crown: false, boss: isBoss(f), cp: t.cp };
  if (f > t.best) t.best = f;
  if (f % 5 === 0 && f > t.paid5) { t.paid5 = f; r.star = 1; }
  if (r.boss) {
    t.cp = Math.max(t.cp, Math.min(90, f)); r.cp = t.cp;   // 第 100 層打完存檔點還是 90（想再登頂就從 91 層爬）
    if (!t.badges.includes(f)) { t.badges = [...t.badges, f].sort((a, b) => a - b); r.coin = 1; r.badge = f; }
    if (f === TOP && !t.crown) { t.crown = 1; r.crown = true; }
    t.lose = { s: segOf(Math.min(TOP, f + 1)), n: 0 };   // 打過 Boss＝連輸重算
  }
  return r;
}
// 一場結束（愛心用完 fail／休息 rest／登頂 summit）：記旗子、連輸、保底星星。run＝{ reached 這場最高通過樓層, floor 停在哪一層, played 有沒有真的玩到題目, stars 這場拿到幾顆 }
// 回 { guarantee 0|1 保底星星, prev 上一場旗子, lose 同段連輸幾場 }
export function endRun(t, run, kind, day) {
  const prev = t.last, out = { guarantee: 0, prev, lose: 0 };
  t.last = Math.max(0, run.reached | 0);
  t.runs++;
  if (kind === "fail") {
    const s = segOf(run.floor || 1);
    t.lose = t.lose.s === s ? { s, n: Math.min(99, t.lose.n + 1) } : { s, n: 1 };
  }
  out.lose = t.lose.s === segOf(startFloor(t)) ? t.lose.n : 0;
  if (run.played && !(run.stars > 0)) {                   // 每場保底 1 星（這場一顆都沒拿到才補；一天最多 3 場）
    if (t.gDay !== day) { t.gDay = day; t.gN = 0; }
    if (t.gN < 3) { t.gN++; out.guarantee = 1; }
  }
  return out;
}

// ---------- 跟後端同步（tw_ping 每天一次、tw_score 分數排隊重送）----------
// post(body) → Promise<後端回應物件 | null>（null＝連不上／逾時；呼叫端負責真的 fetch）。會改 t；回 { changed, lost, pinged, sent }
// 後端：ping 成功＝延長到期日；lost＝過期被釋出或被別人拿走 → 本機樓層歸零。score 一次最多 +20 → 送到追上為止（最多 6 次）
export async function syncTower(t, post, day, { ping = true } = {}) {
  const out = { changed: false, lost: false, pinged: false, sent: false };
  if (!t.code || !t.sec || typeof post !== "function") return out;
  if (ping && t.pingDay !== day) {
    const r = await post({ k: "tw_ping", c: t.code, s: t.sec });
    if (r && r.ok === true) { t.pingDay = day; out.pinged = true; out.changed = true; }
    else if (r && r.why === "lost") { applyLost(t, "lost"); out.lost = true; out.changed = true; return out; }
    else return out;                                      // 連不上／忙／暫停：下次再說（不動本機）
  }
  for (let k = 0; k < 6 && scorePending(t); k++) {
    const r = await post({ k: "tw_score", c: t.code, s: t.sec, f: t.best });
    if (r && r.ok === true) {
      const f = Math.max(0, Math.min(TOP, Math.floor(+r.f) || 0));
      if (f <= t.sent) break;                             // 沒有前進（不應該發生）：別一直送
      t.sent = Math.min(t.best, f); t.pingDay = day; out.sent = true; out.changed = true;
    } else if (r && r.why === "lost") { applyLost(t, "lost"); out.lost = true; out.changed = true; break; }
    else break;
  }
  return out;
}
// 秘密碼：128-bit 隨機數 → 32 碼小寫 hex（rand＝crypto.getRandomValues，測試可換）
export function newSecret(rand) {
  const b = new Uint8Array(16);
  if (rand) rand(b); else { try { crypto.getRandomValues(b); } catch (e) { return null; } }   // 10-13 赤木：秘密碼是唯一的鑰匙，不退回可預測的 Math.random（拿不到＝這次不選，畫面說連不上）
  return [...b].map(x => x.toString(16).padStart(2, "0")).join("");
}
// 後端 doGet 的 tower 欄位清洗：board 最多 5 筆 {c, f}、taken 代號 id 清單
export function cleanBoard(d) {
  const o = d && typeof d === "object" ? d : {};
  const board = (Array.isArray(o.board) ? o.board : []).filter(x => x && codeOf(x.c) && Number.isFinite(+x.f) && +x.f > 0)
    .map(x => ({ c: x.c, f: Math.min(TOP, Math.floor(+x.f)) })).slice(0, 5);
  const taken = [...new Set((Array.isArray(o.taken) ? o.taken : []).filter(c => typeof c === "string" && codeOf(c)))];
  return { board, taken };
}
export const taipeiDay = ms => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);
