"""Write tools/audio/audition-data.json for audition.html (candidates + chosen + sfx list)."""
import os, json
from common import ROOT

HERE = os.path.dirname(os.path.abspath(__file__))
CAND = os.path.join(HERE, "candidates")
loops = json.load(open(os.path.join(CAND, "loops.json")))
scores = json.load(open(os.path.join(CAND, "scores.json"), encoding="utf-8"))
sel = json.load(open(os.path.join(HERE, "bgm_selected.json"), encoding="utf-8"))
man = json.load(open(os.path.join(ROOT, "audio", "manifest.json"), encoding="utf-8"))
psc = json.load(open(os.path.join(CAND, "party_scores.json"), encoding="utf-8"))

bgm = []
for k, v in sel.items():
    if k == "party":
        continue
    cands = []
    for r in v["ranking"]:
        n = r["name"]
        lp = loops[n]
        sc = scores[n]
        cands.append({"name": n, "chosen": n == v["chosen"], "file": f"candidates/loops/{n}.mp3", "loopStart": lp["loopStart"], "loopEnd": lp["loopEnd"],
                      "source": "Suno v6" if n.split("_")[1].startswith("s") else "Lyria 3.5", "bpm": lp["bpm"], "score": r["total"],
                      "overall": sc.get("overall"), "voice": sc.get("voice_friendly"), "seam": sc.get("seam"), "comment": sc.get("comment", ""),
                      "energy_diff_db": lp["energy_diff_db"]})
    bgm.append({"key": k, "use": man["bgm"][k]["use"], "final": f"../../audio/bgm/{k}.mp3", "cands": cands})
party = [{"name": n, "chosen": n == "synth_fanfare", "file": f"candidates/party/{n}.mp3", "comment": r.get("comment", "")} for n, r in psc.items()]
sfx = [{"name": n, "use": e["use"], "file": f"../../audio/sfx/{n}.mp3", "dur": e["duration"], "loop": e["loop"], "check": e.get("geminiCheck", {}).get("heard", "")} for n, e in man["sfx"].items()]
# --- 2026-10-11 pass 2: real-recording (Freesound CC0) A/B results ---
pwp = os.path.join(CAND, "sfx_pairwise.json")
compare = []
if os.path.exists(pwp):
    pw = json.load(open(pwp, encoding="utf-8"))
    fmeta = json.load(open(os.path.join(HERE, "freesound", "meta.json"), encoding="utf-8")) if os.path.exists(os.path.join(HERE, "freesound", "meta.json")) else {}
    for t, f in pw["final"].items():
        if t == "party":
            continue
        row = {"name": t, "old": f"candidates/sfx/{t}/cur.mp3", "new": None, "note": "維持舊版（沒有候選在正反順序都贏）"}
        if f["champion"] != "cur":
            m = fmeta.get(f"{t}/{f['candidate']}", {})
            row.update({"new": f"../../audio/sfx/{t}.mp3", "note": f"Freesound CC0：{m.get('title','')} by {m.get('user','')}｜決賽 {('Pro 正反都選新版' if f['confirmed'] else '未確認')}｜" + f["duel"]["order_chA"]["reason"]})
        compare.append(row)
    pn = {m["challenger"] for m in pw["stage1_flash"].get("party", {}).get("matches", [])}
    for n in sorted(pn):
        party.append({"name": "Freesound " + n, "chosen": False, "file": f"candidates/sfx/party/{n}.mp3", "comment": "Freesound CC0 候選：" + fmeta.get(f"party/{n}", {}).get("title", "")})
json.dump({"bgm": bgm, "party": party, "sfx": sfx, "compare": compare}, open(os.path.join(HERE, "audition-data.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(bgm), len(party), len(sfx))
