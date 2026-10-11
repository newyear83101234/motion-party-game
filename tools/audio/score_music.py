"""Ask a Gemini multimodal model to listen to each looped candidate (loop played twice, so the seam is audible)
and score it. Writes candidates/scores.json. Key from env GEMINI_API_KEY (never printed). Re-runnable (skips scored)."""
import os, sys, json, base64, time, tempfile, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from common import SR, decode, encode_mp3

HERE = os.path.dirname(os.path.abspath(__file__))
CAND = os.path.join(HERE, "candidates")
MODEL = os.environ.get("SCORE_MODEL", "gemini-2.5-pro")
THEME = {
    "island": "main island menu: bright, cheerful, tropical, light",
    "calm": "calm thinking/puzzle games: warm, gentle, unobtrusive",
    "town": "friendly small-town menu: light funk, upbeat",
    "rainbow": "dreamy happy rainbow-island menu: magical, bells/harp",
    "night": "bedtime lullaby menu at night: very soft, sleepy",
    "road": "road-trip delivery game: cheerful driving bounce",
    "dress": "cute dress-up game: playful fashion",
    "bubble": "underwater bubble game: watery, floaty, relaxed",
    "party": "short celebratory results jingle (3-6 s, not looped)",
}
PROMPT = """You are an audio QA reviewer for a children's educational iPad game (players are 5-year-olds; a narrator speaks over the music).
Listen to this clip. It is a background-music loop played TWICE back to back, so the loop seam is at the exact middle of the clip.
Intended use: {theme}.
Return ONLY a JSON object with these keys:
"vocals": true/false (any human voice, humming, choir, or vocal-like synth?),
"rhythm_stability": 1-10 (10 = steady tempo, stable groove),
"glitches": 1-10 (10 = no weird sounds, distortion, clipping, abrupt jumps; consider the seam at the middle),
"seam": 1-10 (10 = the join at the middle is inaudible),
"kid_suitability": 1-10 (pleasant and friendly for a 5-year-old, not scary),
"voice_friendly": 1-10 (10 = mid frequencies uncluttered, a narrator could be heard clearly over it, not busy or loud),
"theme_fit": 1-10,
"overall": 1-10 (your honest overall rating as game background music),
"comment": one short sentence in Traditional Chinese describing what you heard."""


def make_clip(name):
    """loop file -> loop twice -> temp mp3"""
    meta = json.load(open(os.path.join(CAND, "loops.json")))[name]
    x = decode(os.path.join(CAND, "loops", name + ".mp3"), 2)
    a, b = int(meta["loopStart"] * SR), int(meta["loopEnd"] * SR)
    seg = x[a:b]
    tmp = os.path.join(tempfile.gettempdir(), "zy_score_" + name + ".mp3")
    encode_mp3(np.concatenate([seg, seg]), tmp, kbps=96)
    return tmp


def call(name, path):
    key = os.environ["GEMINI_API_KEY"]
    theme = THEME[name.split("_")[0]]
    data = base64.b64encode(open(path, "rb").read()).decode()
    body = {"contents": [{"parts": [{"text": PROMPT.format(theme=theme)}, {"inline_data": {"mime_type": "audio/mp3", "data": data}}]}],
            "generationConfig": {"temperature": 0, "responseMimeType": "application/json"}}
    req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
                                 data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": key})
    d = json.load(urllib.request.urlopen(req, timeout=300))
    txt = d["candidates"][0]["content"]["parts"][0]["text"]
    u = d.get("usageMetadata", {})
    r = json.loads(txt)
    if isinstance(r, list):
        r = r[0]
    r["_tokens"] = [u.get("promptTokenCount", 0), u.get("candidatesTokenCount", 0) + u.get("thoughtsTokenCount", 0)]
    return r


def job(name):
    for attempt in range(3):
        try:
            return name, call(name, make_clip(name))
        except urllib.error.HTTPError as e:
            msg = "HTTP %d %s" % (e.code, e.read()[:150])
        except Exception as e:
            msg = repr(e)[:150]
        time.sleep(4)
    return name, {"error": msg}


if __name__ == "__main__":
    jf = os.path.join(CAND, "scores.json")
    res = json.load(open(jf, encoding="utf-8")) if os.path.exists(jf) else {}
    names = sorted(json.load(open(os.path.join(CAND, "loops.json"))).keys())
    todo = [n for n in names if n not in res or "error" in res[n]]
    with ThreadPoolExecutor(4) as ex:
        for n, r in ex.map(job, todo):
            res[n] = r
            print(n, {k: v for k, v in r.items() if k != "comment"}, r.get("comment", ""), flush=True)
    json.dump(res, open(jf, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
