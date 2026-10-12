// 注音小島宣傳片 v3 精華版（約 30 秒，IG 限動一則放得下）：從已經錄好的完整版剪，不重錄
// 用法：node tools/promo/make_promo_v3_cut.js [--portrait]
//   讀 make_promo_v3.js 錄完寫的時間標記 %TEMP%\zy_promo3_marks(_p).json（各段發生的秒數＋整支的音效時間軸）
//   → 照標記切 10 小段（標題 → 三座島兩倍速 → 配送站最後一趟＋謝謝你 → 換裝 → 陀螺打字／戰力／最後一擊 → 偵探答對 → 全部上線 → 片尾卡）
//   → 段落交界 0.3 秒交叉淡化；聲音重做：背景音樂從頭重新淡入淡出＋音效照新時間點疊回去（不會在剪接點突然斷掉）
// 輸出：promo/zhuyin-island-promo-v3-30s.mp4、-30s-vertical.mp4
const fs = require("fs"), path = require("path"), os = require("os"), { spawnSync } = require("child_process");
const ROOT = path.resolve(__dirname, "../..");
const PORTRAIT = process.argv.includes("--portrait");
const MJ = path.join(os.tmpdir(), PORTRAIT ? "zy_promo3_marks_p.json" : "zy_promo3_marks.json");
const { marks: K, sfx: SFX, out: SRC } = JSON.parse(fs.readFileSync(MJ, "utf8"));
const OUT = path.join(ROOT, "promo", PORTRAIT ? "zhuyin-island-promo-v3-30s-vertical.mp4" : "zhuyin-island-promo-v3-30s.mp4");
const XF = 0.3, FPS = 30;
const need = (...ks) => { for (const k of ks) if (typeof K[k] !== "number") throw new Error("時間標記缺 " + k + "（先用 make_promo_v3.js 錄完整版）"); };
need("logo", "isles", "dv_won", "dress", "tp_type", "tp_go", "tp_vs", "tp_slow", "tp_result", "dt_tap", "live_stamp", "end", "dur");
// 配送站：吊橋放下之後送到的第一張訂單（卡車開過吊橋 → 居民說謝謝你）；沒有吊橋標記就用最後一張
const dvAll = Object.keys(K).filter(k => /^dv_\d$/.test(k)).map(k => K[k]).sort((a, b) => a - b);
const dvHit = typeof K.dv_bridge === "number" ? dvAll.find(t => t > K.dv_bridge) : undefined;
const dvEnd = dvHit !== undefined ? dvHit + 1.8 : Math.min(Math.max(dvAll[dvAll.length - 1] + 1.6, K.dv_won + 1.3), dvAll[dvAll.length - 1] + 2.4);
const dvStart = Math.max(dvEnd - 4.4, typeof K.dv_bridge === "number" ? K.dv_bridge - 0.6 : dvEnd - 4.4);
// [起, 迄, 速度]（秒，完整版時間軸）
const CLIPS = [
  ["標題", K.logo + 0.8, K.logo + 3.0, 1],
  ["三座島（快轉）", K.isles + 0.75, K.isles + 8.95, 1.85],
  ["配送站", dvStart, dvEnd, 1],
  ["換裝", K.dress + 1.2, K.dress + 4.4, 1],
  ["陀螺打字", K.tp_type - 0.05, K.tp_go + 0.35, 1],
  ["陀螺戰力", K.tp_vs - 0.9, K.tp_vs + 1.4, 1],
  ["陀螺最後一擊", K.tp_slow - 0.3, K.tp_result + 1.0, 1],
  ["偵探", K.dt_tap - 0.9, K.dt_tap + 2.2, 1],
  ["全部上線", K.live_stamp - 1.0, K.live_stamp + 1.6, 1],
  ["片尾", K.end, Math.min(K.dur, K.end + 3.0), 1],
];
for (const c of CLIPS) if (!(c[2] > c[1] && c[1] >= 0 && c[2] <= K.dur + 0.01)) throw new Error("段落時間不對：" + JSON.stringify(c));
const D = CLIPS.map(c => (c[2] - c[1]) / c[3]);
const OFF = []; let o = 0; D.forEach((d, k) => { OFF.push(o); o += d - XF; });
const DUR = o + XF;
console.log(CLIPS.map((c, k) => `${c[0]} ${c[1].toFixed(2)}–${c[2].toFixed(2)}${c[3] !== 1 ? ` ×${c[3]}` : ""} → ${OFF[k].toFixed(2)}`).join("\n"));
console.log(`精華版長度 ${DUR.toFixed(2)} 秒`);
if (DUR > 32) throw new Error("超過 32 秒");

// ---- 影像：切段 → 0.3 秒交叉淡化串起來 ----
const vf = [`[0:v]split=${CLIPS.length}${CLIPS.map((_, k) => `[s${k}]`).join("")}`];
CLIPS.forEach(([, a, b, sp], k) => vf.push(`[s${k}]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=(PTS-STARTPTS)/${sp},fps=${FPS},format=yuv420p[v${k}]`));
let last = "v0";
for (let k = 1; k < CLIPS.length; k++) { const lab = k === CLIPS.length - 1 ? "vout" : `x${k}`; vf.push(`[${last}][v${k}]xfade=transition=fade:duration=${XF}:offset=${(OFF[k]).toFixed(3)}[${lab}]`); last = lab; }

