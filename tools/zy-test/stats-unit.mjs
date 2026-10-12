// 遊玩紀錄純邏輯單元測試：node tools/zy-test/stats-unit.mjs
import * as S from "../../js/zhuyin-stats.js";
const out = []; const ok = (n, c, i = "") => out.push(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  — " + i : ""}`);

// 台北時間切日：UTC 16:00 就是台北隔天 00:00
ok("台北切日：UTC 15:59 仍是當天", S.taipeiDay(Date.UTC(2026, 9, 11, 15, 59, 59)) === "2026-10-11");
ok("台北切日：UTC 16:00 變隔天", S.taipeiDay(Date.UTC(2026, 9, 11, 16, 0, 0)) === "2026-10-12");
ok("跨月跨年 shiftDay", S.shiftDay("2026-03-01", -1) === "2026-02-28" && S.shiftDay("2026-12-31", 1) === "2027-01-01");
ok("validDay：2026-02-30 不合法", !S.validDay("2026-02-30") && S.validDay("2026-02-28") && !S.validDay("x") && !S.validDay(null));

// 記錄
let st = S.empty();
ok("不認得的模式忽略", S.startPlay(st, "nope", "2026-10-12") === false && Object.keys(st.modes).length === 0);
ok("原型鏈名稱當模式忽略", S.startPlay(st, "constructor", "2026-10-12") === false && S.startPlay(st, "__proto__", "2026-10-12") === false);
S.startPlay(st, "fish", "2026-10-11"); S.startPlay(st, "fish", "2026-10-12"); S.startPlay(st, "frog", "2026-10-12");
S.addStars(st, "fish", 3, "2026-10-12"); S.addStars(st, "fish", 1, "2026-10-12");
S.addSec(st, 90, "2026-10-11"); S.addSec(st, 30, "2026-10-12"); S.addSec(st, 30, "2026-10-12");
ok("跨日：兩天各自累計", st.days["2026-10-11"].sec === 90 && st.days["2026-10-12"].sec === 60 && st.days["2026-10-12"].plays.fish === 1 && st.days["2026-10-11"].plays.fish === 1);
ok("modes 累計：次數 2、星星 4、最佳 3、最後 10-12", st.modes.fish.plays === 2 && st.modes.fish.stars === 4 && st.modes.fish.best === 3 && st.modes.fish.last === "2026-10-12", JSON.stringify(st.modes.fish));
const rows = S.modeRows(st);
ok("排序：釣魚(2次)在前、青蛙(1次)次之、沒玩過的在最後", rows[0].id === "fish" && rows[1].id === "frog" && rows.slice(2).every(r => !r.played) && rows.length === S.MODE_IDS.length);
ok("平均星星＝星星÷次數＝2", rows[0].avg === 2 && rows[1].avg === 0);
const ld = S.lastDays(st, 7, "2026-10-12");
ok("最近 7 天：7 列、最後是今天、沒玩的天 sec 0", ld.length === 7 && ld[6].day === "2026-10-12" && ld[6].sec === 60 && ld[5].sec === 90 && ld[0].sec === 0 && ld[0].day === "2026-10-06");
ok("dayLabel", S.dayLabel("2026-10-12", "2026-10-12") === "今天" && S.dayLabel("2026-10-11", "2026-10-12") === "昨天" && S.dayLabel("2026-10-09", "2026-10-12") === "3 天前");

// 60 天清理
st = S.empty(); S.startPlay(st, "fish", "2026-08-01"); S.addSec(st, 10, "2026-08-01");
for (let i = 0; i < 60; i++) S.addSec(st, 1, S.shiftDay("2026-10-12", -i));
S.startPlay(st, "fish", "2026-10-12");   // 內部會 prune
ok("60 天清理：59 天前（含今天共 60 天）保留", S.shiftDay("2026-10-12", -59) in st.days);
ok("60 天清理：8-01（72 天前）被清掉、modes 累計不清", !("2026-08-01" in st.days) && st.modes.fish.plays === 2);
S.addSec(st, 5, "2026-08-13"); S.prune(st, "2026-10-12");   // 60 天前＝8-13 → 超出
ok("prune：剛好第 61 天被清", !("2026-08-13" in st.days));

// 清洗
const evil = JSON.parse('{"days":{"__proto__":{"sec":5},"2026-10-12":{"sec":"999999","plays":{"fish":-5,"frog":"7","__proto__":{"x":1},"constructor":3,"hack":9}},"bad-date":{"sec":3},"2026-13-40":{"sec":1}},"modes":{"fish":{"plays":1e12,"stars":-4,"best":99,"last":"2026-10-12"},"__proto__":{"plays":5},"zzz":{"plays":3},"frog":"oops"}}');
const c = S.clean(evil, "2026-10-12");
ok("清洗：壞日期／__proto__ 日期被丟掉", Object.keys(c.days).join() === "2026-10-12", Object.keys(c.days).join());
ok("清洗：sec 上限 86400", c.days["2026-10-12"].sec === 86400);
ok("清洗：plays 只留白名單且 >0（fish -5 丟、frog 7 留、hack/constructor 丟）", JSON.stringify(c.days["2026-10-12"].plays) === '{"frog":7}', JSON.stringify(c.days["2026-10-12"].plays));
ok("清洗：modes 上下限（plays≤1e6、stars≥0、best≤3）", c.modes.fish.plays === 1e6 && c.modes.fish.stars === 0 && c.modes.fish.best === 3);
ok("清洗：非白名單與非物件的 mode 丟掉", Object.keys(c.modes).join() === "fish", Object.keys(c.modes).join());
ok("清洗：原型沒被污染", ({}).plays === undefined && ({}).x === undefined && ({}).sec === undefined);
for (const bad of [null, undefined, 5, "x", [], [1, 2], { days: [] }, { days: "s", modes: 3 }]) { const r = S.clean(bad, "2026-10-12"); if (!(r && typeof r.days === "object" && typeof r.modes === "object" && !Object.keys(r.days).length && !Object.keys(r.modes).length)) ok("清洗：垃圾輸入 " + JSON.stringify(bad), false); }
ok("清洗：垃圾輸入（null、數字、陣列…）都回空結構", true);
ok("清洗：舊於 60 天的天數被清", !("2026-08-01" in S.clean({ days: { "2026-08-01": { sec: 5, plays: {} } } }, "2026-10-12").days));

console.log(out.join("\n")); const bad = out.filter(l => l.startsWith("FAIL")).length; console.log(`\n${out.length - bad}/${out.length} PASS`); process.exit(bad ? 1 : 0);
