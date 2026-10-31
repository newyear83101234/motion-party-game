// 畫畫遊戲的字型：掃 draw.html 與 js/draw*.js 畫面上會出現的中文字（不含註解），跟 Google Fonts 要 jf open 粉圓（Huninn，OFL 授權）
// 只含這些字的子集，存成 fonts/huninn-draw.woff2 自己託管（離線、加入主畫面也能用；整套字型太大）
// 用法：node tools/draw-font.mjs   ← 介面加了新的中文字就重跑一次，並把 css/draw.css 的 ?v= 升版
import fs from "fs";

const files = ["draw.html", ...fs.readdirSync("js").filter(f => /^draw.*\.js$/.test(f)).map(f => "js/" + f)];
const chars = new Set("0123456789/+-×%");
for (const f of files) {
  let s = fs.readFileSync(f, "utf8");
  s = f.endsWith(".html") ? s.replace(/<!--[\s\S]*?-->/g, "") : s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  for (const ch of s) { const c = ch.codePointAt(0); if ((c >= 0x3000 && c <= 0x9fff) || (c >= 0xff00 && c <= 0xffef)) chars.add(ch); }
}
const text = [...chars].join("");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";   // 要新版瀏覽器的 UA 才會給 woff2
const css = await (await fetch("https://fonts.googleapis.com/css2?family=Huninn&display=swap&text=" + encodeURIComponent(text), { headers: { "User-Agent": UA } })).text();
const url = (css.match(/url\((https:[^)]+)\)\s*format\(['"]woff2['"]\)/) || [])[1];
if (!url) throw new Error("Google Fonts 沒有回 woff2：\n" + css.slice(0, 300));
const buf = Buffer.from(await (await fetch(url, { headers: { "User-Agent": UA } })).arrayBuffer());
fs.mkdirSync("fonts", { recursive: true });
fs.writeFileSync("fonts/huninn-draw.woff2", buf);
console.log(`${chars.size} 個字 → fonts/huninn-draw.woff2（${(buf.length / 1024).toFixed(1)} KB）`);
