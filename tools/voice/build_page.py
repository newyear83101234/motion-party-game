"""產生試聽頁 voice-choice.html ＋ 估算 voice/samples/estimate.json

用法：python tools/voice/build_page.py
資料來源（全部是實跑產物，頁面上的數字都從這裡算，不手抄）：
- voice/samples/manifest.json   樣本音長、生成耗時、Gemini token
- voice/samples/check.json      聽寫、讀音對比、ㄩ/ㄧ 共振峰、改字測試
- tools/voice/lines.json        整套要錄的句子
"""
import html
import json
import re
import sys
import unicodedata
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_samples as ms  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
MAN = json.loads((ROOT / "voice/samples/manifest.json").read_text(encoding="utf-8"))
CHK = json.loads((ROOT / "voice/samples/check.json").read_text(encoding="utf-8"))
LINES = json.loads((ROOT / "tools/voice/lines.json").read_text(encoding="utf-8"))

# 價格（2026-10-10 查 ai.google.dev/gemini-api/docs/pricing，Standard 付費層）
PRICE = {"tts_out": 9.00, "tts_in": 0.50, "tts_out_2027": 18.00, "tts_in_2027": 1.00,   # gemini-3.8-flash-tts，每 100 萬 token
         "asr_in": 0.75, "asr_out": 3.75}                                               # gemini-3.8-flash（聽寫驗收用）
USD_TWD = 32.0          # 2026-09 中旬約 31.8，取整
RPM = 10                # 這把金鑰 Tier 1：gemini-3.8-flash-tts 每分鐘 10 次（實測 429 訊息）
RETAKE = 1.3            # 預留 30% 重錄（Gemini 每次生成不同，有的要重來）
PUNCT = "，！？。、 "


def chars(t):
    return sum(1 for ch in t if ch not in PUNCT)


def breaks(t):
    t = t.rstrip(PUNCT)
    return sum(1 for ch in t if ch in "，！？。")


def feats(t):
    return [1.0, chars(t), breaks(t)]


def fit(rows, key):
    X = np.array([feats(r["tts_text"]) for r in rows]); y = np.array([r[key] or 0 for r in rows], float)
    coef, *_ = np.linalg.lstsq(X, y, rcond=None)
    return coef


def plain(p):
    p = unicodedata.normalize("NFD", p or "")
    return "".join(ch for ch in p if not unicodedata.combining(ch)).lower()


def gemini_text(l):
    return l.get("tts_text_gemini") or l.get("tts_text") or l["text"]


# ---------- 估算 ----------
est = {}
all_lines = LINES["lines"]
for c in MAN["cands"]:
    rows = [r for r in MAN["rows"] if r["cand"] == c["id"]]
    dcoef = fit(rows, "duration")
    texts = [gemini_text(l) if c["engine"] == "gemini" else l.get("tts_text", l["text"]) for l in all_lines]
    total_sec = float(sum(max(0.3, np.dot(dcoef, feats(t))) for t in texts))
    bps = sum(r["bytes"] for r in rows) / sum(r["duration"] for r in rows)
    e = dict(lines=len(all_lines), audio_sec=round(total_sec), size_mb=round(total_sec * bps / 1e6, 2),
             size_mb_48k=round(total_sec * 6000 / 1e6, 2), bytes_per_sec=round(bps))
    if c["engine"] == "gemini":
        tcoef = fit(rows, "out_tokens")
        out_tok = float(sum(max(20, np.dot(tcoef, feats(t))) for t in texts))
        in_tok = float(sum(len(t) for t in texts))
        usd = (out_tok * PRICE["tts_out"] + in_tok * PRICE["tts_in"]) / 1e6
        usd27 = (out_tok * PRICE["tts_out_2027"] + in_tok * PRICE["tts_in_2027"]) / 1e6
        e.update(out_tokens=round(out_tok), in_tokens=round(in_tok), usd=round(usd, 3), usd_with_retake=round(usd * RETAKE, 3),
                 usd_2027_with_retake=round(usd27 * RETAKE, 3), twd_with_retake=round(usd * RETAKE * USD_TWD, 1),
                 minutes=round(len(all_lines) * RETAKE / RPM), minutes_note=f"受每分鐘 {RPM} 次上限限制（含 30% 重錄）")
    else:
        lat = np.mean([r["latency"] for r in rows if r["latency"]])
        e.update(usd=0, usd_with_retake=0, twd_with_retake=0, minutes=max(1, round(len(all_lines) * lat / 60)),
                 minutes_note=f"每句約 {lat:.1f} 秒，一句一句來")
    est[c["id"]] = e
