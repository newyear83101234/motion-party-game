"""Final confirmation: for each target whose stage-2 (Pro) champion is not the current file, duel champion vs current file once more
(both orders, Gemini Pro). Merge everything into candidates/sfx_pairwise.json under keys: stage1_flash, stage2_pro, final.
usage: python sfx_confirm.py <cand_dir>      (needs candidates/sfx_pairwise.json + sfx_pairwise_pro.json from sfx_pairwise.py)"""
import os, sys, json
os.environ.setdefault("PAIR_MODEL", "gemini-3.1-pro-preview")
import sfx_pairwise as P

HERE = P.HERE
d = sys.argv[1]
s1 = json.load(open(os.path.join(HERE, "candidates", "sfx_pairwise.json"), encoding="utf-8"))
s2 = json.load(open(os.path.join(HERE, "candidates", "sfx_pairwise_pro.json"), encoding="utf-8"))
final = {}
for t in sorted(k for k in s1 if k != "_meta"):
    champ = s2.get(t, {}).get("champion") or "cur"
    if champ == "cur":
        final[t] = {"champion": "cur", "confirmed": None, "note": "no challenger beat the current file"}
        continue
    m = P.duel(t, os.path.join(d, t), "cur", champ)
    final[t] = {"champion": m["winner"], "candidate": champ, "confirmed": m["winner"] == champ, "duel": m}
    print(t, champ, "->", m["winner"], flush=True)
out = {"_meta": {"stage1_model": s1.get("_meta", {}).get("model"), "stage2_model": "gemini-3.1-pro-preview",
                 "method": "A/B pairwise, both orders, challenger must win both; king-of-the-hill vs current file; Pro model re-judges contenders; final confirm duel champion vs current",
                 "tokens_confirm": P.tok},
       "stage1_flash": {k: v for k, v in s1.items() if k != "_meta"}, "stage2_pro": {k: v for k, v in s2.items() if k != "_meta"}, "final": final}
json.dump(out, open(os.path.join(HERE, "candidates", "sfx_pairwise.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps({t: (v["champion"], v["confirmed"]) for t, v in final.items()}, ensure_ascii=False))
