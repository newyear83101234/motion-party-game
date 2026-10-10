// ===================== 國字自動加注音 =====================
// 阿葉 2026-10-10：「裡面的文字每一個旁邊都要有注音符號，這樣小孩才看得懂」
// 做法：監看整頁，凡是含國字的文字節點就拆成逐字 <span class="ac" data-z="ㄉㄧㄠ" class="n3 t4">釣</span>，
// 注音由 CSS ::after 用 attr(data-z) 直排畫在字的右邊、聲調由 ::before 畫（位置照教育部／W3C clreq：
// ˊˇˋ 標在最後一個符號右上方、往上突出半格；輕聲 ˙ 標在最前面＝直排的頂上）。
// 注音不進 textContent → 語音朗讀、程式比對文字都不受影響。
// 讀音來源 js/zhuyin-ui.js（tools/build_zhuyin_ui.py 產生：詞庫 > 萌典台灣讀音 > pypinyin 校正）。
import { ZDICT, ZCHAR } from "./zhuyin-ui.js?v=2";   // 改了 zhuyin-ui.js 要升（zhuyin.html 的 modulepreload 一起改）

const HAN = /[㐀-鿿]/;
const RUN = /[㐀-鿿]+/g;
const MAXL = 8;                                   // 最長比對詞長
const TONE = { "ˊ": 2, "ˇ": 3, "ˋ": 4, "˙": 5 };
const SKIP = "script,style,textarea,input,.noann,.ac,.zy";
export const missing = new Set();                 // 字典沒收到的字（測試會檢查這裡要是空的）

// 一段連續國字 → 每個字的注音（先整段、再最長詞、最後單字）
export function readRun(run) {
  if (ZDICT[run]) return ZDICT[run].split(" ");
  const out = []; let i = 0;
  while (i < run.length) {
    let hit = false;
    for (let L = Math.min(MAXL, run.length - i); L >= 2; L--) {
      const w = run.substr(i, L);
      if (ZDICT[w]) { out.push(...ZDICT[w].split(" ")); i += L; hit = true; break; }
    }
    if (hit) continue;
    const c = run[i], r = ZDICT[c] || ZCHAR[c] || null;
    if (!r) missing.add(c);
    out.push(r); i++;
  }
  return out;
}

function makeChar(ch, syl) {
  const s = document.createElement("span"); s.className = "ac"; s.textContent = ch;
  if (!syl) return s;
  const t = TONE[syl[syl.length - 1]] || 0, sym = t ? syl.slice(0, -1) : syl;
  s.dataset.z = sym; s.classList.add("n" + Math.min(4, sym.length)); if (t) s.classList.add("t" + t);
  return s;
}

function annotateText(node) {
  const text = node.nodeValue, parent = node.parentNode;
  if (!parent || !HAN.test(text)) return;
  const frag = document.createDocumentFragment(); let last = 0, m;
  RUN.lastIndex = 0;
  while ((m = RUN.exec(text))) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    const run = m[0], r = readRun(run);
    for (let i = 0; i < run.length; i++) frag.appendChild(makeChar(run[i], r[i]));
    last = m.index + run.length;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  parent.replaceChild(frag, node);
}

function skipped(node) { const p = node.nodeType === 3 ? node.parentElement : node; return !p || !!p.closest(SKIP); }

export function annotate(root) {
  if (root.nodeType === 3) { if (!skipped(root)) annotateText(root); return; }
  if (root.nodeType !== 1 || skipped(root)) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => HAN.test(n.nodeValue) && !skipped(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
  const list = []; while (w.nextNode()) list.push(w.currentNode);
  for (const n of list) annotateText(n);
}

export function startAnnotate() {
  annotate(document.body);
  new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === "characterData") annotate(m.target);
      else for (const n of m.addedNodes) annotate(n);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
