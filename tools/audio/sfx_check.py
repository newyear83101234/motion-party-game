"""Gemini listens to every SFX and judges whether it matches its intended meaning. -> candidates/sfx_scores.json"""
import os, json, base64, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from common import ROOT

HERE = os.path.dirname(os.path.abspath(__file__))
SFX = os.path.join(ROOT, "audio", "sfx")
DESC = {
    "tap": "a light UI tap/click", "select": "a UI select/choose blip", "ok": "a happy 'correct answer' chime",
    "ng": "a gentle, non-scary 'wrong answer' sound (soft, not a harsh buzzer)", "win": "a short triumphant new-record/complete fanfare",
    "sticker": "a sparkly magical sticker-collected shimmer", "pop": "a cute bubble pop", "flip": "a card/page flip", "star": "a bright star-collected twinkle",
    "coin": "a coin pickup", "whoosh": "a swoosh/whoosh transition", "gacha_crank": "a capsule-toy machine crank turning (ratchet clicks)",
    "capsule_open": "a plastic toy capsule popping open with sparkle", "hatch": "an egg cracking and a baby bird peeping",
    "unlock": "an unlocking sound followed by rising chime", "truck_start": "a small toy truck engine starting up",
    "truck_drive": "a looping small truck engine driving sound", "truck_stop": "a truck engine winding down with an air brake hiss",
    "horn": "a cute 'beep-beep' vehicle horn", "load": "a crate being placed onto a truck bed (thud)", "unload": "a crate being lifted down / set on the ground",
    "deliver_ok": "a cheerful 'delivery succeeded' jingle", "door": "a door opening", "lever": "a lever being pulled (latch click and clunk)",
    "bridge": "a drawbridge being lowered (chains, creak, final thud)", "ding": "a doorbell 'ding-dong' notification", "splash": "a water splash",
    "seagull": "a seagull cry", "boat_horn": "a ship/boat horn blast", "wear": "putting on clothes (cloth rustle) with a cute sparkle",
}
PROMPT = """You are an audio QA reviewer for a children's game (5-year-olds). The clip is meant to be: {d}.
Return ONLY JSON: {{"matches": 1-10 (how well it sounds like the intended sound), "pleasant_for_kids": 1-10 (not harsh/scary/annoying), "artifacts": 1-10 (10 = clean, no clicks/pops/distortion except intended), "heard": "what you actually hear, <=12 words English"}}"""


def job(name):
    p = os.path.join(SFX, name + ".mp3")
    data = base64.b64encode(open(p, "rb").read()).decode()
    body = {"contents": [{"parts": [{"text": PROMPT.format(d=DESC[name])}, {"inline_data": {"mime_type": "audio/mp3", "data": data}}]}],
            "generationConfig": {"temperature": 0, "responseMimeType": "application/json"}}
    for _ in range(3):
        try:
            req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent", data=json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_API_KEY"]})
            d = json.load(urllib.request.urlopen(req, timeout=200))
            r = json.loads(d["candidates"][0]["content"]["parts"][0]["text"])
            return name, (r[0] if isinstance(r, list) else r)
        except Exception as e:
            err = repr(e)[:100]
            time.sleep(3)
    return name, {"error": err}


if __name__ == "__main__":
    res = {}
    with ThreadPoolExecutor(4) as ex:
        for n, r in ex.map(job, DESC):
            res[n] = r
            print(n, r, flush=True)
    json.dump(res, open(os.path.join(HERE, "candidates", "sfx_scores.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
