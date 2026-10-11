"""Pairwise (A/B) listening tournament with Gemini. King-of-the-hill per target: incumbent = current audio file (cur.mp3),
each candidate challenges it; every pair is asked in BOTH orders; a challenger wins only if it wins both orders (else incumbent stays).
Writes candidates/sfx_pairwise.json (resumable). Key from env GEMINI_API_KEY (never printed).
usage: python sfx_pairwise.py <cand_dir> [target ...]"""
import os, sys, json, base64, time, random, subprocess, tempfile, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
import threading
LOCK = threading.Lock()

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.environ.get("PAIR_MODEL", "gemini-3.8-flash")
OUTF = os.path.join(HERE, "candidates", os.environ.get("PAIR_OUT", "sfx_pairwise.json"))
STAGE1 = os.environ.get("PAIR_FROM")   # stage-2: only re-judge contenders that won a consistent match in stage 1
DESC = {
    "ok": "a happy 'correct answer' chime (it will be heard very often, so it must not be piercing)", "ng": "a gentle, non-scary 'wrong answer' sound (soft, never a harsh buzzer)",
    "win": "a short triumphant new-record / level-complete celebration", "sticker": "a sparkly magical sticker-collected shimmer", "pop": "a cute bubble pop",
    "star": "a bright star-collected twinkle", "coin": "a coin pickup", "whoosh": "a swoosh / whoosh transition", "deliver_ok": "a cheerful 'delivery succeeded' jingle",
    "ding": "a doorbell 'ding-dong' / order-arrived notification", "splash": "a small water splash", "seagull": "a seagull cry (bright, not harsh)",
    "boat_horn": "a gentle ship / boat horn blast", "horn": "a cute 'beep-beep' toy or bicycle vehicle horn", "truck_start": "a small truck engine starting up (short)",
    "truck_drive": "a small truck engine driving along (this clip is a seamless loop played twice back to back)", "truck_stop": "a truck braking and stopping (soft air-brake hiss, no shrill screech)",
    "bridge": "a mechanical drawbridge being lowered (gears / chains / creak, short)", "door": "a soft door opening",
    "party": "a short joyful celebration jingle (3-6 s) played on the results screen after a round",
}
PROMPT = ("This is for a game played by 5-year-old children. Below are two audio clips, A and B. Both are meant to be the sound effect: {d}.\n"
          "Which one sounds more like the real thing, is nicer to listen to, and is less harsh / grating / fake? Be decisive.\n"
          "Reply ONLY with JSON: {{\"winner\": \"A\" or \"B\", \"reason\": \"one short sentence\"}}")
tok = {"in": 0, "out": 0}


def clip_bytes(path, loop2=False):
    if not loop2:
        return open(path, "rb").read()
    out = os.path.join(tempfile.gettempdir(), "pw_" + str(abs(hash(path))) + ".mp3")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-stream_loop", "1", "-i", path, "-c:a", "libmp3lame", "-b:a", "96k", out], check=True)
    return open(out, "rb").read()


def ask(target, pa, pb):
    key = os.environ["GEMINI_API_KEY"]
    l2 = target == "truck_drive"
    parts = [{"text": PROMPT.format(d=DESC[target])}, {"text": "Clip A:"}, {"inline_data": {"mime_type": "audio/mp3", "data": base64.b64encode(clip_bytes(pa, l2)).decode()}},
             {"text": "Clip B:"}, {"inline_data": {"mime_type": "audio/mp3", "data": base64.b64encode(clip_bytes(pb, l2)).decode()}}]
    body = {"contents": [{"parts": parts}], "generationConfig": {"temperature": 0, "responseMimeType": "application/json"}}
    err = ""
    for _ in range(4):
        try:
            req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent", data=json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json", "x-goog-api-key": key})
            d = json.load(urllib.request.urlopen(req, timeout=240))
            u = d.get("usageMetadata", {})
            tok["in"] += u.get("promptTokenCount", 0)
            tok["out"] += u.get("candidatesTokenCount", 0) + u.get("thoughtsTokenCount", 0)
            r = json.loads(d["candidates"][0]["content"]["parts"][0]["text"])
            r = r[0] if isinstance(r, list) else r
            w = str(r["winner"]).strip().upper()[:1]
            if w in "AB":
                return w, r.get("reason", "")
        except urllib.error.HTTPError as e:
            err = "HTTP %d" % e.code
        except Exception as e:
            err = repr(e)[:80]
        time.sleep(5)
    return None, "ERR " + err


def duel(target, d, inc, ch):
    """returns record; challenger wins only if both orders pick it"""
    pi, pc = os.path.join(d, inc + ".mp3"), os.path.join(d, ch + ".mp3")
    w1, r1 = ask(target, pi, pc)     # incumbent = A
    w2, r2 = ask(target, pc, pi)     # challenger = A
    s1 = None if w1 is None else ("inc" if w1 == "A" else "ch")
    s2 = None if w2 is None else ("ch" if w2 == "A" else "inc")
    winner = ch if (s1 == "ch" and s2 == "ch") else inc
    return {"incumbent": inc, "challenger": ch, "order_incA": {"winner": s1, "reason": r1}, "order_chA": {"winner": s2, "reason": r2},
            "consistent": s1 == s2 and s1 is not None, "winner": winner}


def run(target, d, res):
    tdir = os.path.join(d, target)
    names = sorted(f[:-4] for f in os.listdir(tdir) if f.endswith(".mp3") and f != "cur.mp3")
    if target == "party":
        names = [n for n in names if n not in ("269198", "580310", "607207", "619838")]   # < 3 s: out of the 3-6 s spec
    if STAGE1:
        s1 = json.load(open(os.path.join(HERE, "candidates", STAGE1), encoding="utf-8")).get(target, {"matches": []})
        keep = {m["challenger"] for m in s1["matches"] if m["consistent"] and m["winner"] == m["challenger"]} | {s1.get("champion")}
        names = [n for n in names if n in keep]
    random.Random(7).shuffle(names)
    rec = res.get(target, {"matches": [], "champion": "cur"})
    done = {m["challenger"] for m in rec["matches"]}
    champ = rec["champion"]
    for n in names:
        if n in done:
            continue
        m = duel(target, tdir, champ, n)
        rec["matches"].append(m)
        champ = m["winner"]
        rec["champion"] = champ
        res[target] = rec
        with LOCK:
            json.dump(res, open(OUTF, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(target, n, "->", champ, flush=True)
    return target


if __name__ == "__main__":
    d = sys.argv[1]
    targets = sys.argv[2:] or [t for t in sorted(os.listdir(d)) if os.path.isdir(os.path.join(d, t))]
    res = json.load(open(OUTF, encoding="utf-8")) if os.path.exists(OUTF) else {}
    with ThreadPoolExecutor(4) as ex:
        list(ex.map(lambda t: run(t, d, res), targets))
    res["_meta"] = {"model": MODEL, "tokens_in": tok["in"], "tokens_out": tok["out"], "note": "king-of-the-hill, both orders, challenger must win both"}
    json.dump(res, open(OUTF, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("tokens", tok)
