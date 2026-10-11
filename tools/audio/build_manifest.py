"""Measure every final file in audio/ with ffmpeg and write audio/manifest.json + audio/CREDITS.md."""
import os, json, glob
import numpy as np
from common import SR, ROOT, decode, measure, measure_array, sample_peak_db

HERE = os.path.dirname(os.path.abspath(__file__))
AUD = os.path.join(ROOT, "audio")
sel = json.load(open(os.path.join(HERE, "bgm_selected.json"), encoding="utf-8"))
src = json.load(open(os.path.join(HERE, "sfx_sources.json"), encoding="utf-8"))
sfxs = json.load(open(os.path.join(HERE, "candidates", "sfx_scores.json"), encoding="utf-8"))

BGM_USE = {
    "island": "主島選單＋多數遊戲（明亮輕快）", "calm": "積木／翻牌／青蛙（溫和思考）", "town": "歸仁區選單", "rainbow": "彩虹島選單",
    "night": "晚上的選單（搖籃曲感）", "road": "彩虹配送站（配送）", "dress": "寵物換裝", "bubble": "泡泡遊戲", "party": "結算 jingle（不循環，3–6 秒）",
}
SFX_USE = {
    "tap": "一般點按", "select": "選取／切換", "ok": "答對", "ng": "答錯（溫和）", "win": "新紀錄／完成", "sticker": "貼紙閃亮", "pop": "泡泡／彈出", "flip": "翻牌／翻頁",
    "star": "得星", "coin": "得幣", "whoosh": "揮動／轉場", "gacha_crank": "扭蛋機轉把手", "capsule_open": "扭蛋殼打開", "hatch": "孵蛋", "unlock": "解鎖",
    "truck_start": "卡車發動", "truck_drive": "卡車行駛（可接，loop）", "truck_stop": "卡車停下", "horn": "可愛叭叭", "load": "箱子放上車", "unload": "箱子卸下",
    "deliver_ok": "送達成功", "door": "開門", "lever": "拉桿", "bridge": "吊橋放下", "ding": "訂單到／叮咚", "splash": "水花", "seagull": "海鷗", "boat_horn": "船笛", "wear": "穿上衣服",
}
LIC_AI = "Gemini API 生成（Google Lyria 3.5，instrumental）；Google 不主張生成內容所有權（Gemini API Additional Terms），不需署名；含不可聽見的 SynthID 浮水印"
LIC_SUNO = "Suno Pro 方案生成（可商用，2026-10-11 下載）；不需署名"
LIC_CC0 = "CC0（公眾領域貢獻，免署名）"

man = {"generated": "2026-10-11", "note": "BGM 檔案＝[循環段最後0.5秒]+循環段+[循環段最前0.5秒]；Web Audio 用 loopStart/loopEnd（秒）循環。音效單聲道 44.1kHz mp3 128k，無 loop 除 truck_drive。", "bgm": {}, "sfx": {}}
for k, v in sel.items():
    p = os.path.join(AUD, "bgm", k + ".mp3")
    x = decode(p, 2)
    m = measure(p)
    e = {"file": f"audio/bgm/{k}.mp3", "use": BGM_USE[k], "duration": round(m["duration"], 3), "truePeak_dBTP": m["tp"]}
    if k == "party":
        e.update({"loop": False, "lufs": m["lufs"], "source": "numpy 合成（tools/audio/party_pick.py synth_party）", "license": "自製（CC0）", "sourceUrl": None})
    else:
        a, b = int(round(v["loopStart"] * SR)), int(round(v["loopEnd"] * SR))
        ml = measure_array(x[a:b])
        is_suno = v["chosen"].split("_")[1].startswith("s")
        e.update({"loop": True, "loopStart": round(v["loopStart"], 6), "loopEnd": round(v["loopEnd"], 6), "loopLength": round(v["loopLen"], 6), "bpm": v["bpm"],
                  "lufs": ml["lufs"], "lufsWholeFile": m["lufs"], "seamCheck": v["seam"], "candidate": v["chosen"],
                  "source": v["source"], "sourceUrl": "https://suno.com/ (song id in tools/audio/candidates, v6)" if is_suno else "https://ai.google.dev/gemini-api/docs/music-generation",
                  "license": LIC_SUNO if is_suno else LIC_AI, "geminiReview": v["gemini"].get("comment", "")})
    man["bgm"][k] = e