toks = [h["_tokens"] for h in CHK.get("homophone", {}).values() if h.get("_tokens")]
asr_per_clip = np.mean([(t["input"] * PRICE["asr_in"] + t["output"] * PRICE["asr_out"]) / 1e6 for t in toks]) if toks else 0
sample_sec = sum(r["duration"] for r in MAN["rows"] if r["cand"].startswith("gemini"))
gem_rows = [r for r in MAN["rows"] if r["cand"].startswith("gemini")]
sample_usd = sum((r["out_tokens"] or 0) * PRICE["tts_out"] + (r["in_tokens"] or 0) * PRICE["tts_in"] for r in gem_rows) / 1e6
summary = dict(estimates=est, asr_check_usd_per_clip=round(float(asr_per_clip), 5),
               asr_check_usd_full_set=round(float(asr_per_clip) * len(all_lines), 2),
               samples_total_sec_all=round(sum(r["duration"] for r in MAN["rows"]), 1),
               samples_total_sec_gemini=round(sample_sec, 1), samples_gemini_usd=round(sample_usd, 4),
               prices=PRICE, usd_twd=USD_TWD, rpm=RPM, retake=RETAKE)
(ROOT / "voice/samples/estimate.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")

# ---------- 讀音判定 ----------
EXPECT = {"r1_qie": ("企鵝", "qi4", 0, "台灣 ㄑㄧˋ（大陸 qǐ）"), "r2_guaniu": ("蝸牛", "gua1", 0, "台灣 ㄍㄨㄚ（大陸 wō）"),
          "r3_binggan": ("餅乾", "gan1", 1, "乾 ㄍㄢ（不是 ㄑㄧㄢˊ）"), "r4_shuijiao": ("睡覺", "jiao4", 1, "覺 ㄐㄧㄠˋ（不是 ㄐㄩㄝˊ）"),
          "s7_word": ("長頸鹿", "chang2", 0, "長 ㄔㄤˊ（不是 ㄓㄤˇ）")}


def judge(cid, lid):
    f = f"voice/samples/{cid}/{lid}.mp3"
    a, b = CHK["asr"].get(f, {}), CHK["asr2"].get(f, {})
    word, want, pos, _ = EXPECT[lid]
    sy = plain(a.get("pinyin")).split()
    ok = len(sy) > pos and sy[pos] == want
    sy2 = plain(b.get("pinyin")).split()
    ok2 = len(sy2) > pos and sy2[pos] == want
    got = sy[pos] if len(sy) > pos else "?"
    return ok, got, ok2, (sy2[pos] if len(sy2) > pos else "?")


def reading_cell(cid, lid):
    ok, got, ok2, got2 = judge(cid, lid)
    pair = CHK["pairs"].get(f"{cid}/{lid}")
    extra = ""
    if pair and pair.get("deterministic") and lid == "r2_guaniu":
        extra = f"；跟同聲音唸的「{pair['ref_tw']}」幾乎一模一樣（差 {pair['dist_tw']} vs「{pair['ref_cn']}」{pair['dist_cn']}）"
    if pair and pair.get("deterministic") and lid == "r1_qie":
        extra = f"；音高曲線跟「{pair['ref_tw']}」幾乎重疊（差 {pair['dist_tw']} vs「{pair['ref_cn']}」{pair['dist_cn']}）"
    hom = CHK.get("homophone", {}).get(f"{cid}/{lid}")
    if not ok and hom:
        extra += f"；改送「{hom['sent_text']}」→ 聽寫 {hom['pinyin']}"
    second = "" if ok == ok2 else f"（第二意見 {got2}）"
    mark = "✅" if ok else "❌"
    return mark, f"{got}{second}{extra}"


