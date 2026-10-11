"""Party jingle: Kenney Music Jingles (CC0) candidates 2.2-6.5 s -> Gemini listen & score -> pick best.
Writes candidates/party/<name>.mp3 (normalised) and candidates/party_scores.json"""
import os, glob, json, base64, urllib.request, time
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from common import SR, decode, encode_mp3, measure_array, db, ROOT

HERE = os.path.dirname(os.path.abspath(__file__))
K = os.path.join(HERE, "kenney", "music-jingles")
OUT = os.path.join(HERE, "candidates", "party")
os.makedirs(OUT, exist_ok=True)
PROMPT = """You are an audio QA reviewer for a children's educational iPad game (5-year-olds). This clip is a short victory/celebration jingle
played on the results screen after a round. Return ONLY JSON: {"celebratory": 1-10 (joyful win feeling), "kid_friendly": 1-10 (warm, cute, not harsh/retro-arcade-bleepy),
"clean_ending": 1-10 (ends on a resolved chord, natural ring-out, no abrupt cut), "not_annoying": 1-10, "overall": 1-10, "comment": "one short Traditional Chinese sentence"}"""


def prep(path):
    x = decode(path, 2)
    n = len(x)
    pk = np.max(np.abs(x))
    idx = np.where(np.abs(x).max(axis=1) > pk * db(-50))[0]
    x = x[max(0, idx[0] - 200): idx[-1] + int(0.15 * SR)]
    fo = int(0.08 * SR)
    x[-fo:] *= np.linspace(1, 0, fo)[:, None]
    return x


def score(name, x):
    tmp = os.path.join(OUT, name + ".mp3")
    encode_mp3(x, tmp, kbps=128)
    data = base64.b64encode(open(tmp, "rb").read()).decode()
    body = {"contents": [{"parts": [{"text": PROMPT}, {"inline_data": {"mime_type": "audio/mp3", "data": data}}]}],
            "generationConfig": {"temperature": 0, "responseMimeType": "application/json"}}
    req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent",
                                 data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_API_KEY"]})
    for _ in range(3):
        try:
            d = json.load(urllib.request.urlopen(req, timeout=200))
            r = json.loads(d["candidates"][0]["content"]["parts"][0]["text"])
            return name, (r[0] if isinstance(r, list) else r)
        except Exception as e:
            err = repr(e)[:100]
            time.sleep(3)
    return name, {"error": err}


def synth_party():
    from build_sfx import marimba, bell, mix, t, lp, noise, hp, glide_sine
    q = 0.19
    mel = [(0, 523), (1, 659), (2, 784), (3, 1047), (4, 784), (5, 1047), (6, 1319)]
    parts = [(q * i, marimba(f, 0.6, 7), 0.9) for i, f in mel]
    parts += [(q * i, bell(f * 2, 0.5, 9, 0.1), 0.25) for i, f in mel]
    # final held chord C-E-G-C with bells
    tf = q * 6
    for f, g in ((1047, 0.7), (1319, 0.7), (1568, 0.6), (2093, 0.5)):
        parts.append((tf, bell(f, 2.4, 2.6, 0.2), g))
    # bass pulses
    for i, f in enumerate((131, 131, 196, 196, 131, 196, 131)):
        parts.append((q * i, marimba(f, 0.35, 8), 0.8))
    # sparkle tail
    for j, f in enumerate((2093, 2637, 3136, 2794, 3520, 3136)):
        parts.append((tf + 0.25 + 0.09 * j, bell(f, 0.9, 5, 0.1), 0.35))
    y = mix(*parts)
    y = np.stack([y, y], axis=1)
    return y


def cut_lyria(n, secs=5.5, fade=1.4):
    x = decode(os.path.join(HERE, "candidates", "bgm", n + ".mp3"), 2)[: int(secs * SR)]
    fo = int(fade * SR)
    x[-fo:] *= (np.linspace(1, 0, fo) ** 1.5)[:, None]
    return x


if __name__ == "__main__":
    cands = {"synth_fanfare": synth_party(), "lyria_clip1_cut": cut_lyria("party_1"), "lyria_clip2_cut": cut_lyria("party_2")}
    for k, x in cands.items():
        cands[k] = x * db(-20 - measure_array(x)["lufs"])
    res = {}
    with ThreadPoolExecutor(3) as ex:
        for n, r in ex.map(lambda kv: score(kv[0], kv[1]), cands.items()):
            res[n] = dict(r, dur=round(len(cands[n]) / SR, 2))
            print(n, res[n], flush=True)
    json.dump(res, open(os.path.join(HERE, "candidates", "party_scores.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