for f in sorted(glob.glob(os.path.join(AUD, "sfx", "*.mp3"))):
    n = os.path.basename(f)[:-4]
    x = decode(f, 1)[:, 0]
    m = measure(f)
    act = x[np.abs(x) > np.max(np.abs(x)) * 10 ** (-30 / 20)]
    s = src[n]
    man["sfx"][n] = {"file": f"audio/sfx/{n}.mp3", "use": SFX_USE[n], "duration": round(len(x) / SR, 3), "peak_dBFS": round(sample_peak_db(x), 2),
                     "activeRms_dBFS": round(float(20 * np.log10(np.sqrt(np.mean(act ** 2)))), 1), "lufs": m["lufs"] if m["lufs"] > -70 else None,
                     "loop": n == "truck_drive", "source": s["source"], "sourceUrl": s["packs"] or None, "license": "CC0（Kenney）＋自製合成" if s["packs"] and s["synth"] else (LIC_CC0 if s["packs"] else "自製（numpy 合成）CC0"),
                     "geminiCheck": {k: v for k, v in sfxs.get(n, {}).items() if k in ("matches", "pleasant_for_kids", "heard")}}
json.dump(man, open(os.path.join(AUD, "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# CREDITS
L = ["# 音樂音效來源與授權（audio/）", "", "最後更新 2026-10-11。所有檔案皆可免署名使用於公開免費網站；列出來源方便日後查。", "",
     "## 背景音樂（audio/bgm/）", "",
     "- 8 首循環 BGM：以 **Gemini API Lyria 3.5**（`lyria-3.5`，prompt 指定 Instrumental only）生成多首候選，再由 Gemini 聽音評分＋ffmpeg 響度/接縫量測挑選，最後以 `tools/audio/loopmaker.py` 剪成無縫循環段。官方文件：https://ai.google.dev/gemini-api/docs/music-generation 。授權依 Gemini API Additional Terms（https://ai.google.dev/gemini-api/terms ）：Google 不主張生成內容所有權、使用責任在使用者，不需署名；輸出含不可聽見的 SynthID 浮水印。",
     "  - 灰區註記（研究 2026-10-11）：該條款禁止「面向／可能被 18 歲以下使用者存取的 API Client」，指執行期呼叫 API 的應用；本專案是離線預先生成素材後放進靜態網站，不在遊戲內呼叫 API，判斷不觸發，但 Lyria 專屬商用條款查不到，信心中。",
     "- Suno v6（Pro 方案，可商用）：island 另生 2 首候選（island_s1、island_s2，來源 https://suno.com/ ），僅進入評分比較；未被選用者不在 audio/ 內。",
     "- party.mp3：自製合成（numpy），CC0。", ""]
for k, e in man["bgm"].items():
    L.append(f"  - `{k}.mp3` ← {e['source']}" + (f"（候選 {e['candidate']}）" if 'candidate' in e else ""))
L += ["", "## 音效（audio/sfx/）", "",
      "- **Kenney（CC0）**：Interface Sounds、Impact Sounds、UI Audio、Digital Audio、RPG Audio、Music Jingles（後兩者備選，部分未用）。License.txt 逐包確認為 Creative Commons Zero。",
      "  - https://kenney.nl/assets/interface-sounds",
      "  - https://kenney.nl/assets/impact-sounds",
      "  - https://kenney.nl/assets/ui-audio",
      "  - https://kenney.nl/assets/digital-audio",
      "  - https://kenney.nl/assets/rpg-audio",
      "  - https://kenney.nl/assets/music-jingles",
      "- **自製合成（numpy／scipy，CC0）**：卡車、喇叭、海鷗、水花、船笛、鐘琴／馬林巴類提示音等（`tools/audio/build_sfx.py`）。",
      "- 本資料夾沒有使用 Sonniss、ElevenLabs、Freesound、ZapSplat 等需署名或禁止再散布的素材。", "", "| 音效 | 來源 |", "|---|---|"]
for n, e in man["sfx"].items():
    L.append(f"| {n} | {e['source']} |")
open(os.path.join(AUD, "CREDITS.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")
print("bgm", len(man["bgm"]), "sfx", len(man["sfx"]))
bad = [(k, e["truePeak_dBTP"], e.get("lufs")) for k, e in man["bgm"].items() if k != "party" and (e["truePeak_dBTP"] > -1.5 or not (-19 <= e["lufs"] <= -17))]
print("BGM out of spec:", bad)
print("SFX peak max:", max(e["peak_dBFS"] for e in man["sfx"].values()))
for k, e in man["bgm"].items():
    print(k, e["duration"], e.get("loopStart"), e.get("loopEnd"), e["lufs"], e["truePeak_dBTP"], e.get("seamCheck"))