def yu_cell(cid):
    y = CHK["yu_vs_yi"][cid]
    ok = y["verdict"].startswith("ㄩ")
    return ("✅" if ok else "⚠️"), f"F3 是「衣」的 {y['F3_ratio']} 倍（ㄩ 圓唇會明顯較低）"


# ---------- HTML ----------
E = html.escape
CAND_BY = {c["id"]: c for c in MAN["cands"]}
order = [c["id"] for c in MAN["cands"]]
risk_ids = ["r1_qie", "r2_guaniu", "r3_binggan", "r4_shuijiao", "s7_word"]


def price_text(cid):
    e = est[cid]
    if e["usd"] == 0:
        return "免費"
    return f"約 NT${e['twd_with_retake']:.0f}（US${e['usd_with_retake']:.2f}）"


def nat_avg(cid):
    v = [CHK["asr"].get(r["file"], {}).get("natural") for r in MAN["rows"] if r["cand"] == cid and r["line"].startswith("s")]
    v = [x for x in v if isinstance(x, (int, float))]
    return sum(v) / len(v) if v else 0


rows_html = []
for cid in order:
    c, e = CAND_BY[cid], est[cid]
    marks = [reading_cell(cid, l)[0] for l in risk_ids] + [yu_cell(cid)[0]]
    bad = [EXPECT[l][0] for l, m in zip(risk_ids, marks) if m == "❌"]
    rows_html.append(f"<tr><td><b>{E(c['label'].split('　')[0])}</b> {E(c['label'].split('　')[1])}</td>"
                     f"<td>{'免費' if c['free'] else '付費'}</td><td>{E(price_text(cid))}</td>"
                     f"<td>約 {e['minutes']} 分鐘</td><td>{e['size_mb']} MB</td><td>{nat_avg(cid):.1f} / 5</td>"
                     f"<td>{'全對' if not bad else '唸錯：' + '、'.join(bad)}</td></tr>")

cards = []
for cid in order:
    c, e = CAND_BY[cid], est[cid]
    btns = []
    for r in [r for r in MAN["rows"] if r["cand"] == cid]:
        a = CHK["asr"].get(r["file"], {})
        tag = "risk" if r["line"].startswith("r") else ""
        btns.append(f'<button class="say {tag}" data-src="{E(r["file"])}"><span class="t">{E(r["text"])}</span>'
                    f'<span class="d">{r["duration"]:.1f} 秒</span><span class="p">{E(a.get("pinyin", ""))}</span></button>')
    checks = []
    for l in risk_ids:
        m, t = reading_cell(cid, l)
        checks.append(f"<li>{m} <b>{EXPECT[l][0]}</b>　應唸 {E(EXPECT[l][3])}　→ 聽寫 {E(t)}</li>")
    m, t = yu_cell(cid)
    checks.append(f"<li>{m} <b>魚</b>　ㄩ 有沒有變 ㄧ　→ {E(t)}</li>")
    issues = [f"{r['text']}：{CHK['asr'][r['file']].get('issues')}" for r in MAN["rows"]
              if r["cand"] == cid and CHK["asr"].get(r["file"], {}).get("issues")]
    if c["free"]:
        cost = (f"<li>💰 <b>免費</b>（不用金鑰）。整套 {e['lines']} 句約 {e['minutes']} 分鐘生成完，"
                f"約 {e['audio_sec'] // 60} 分 {e['audio_sec'] % 60} 秒音檔、{e['size_mb']} MB。</li>"
                "<li>⚠️ 走的是 Edge 瀏覽器「大聲朗讀」的非官方管道：微軟改了就可能抓不到（已經生好的檔案不受影響）。</li>")
    else:
        cost = (f"<li>💰 整套 {e['lines']} 句：約 {e['audio_sec'] // 60} 分 {e['audio_sec'] % 60} 秒音檔，"
                f"<b>{E(price_text(cid))}</b>（已含 30% 重錄；2027 年起漲一倍約 US${e['usd_2027_with_retake']:.2f}）。</li>"
                f"<li>⏱️ 約 {e['minutes']} 分鐘（{E(e['minutes_note'])}）；檔案 {e['size_mb']} MB。</li>"
                "<li>⚠️ 每次生成都不一樣：同一句重生一次語氣會變，挑定後要整批錄好存檔，不能在遊戲裡即時生成。</li>")
    cards.append(f"""
  <section class="opt" id="{cid}">
    <h2>{E(c['label'])}<span class="tag {'free' if c['free'] else 'paid'}">{'免費' if c['free'] else '付費'}</span><span class="tag">{E(c['vendor'])}</span></h2>
    <p class="note">{E(c['desc'])}</p>
    <div class="btns">{''.join(btns)}</div>
    <div class="two">
      <ul class="chk">{''.join(checks)}</ul>
      <ul>{cost}{('<li>🤖 AI 聽的時候覺得怪的地方：' + E('；'.join(issues)) + '</li>') if issues else ''}</ul>
    </div>
  </section>""")

