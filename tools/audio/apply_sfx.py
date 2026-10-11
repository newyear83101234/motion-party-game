"""Apply pairwise winners: copy candidates/sfx/<t>/<id>.mp3 -> audio/sfx/<t>.mp3, update audio/manifest.json entries and the audio/CREDITS.md table.
Old files stay in candidates/sfx/<t>/cur.mp3 (used by the audition page). Do NOT re-run build_manifest.py afterwards (it would reset these entries).
usage: python apply_sfx.py"""
import os, json, shutil, re
import numpy as np
from common import ROOT, SR, decode, measure, sample_peak_db

HERE = os.path.dirname(os.path.abspath(__file__))
pw = json.load(open(os.path.join(HERE, "candidates", "sfx_pairwise.json"), encoding="utf-8"))["final"]
meta = json.load(open(os.path.join(HERE, "freesound", "meta.json"), encoding="utf-8"))
mp = os.path.join(ROOT, "audio", "manifest.json")
man = json.load(open(mp, encoding="utf-8"))
cp = os.path.join(ROOT, "audio", "CREDITS.md")
cred = open(cp, encoding="utf-8").read()
rows = {}
for t, f in pw.items():
    if t == "party" or f["champion"] == "cur":
        continue
    cid = f["candidate"]
    m = meta[f"{t}/{cid}"]
    assert m["licenseOk"] and "publicdomain/zero" in m["licenseUrl"]
    dst = os.path.join(ROOT, "audio", "sfx", t + ".mp3")
    shutil.copy(os.path.join(HERE, "candidates", "sfx", t, cid + ".mp3"), dst)
    x = decode(dst, 1)[:, 0]
    mm = measure(dst)
    act = x[np.abs(x) > np.max(np.abs(x)) * 10 ** (-30 / 20)]
    e = man["sfx"][t]
    e.update({"duration": round(len(x) / SR, 3), "peak_dBFS": round(sample_peak_db(x), 2), "activeRms_dBFS": round(float(20 * np.log10(np.sqrt(np.mean(act ** 2)))), 1),
              "lufs": mm["lufs"] if mm["lufs"] > -70 else None, "source": f"Freesound「{m['title']}」by {m['user']}（trim/淡出/響度處理）", "sourceUrl": m["url"],
              "license": "CC0 1.0（公眾領域貢獻，免署名；Freesound 頁面逐檔確認 " + m["licenseUrl"] + "）",
              "pairwise": {"winnerId": cid, "confirmedByGeminiPro": f["confirmed"], "replaces": "synth/Kenney 舊版（保留於 tools/audio/candidates/sfx/%s/cur.mp3）" % t}})
    e.pop("geminiCheck", None)
    rows[t] = f"Freesound「{m['title']}」by {m['user']} — {m['url']} — CC0"
json.dump(man, open(mp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
# CREDITS: replace table rows
for t, txt in rows.items():
    cred = re.sub(r"^\| %s \| .*\|$" % t, "| %s | %s |" % (t, txt.replace("|", "/")), cred, flags=re.M)
cred = cred.replace("- 本資料夾沒有使用 Sonniss、ElevenLabs、Freesound、ZapSplat 等需署名或禁止再散布的素材。",
                    "- **Freesound（僅收 CC0 1.0）**：每個檔都在該音效頁面確認授權為 Creative Commons 0 才收（見下表網址與作者）；不含 CC-BY／CC-BY-NC 檔。\n"
                    "  挑選方式：每個目標音效找 3～6 個 CC0 候選，與舊版做 Gemini（gemini-3.8-flash 初賽、gemini-3.1-pro-preview 複賽＋決賽）A/B 成對聽音比較（正反順序都贏才算贏），結果在 `tools/audio/candidates/sfx_pairwise.json`。\n"
                    "- 本資料夾沒有使用 Sonniss、ElevenLabs、ZapSplat、Pixabay 等需署名或禁止再散布的素材。")
cred = cred.replace("- **自製合成（numpy／scipy，CC0）**：卡車、喇叭、海鷗、水花、船笛、鐘琴／馬林巴類提示音等", "- **自製合成（numpy／scipy，CC0）**：答對／答錯／金幣／貼紙／鐘琴／馬林巴類提示音等（卡車、喇叭、海鷗、水花、船笛、吊橋、叮咚、泡泡、得星、新紀錄、送達已改用 Freesound CC0 真實錄音）")
open(cp, "w", encoding="utf-8").write(cred)
man2 = json.load(open(mp, encoding="utf-8"))
json.dump(man2, open(mp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("replaced", sorted(rows))