// ---- 聲音：背景音樂重新淡入淡出＋音效照新時間點（跟 make_promo_v3.js encode 同一套檔名、別名、音量） ----
const A = n => path.join(ROOT, "audio", "sfx", n + ".mp3");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "zy_cut_"));
const synth = (name, filter, d) => { const out = path.join(TMP, name + ".wav"); const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", filter, "-t", String(d), out], { encoding: "utf8" }); if (r.status !== 0) throw new Error("合成音效失敗 " + name); return out; };
const FILES = { thump: synth("thump", "sine=f=80:r=44100:d=0.35,volume=2.2,afade=t=out:st=0.05:d=0.3", 0.35), clash: synth("clash", "anoisesrc=d=0.2:c=white:r=44100:a=0.5,highpass=f=2200,lowpass=f=9000,afade=t=out:st=0.01:d=0.18", 0.2) };
for (const f of fs.readdirSync(path.join(ROOT, "audio", "sfx"))) if (f.endsWith(".mp3")) FILES[f.slice(0, -4)] = A(f.slice(0, -4));
const ALIAS = { key: ["tap", 0.5], toneKey: ["tap", 0.6], pick: ["select", 0.6], go: ["whoosh", 0.6], launch: ["whoosh", 0.6], clash: ["clash", 0.7], out: ["thump", 1], topple: ["thump", 0.7], roundWin: ["ok", 0.8], roundLose: ["ng", 0.5], bad: ["ng", 0.5], sparkle: ["sticker", 1] };
const ev = [], lastAt = {};
for (const s of SFX.slice().sort((a, b) => a.t - b.t)) {
  if (s.k === "whoosh" && s.src === "promo") continue;   // 原片轉場的「咻」：精華版沒有斜色塊轉場
  const k0 = CLIPS.findIndex(([, a, b]) => s.t >= a && s.t < b - 0.05); if (k0 < 0) continue;
  const [, a, , sp] = CLIPS[k0], t = OFF[k0] + (s.t - a) / sp;
  let k = s.k, vol = s.vol;
  if (ALIAS[k] && !fs.existsSync(A(k))) { k = ALIAS[k][0]; vol *= ALIAS[s.k][1]; }
  if (!FILES[k] || t > DUR - 0.2) continue;
  if (lastAt[k] !== undefined && t - lastAt[k] < 0.06) continue;
  lastAt[k] = t; ev.push({ k, t, vol: vol * (s.src === "game" ? 0.6 : 0.75), rate: +s.rate || 1 });
}
const used = [...new Set(ev.map(e => e.k))];
const bgm = path.join(ROOT, "audio", "bgm", "island.mp3");
const args = ["-y", "-loglevel", "error", "-i", SRC, "-i", bgm];
used.forEach(k => args.push("-i", FILES[k]));
const af = [`[1:a]aresample=44100,aformat=channel_layouts=stereo,atrim=start=0:end=${DUR.toFixed(3)},asetpts=N/SR/TB,afade=t=in:st=0:d=0.6,afade=t=out:st=${(DUR - 1.6).toFixed(2)}:d=1.6,volume=1.0[bg]`];
const mix = ["[bg]"];
used.forEach((k, ui) => {
  const es = ev.filter(e => e.k === k);
  af.push(`[${ui + 2}:a]aresample=44100,aformat=channel_layouts=stereo,asplit=${es.length}${es.map((_, j) => `[a${ui}_${j}]`).join("")}`);
  es.forEach((e, j) => { const ms = Math.max(0, Math.round(e.t * 1000)), r = Math.max(0.5, Math.min(2, e.rate)); af.push(`[a${ui}_${j}]${Math.abs(r - 1) > 0.01 ? `asetrate=${Math.round(44100 * r)},aresample=44100,` : ""}adelay=${ms}|${ms},volume=${e.vol.toFixed(3)}[e${ui}_${j}]`); mix.push(`[e${ui}_${j}]`); });
});
af.push(`${mix.join("")}amix=inputs=${mix.length}:duration=first:normalize=0,alimiter=limit=0.89:level=false[aout]`);
const script = path.join(TMP, "filter.txt"); fs.writeFileSync(script, [...vf, ...af].join(";\n"));
args.push("-/filter_complex", script, "-map", "[vout]", "-map", "[aout]", "-t", DUR.toFixed(3), "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "160k", OUT);
const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
fs.rmSync(TMP, { recursive: true, force: true });
if (r.status !== 0) { console.error("ffmpeg 失敗", (r.stderr || "").slice(0, 2000)); process.exit(1); }
console.log(`完成：${OUT}（${DUR.toFixed(1)} 秒、音效 ${ev.length} 個）`);