dyn = "".join(f"<li><b>{E(d['template'])}</b>：{E(d['range'])} → {E(d['suggestion'])}</li>" for d in LINES["dynamic"])
meta = LINES["meta"]
page = f"""<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>注音小島說話聲音</title>
  <link rel="icon" href="data:,">
  <!-- 給阿葉選「說話聲音」用的試聽頁（2026-10-10）。不接遊戲本體。由 tools/voice/build_page.py 產生，不要手改。 -->
  <style>
    :root {{ --ink: #1f2a44; --sub: #55607a; --line: #dfe5f0; --bg: #f5f7fb; --card: #fff; --accent: #1b4fa0; --ok: #2e9e4f; --paid: #b35c00; --risk: #fff6e5; }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ background: var(--bg); color: var(--ink); font-family: "PingFang TC", "Microsoft JhengHei", "Noto Sans TC", sans-serif; line-height: 1.7; padding: 24px 16px 60px; }}
    main {{ max-width: 1080px; margin: 0 auto; }}
    h1 {{ font-size: 26px; }} .lead {{ color: var(--sub); margin: 6px 0 18px; }}
    h3 {{ font-size: 18px; margin: 22px 0 8px; }}
    .opt {{ background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 18px; margin-bottom: 18px; }}
    .opt h2 {{ font-size: 20px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }}
    .tag {{ font-size: 13px; padding: 2px 10px; border-radius: 99px; background: #eef2fa; color: var(--accent); font-weight: bold; }}
    .tag.free {{ background: #e8f5e9; color: var(--ok); }} .tag.paid {{ background: #fff0e0; color: var(--paid); }}
    .btns {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin: 12px 0; }}
    .say {{ font: inherit; text-align: left; border: 1px solid var(--line); background: #f9fbff; border-radius: 12px; padding: 8px 10px; cursor: pointer; display: flex; flex-direction: column; min-height: 44px; }}
    .say:hover {{ border-color: var(--accent); }} .say.risk {{ background: var(--risk); }}
    .say.playing {{ border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent) inset; }}
    .say .t {{ font-size: 17px; font-weight: bold; }} .say .t::before {{ content: "▶ "; color: var(--accent); font-size: 13px; }}
    .say .d, .say .p {{ font-size: 12px; color: var(--sub); }}
    .two {{ display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }} @media (max-width: 680px) {{ .two {{ grid-template-columns: 1fr; }} }}
    ul {{ padding-left: 20px; }} li {{ margin: 3px 0; }} .chk {{ list-style: none; padding-left: 0; font-size: 14px; }}
    .note {{ font-size: 14px; color: var(--sub); }}
    .tbl {{ overflow-x: auto; background: var(--card); border: 1px solid var(--line); border-radius: 12px; margin-bottom: 18px; }}
    table {{ border-collapse: collapse; width: 100%; font-size: 14px; min-width: 640px; }}
    th, td {{ padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }}
    th {{ background: #eef2fa; white-space: nowrap; }}
    .playall {{ font: inherit; font-size: 14px; background: var(--accent); color: #fff; border: 0; border-radius: 10px; padding: 6px 14px; cursor: pointer; }}
  </style>
</head>
<body>
<main>
  <h1>🔊 注音小島：說話聲音選一個</h1>
  <p class="lead">現在遊戲用手機／瀏覽器內建的語音，聽起來像機器。下面 5 個候選都唸同一組句子，按 ▶ 試聽（黃底的是「台灣讀音考題」）。
  選好之後我再把整套 {meta['total_lines']} 句一次錄好、接進遊戲。</p>

  <div class="tbl"><table>
    <tr><th>候選</th><th>免費？</th><th>整套費用</th><th>生成時間</th><th>檔案大小</th><th>AI 評自然度</th><th>台灣讀音考題</th></tr>
    {''.join(rows_html)}
  </table></div>
  <p class="note">「AI 評自然度」是讓 Gemini 盲聽打分（5＝像真人），只能參考，<b>請以你的耳朵為準</b>。考題：企鵝、蝸牛、餅乾、睡覺、長頸鹿、魚。</p>
  {''.join(cards)}

  <h3>整套要錄哪些句子（{meta['total_lines']} 句、{meta['total_chars']} 字）</h3>
  <ul class="note">
    <li>開場語 8、稱讚 5、貓頭鷹台詞 6、學習詞 {meta['words']}、顏色短語 {meta['phrases']}、點餐 {meta['by_cat'].get('order', 0)}、其他固定句 {meta['by_cat'].get('system', 0) + meta['by_cat'].get('result', 0) + meta['by_cat'].get('hatch', 0) + meta['by_cat'].get('hunt', 0) + meta['by_cat'].get('friend', 0)}、帶數字／名字的句子展開 {meta['by_cat'].get('dynamic', 0)}。</li>
    {dyn}
  </ul>

  <h3>怎麼檢查的（我聽不到，所以用數據）</h3>
  <ul class="note">
    <li>每個音檔用 Gemini 盲聽寫（不告訴它答案），寫出實際聽到的拼音；主判 Gemini 3.8 Flash、第二意見 Gemini 2.5 Flash。注意：AI 聽寫本身也會錯（2.5 版把微軟聲音的「蝸牛」聽成 wo1，但那段音跟「瓜牛」參考音幾乎一模一樣），所以重點字另外用下面兩招驗。</li>
    <li>微軟兩個聲音每次輸出都一樣 → 讓同一個聲音唸「瓜牛／窩牛」「器鵝／起鵝」當參考，直接比對聲音波形，最可靠。</li>
    <li>「魚」的 ㄩ 有沒有被唸成 ㄧ：量聲音的共振峰（ㄩ 是圓唇音，第三共振峰會比「衣」低很多）。</li>
    <li>Gemini 三個聲音把「蝸牛」唸成 ㄍㄨㄛ 或 ㄨㄛ；改送同音字「瓜牛」後三個都唸成 ㄍㄨㄚ。整套錄音時這類字會先換字再送（已記在 tools/voice/lines.json）。</li>
    <li>口音判斷（台灣／大陸）AI 給的答案很不穩定，同一個聲音兩個模型常講相反，所以頁面沒採用。</li>
  </ul>
  <p class="note">費用依 2026-10-10 Google 官方價目：Gemini 3.8 Flash TTS 輸出每 100 萬 token US$9（2027 年起 US$18），1 秒聲音＝25 token；匯率以 1 美元＝{USD_TWD:.0f} 元計。這把金鑰是付費 Tier 1，每分鐘最多 {RPM} 句。</p>
</main>
<script>
  let cur = null, curBtn = null;
  document.querySelectorAll(".say").forEach(b => {{
    const a = new Audio(); a.preload = "metadata"; a.src = b.dataset.src; b._a = a;
    a.addEventListener("ended", () => b.classList.remove("playing"));
    b.addEventListener("click", () => {{
      if (cur) {{ cur.pause(); cur.currentTime = 0; }} if (curBtn) curBtn.classList.remove("playing");
      cur = a; curBtn = b; b.classList.add("playing"); a.play().catch(() => b.classList.remove("playing"));
    }});
  }});
</script>
</body>
</html>
"""
(ROOT / "voice-choice.html").write_text(page, encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False, indent=1))
