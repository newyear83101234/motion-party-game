"""Generate BGM candidates with Gemini Lyria (lyria-3.5). Re-runnable: skips existing files.
Usage: python gen_music.py [--test]   (key from env GEMINI_API_KEY, never printed)
Outputs tools/audio/candidates/bgm/<key>_<n>.mp3 and appends cost to candidates/cost.json
"""
import os, sys, json, base64, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "candidates", "bgm")
os.makedirs(OUT, exist_ok=True)
MODEL = os.environ.get("LYRIA_MODEL", "lyria-3.5")
PRICE = 0.08

COMMON = ("Instrumental only, no vocals, no singing, no choir, no spoken words. Children's video game background music "
          "for a 5-year-old, gentle and friendly, never scary. Steady consistent groove and stable sections that loop easily, "
          "no sudden changes, no dramatic build-ups, no abrupt ending, keep the mid frequencies uncluttered so a narrator's voice "
          "can sit on top, soft dynamics, no harsh or shrill sounds. ")
THEMES = {
    "party": "A very short celebratory victory fanfare jingle for a kids game results screen, about 4 seconds long, bright bells, glockenspiel and pizzicato, a joyful rising phrase that ends on a clear final resolved chord with a natural ring-out ending. Finishes cleanly, then silence.",
    "island": "Bright, cheerful, bouncy tropical island theme at 105 BPM. Ukulele strums, marimba melody, glockenspiel sparkles, light shaker and soft bass.",
    "calm": "Calm, warm, thoughtful puzzle-thinking music at 80 BPM. Soft felt piano and celesta, gentle pad, very light pulse.",
    "town": "Light, upbeat, friendly small-town city groove at 110 BPM. Light funk with clean muted guitar, soft electric piano, playful bass, brushed drums.",
    "rainbow": "Dreamy, happy, magical rainbow sky music at 95 BPM. Bell chimes, harp arpeggios, soft strings pad, twinkling bells.",
    "night": "Soothing lullaby at 70 BPM for bedtime. Music box melody, soft warm pad, very gentle, slow and sleepy, sparse.",
    "road": "Cheerful road trip driving music at 112 BPM. Bouncy upright bass, light acoustic guitar, whistling-free, hand claps, playful bounce feel.",
    "dress": "Cute, stylish, playful fashion-show music at 115 BPM. Pizzicato strings, plucky synth, bubbly bass, light snaps and claps.",
    "bubble": "Underwater bubbly floating music at 90 BPM. Watery bubbly synth plucks, soft marimba, airy pad, glassy droplets, relaxed.",
}
N = int(os.environ.get("NCAND", "3"))


def call(prompt):
    key = os.environ["GEMINI_API_KEY"]
    body = json.dumps({"model": MODEL, "input": prompt, "response_format": {"type": "audio"}}).encode()
    req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/interactions", data=body,
                                 headers={"Content-Type": "application/json", "x-goog-api-key": key})
    d = json.load(urllib.request.urlopen(req, timeout=600))
    for st in d.get("steps", []):
        if st.get("type") == "model_output":
            for c in st.get("content", []):
                if c.get("type") == "audio":
                    return base64.b64decode(c["data"])
    raise RuntimeError("no audio in response")


def job(k, i):
    path = os.path.join(OUT, f"{k}_{i}.mp3")
    if os.environ.get("ONLY") and k not in os.environ["ONLY"].split(","):
        return k, i, "skip-filter"
    if os.path.exists(path) and os.path.getsize(path) > 10000:
        return k, i, "skip"
    for attempt in range(2):
        try:
            data = call((("Instrumental only, no vocals. " ) if k == "party" else COMMON) + THEMES[k])
            open(path, "wb").write(data)
            return k, i, "ok %d bytes" % len(data)
        except urllib.error.HTTPError as e:
            msg = "HTTP %d %s" % (e.code, e.read()[:200])
        except Exception as e:
            msg = repr(e)[:200]
        time.sleep(5)
    return k, i, "FAIL " + msg


if __name__ == "__main__":
    jobs = [("island", 1)] if "--test" in sys.argv else [(k, i) for k in THEMES if k != "party" or os.environ.get("ONLY") == "party" for i in range(1, N + 1)]
    with ThreadPoolExecutor(4) as ex:
        for r in ex.map(lambda a: job(*a), jobs):
            print(*r, flush=True)
