"""v7 音效 13 個（陀螺競技 tp_* ＋ 寵物進化 ev_*）。素材＝Freesound CC0（本機 tools/audio/freesound/v7/，由 fs_search.js／fs_fetch.js 取得並逐檔確認 CC0）
＋Kenney CC0（tools/audio/kenney/）＋numpy 合成。流程與 build_sfx.py 相同：裁切→淡入淡出→響度正規化（活躍段 RMS -17 dBFS、峰值 ≤ -4.3）→mono 128k mp3。
用法：
  python build_v7_sfx.py cands [key...]   把每個鍵的所有候選渲染到 tools/audio/candidates/v7/<key>/<id>.mp3
  python build_v7_sfx.py score [key...]   Gemini（gemini-2.5-flash）逐候選評分 -> candidates/v7/scores.json
  python build_v7_sfx.py final            依 PICKS 渲染到 audio/sfx/<key>.mp3，更新 audio/manifest.json 與 audio/CREDITS.md
"""
import os, sys, json, glob, base64, time, re, urllib.request
import numpy as np
from concurrent.futures import ThreadPoolExecutor
import build_sfx as B
from build_sfx import finish, mix, bell, marimba, noise, bp, lp, hp, swept_noise, glide_sine, t, kl, silence
from common import SR, ROOT, decode, encode_mp3, sample_peak_db, db, measure

HERE = os.path.dirname(os.path.abspath(__file__))
# worktree 裡沒有 gitignore 的 kenney/ 資料夾 -> 指向主資料夾（可用環境變數 KENNEY_DIR 覆蓋）
B.K = os.environ.get("KENNEY_DIR") or (os.path.join(HERE, "kenney") if os.path.isdir(os.path.join(HERE, "kenney")) else "D:/Claude/Projects/GAME DIY/tools/audio/kenney")
FS = os.environ.get("V7_FS", os.path.join(HERE, "freesound", "v7"))
CAND = os.path.join(HERE, "candidates", "v7")
META = None


def meta():
    global META
    if META is None:
        META = json.load(open(os.path.join(FS, "meta.json"), encoding="utf-8"))
    return META


def seg(fid, a=0.0, b=None, gain=1.0):
    p = glob.glob(os.path.join(FS, "*", fid + ".mp3"))[0]
    x = decode(p, 1)[:, 0]
    return (x[int(a * SR): int(b * SR) if b else None] * gain).astype(np.float32)


def pk_norm(x):
    return x / (np.max(np.abs(x)) + 1e-9)


# ---------- 合成零件 ----------
def beep(f=1000, d=0.16):
    tt = t(d)
    y = (np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(2 * np.pi * f * 2 * tt)) * np.minimum(1, tt / 0.004) * np.exp(-6 * tt)
    return y.astype(np.float32)


def rise_whirl(d=0.9, f0=250, f1=2600):
    """陀螺越轉越快：頻率往上掃的嗡聲＋高頻噪音"""
    tt = t(d)
    f = f0 * (f1 / f0) ** (tt / d)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = 0.5 * np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph)
    n = swept_noise(d, 400, 4500, q=0.35) * 0.9
    env = np.minimum(1, tt / 0.05) * (0.35 + 0.65 * (tt / d))
    return ((y + n) * env).astype(np.float32)


def rip_cord(d=0.35):
    n = int(d * SR)
    x = hp(noise(d), 1500) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 38 * t(d))))
    return (x * np.minimum(1, np.linspace(0, 1, n) * 6) * np.linspace(1, 0.6, n)).astype(np.float32)


def sweep_up(d=1.2, f0=180, f1=1800, vib=7.0):
    tt = t(d)
    f = f0 * (f1 / f0) ** (tt / d) * (1 + 0.02 * np.sin(2 * np.pi * vib * tt))
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.15 * np.sin(3 * ph)
    return (y * (0.25 + 0.75 * (tt / d) ** 1.4) * np.minimum(1, tt / 0.03)).astype(np.float32)


def shimmer(d=1.2, base=2000):
    """亮晶晶：一串隨機高音鈴"""
    r = np.random.default_rng(11)
    parts = []
    for i in range(14):
        f = base * float(r.choice([1, 1.25, 1.5, 1.875, 2.25, 2.5]))
        parts.append((float(r.uniform(0, d - 0.35)), bell(f, 0.4, 9, 0.2), float(r.uniform(0.3, 0.8))))
    return mix(*parts)


def K(pack, name, gain=1.0):
    return kl(pack, name, gain)


# ---------- 候選：key -> {id: (fn, 來源說明, 授權)}。fn 回傳 float32 mono ----------
C0 = "CC0"
CANDS = {
    "tp_fuse": {
        "a": (lambda: seg("337865"), "Freesound「metal-click.wav」", "fs:337865"),
        "b": (lambda: seg("119494", 0, 1.1), "Freesound「Slide lock 1.wav」", "fs:119494"),
        "c": (lambda: mix((0, seg("323369", 0.05, 0.75), 1), (0.55, K("impact-sounds", "impactMetal_light_001.ogg"), 0.9)), "Freesound「Metal Slide 2」+ Kenney impactMetal_light_001", "fs:323369"),
        "d": (lambda: mix((0, swept_noise(0.4, 500, 3500, 0.3), 0.7), (0.38, seg("337865"), 1.0), (0.4, K("impact-sounds", "impactMetal_medium_000.ogg"), 0.7), (0.42, bell(1568, 0.5, 8, 0.2), 0.35)), "synth 上升嘶聲 + Freesound「metal-click.wav」+ Kenney impactMetal_medium_000 + 合成鈴", "fs:337865"),
    },
    "tp_launch": {
        "a": (lambda: seg("700144"), "Freesound「Lawnmower pulling cord 4」", "fs:700144"),
        "b": (lambda: mix((0, seg("700144", 0, 0.8), 1.0), (0.55, seg("334970", 0.0, 1.6) * np.linspace(0.2, 1, int(1.6 * SR)), 0.8)), "Freesound「Lawnmower pulling cord 4」+「Metallic Spinning Top」", "fs:700144 fs:334970"),
        "c": (lambda: seg("445966"), "Freesound「Wind-up sound」", "fs:445966"),
        "d": (lambda: mix((0, rip_cord(0.35), 0.9), (0.3, rise_whirl(0.9), 0.9), (1.15, K("impact-sounds", "impactMetal_light_002.ogg"), 0.4)), "synth 拉繩＋加速嗡聲 + Kenney impactMetal_light_002", ""),
    },
    "tp_clash1": {
        "a": (lambda: seg("439540", 0.1, 0.5), "Freesound「Hilt clang!.wav」", "fs:439540"),
        "b": (lambda: seg("638696"), "Freesound「Pickaxe」", "fs:638696"),
        "c": (lambda: K("impact-sounds", "impactMetal_light_001.ogg"), "Kenney impactMetal_light_001", ""),
        "d": (lambda: mix((0, K("impact-sounds", "impactMetal_light_003.ogg"), 1), (0, seg("439540", 0.12, 0.45), 0.6)), "Kenney impactMetal_light_003 + Freesound「Hilt clang!.wav」", "fs:439540"),
    },
    "tp_clash2": {
        "a": (lambda: seg("275159"), "Freesound「Sword Clash.wav」", "fs:275159"),
        "b": (lambda: seg("334169", 0, 0.45), "Freesound「Sword Clash」", "fs:334169"),
        "c": (lambda: K("impact-sounds", "impactMetal_medium_001.ogg"), "Kenney impactMetal_medium_001", ""),
        "d": (lambda: mix((0, K("impact-sounds", "impactMetal_medium_002.ogg"), 1), (0, seg("275159", 0, 0.45), 0.7)), "Kenney impactMetal_medium_002 + Freesound「Sword Clash.wav」", "fs:275159"),
    },
    "tp_clash3": {
        "a": (lambda: seg("270588", 0.38, 1.3), "Freesound「Anvil Hit 2」", "fs:270588"),
        "b": (lambda: seg("209771", 0, 1.0), "Freesound「Metal Hit Cartoon」", "fs:209771"),
        "c": (lambda: seg("530486", 0, 1.4), "Freesound「Metal Impact」", "fs:530486"),
        "d": (lambda: mix((0, K("impact-sounds", "impactMetal_heavy_001.ogg"), 1), (0, seg("275159", 0, 0.5), 0.5), (0.02, seg("270588", 0.4, 1.2), 0.6)), "Kenney impactMetal_heavy_001 + Freesound「Sword Clash.wav」+「Anvil Hit 2」", "fs:275159 fs:270588"),
    },
    "tp_ko": {
        "a": (lambda: seg("209772", 0.2, 1.7), "Freesound「Metal Boom」", "fs:209772"),
        "b": (lambda: seg("244983"), "Freesound「ANI Big Pipe Hit」", "fs:244983"),
        "c": (lambda: seg("222517", 0, 2.3), "Freesound「Dramatic Hit」", "fs:222517"),
        "d": (lambda: mix((0, seg("270588", 0.4, 1.4), 0.8), (0.0, seg("209772", 0.22, 1.7), 1.0), (0.12, shimmer(1.0, 1800), 0.25)), "Freesound「Anvil Hit 2」+「Metal Boom」+ 合成閃光", "fs:270588 fs:209772"),
    },
    "tp_count": {
        "a": (lambda: seg("391650"), "Freesound「beep.wav」", "fs:391650"),
        "b": (lambda: seg("704134"), "Freesound「Beep Sound」", "fs:704134"),
        "c": (lambda: beep(1000, 0.16), "synth 乾淨電子嗶", ""),
    },
    "tp_round": {
        "a": (lambda: seg("97980", 0, 1.6), "Freesound「Winner Bell Game Show.aif」", "fs:97980"),
        "b": (lambda: seg("611113", 0, 1.6), "Freesound「bell ding 1.wav」", "fs:611113"),
        "c": (lambda: seg("116779", 0.22, 1.7), "Freesound「Ringing bell - happy.wav」", "fs:116779"),
        "d": (lambda: mix((0, K("impact-sounds", "impactBell_heavy_001.ogg"), 1), (0.0, seg("611113", 0.05, 1.3), 0.6)), "Kenney impactBell_heavy_001 + Freesound「bell ding 1.wav」", "fs:611113"),
    },
    "tp_cheer": {
        "a": (lambda: seg("182571", 0, 3.0), "Freesound「Short Crowd Cheer.flac」", "fs:182571"),
        "b": (lambda: seg("353923", 0, 3.0), "Freesound「yay.wav」", "fs:353923"),
        "c": (lambda: seg("859076"), "Freesound「KidApplause」", "fs:859076"),
        "d": (lambda: seg("400590", 0, 3.5), "Freesound「Small crowd cheering」", "fs:400590"),
        "e": (lambda: seg("462362", 0, 3.2), "Freesound「Small applause」", "fs:462362"),
    },
    "tp_victory": {
        "a": (lambda: seg("269198"), "Freesound「game-win.mp3」", "fs:269198"),
        "b": (lambda: seg("677859", 0.1, 2.8), "Freesound「Game Success Fanfare」", "fs:677859"),
        "c": (lambda: seg("580310"), "Freesound「Fanfare 2 - Rpg」", "fs:580310"),
        "d": (lambda: seg("397355"), "Freesound「Tada Fanfare A」", "fs:397355"),
    },
    "ev_charge": {
        "a": (lambda: seg("843330", 0.05, 2.7), "Freesound「Power_Up」", "fs:843330"),
        "b": (lambda: seg("375925"), "Freesound「Machine Charge.wav」", "fs:375925"),
        "c": (lambda: seg("610562"), "Freesound「Charge up 2」", "fs:610562"),
        "d": (lambda: seg("443955", 0, 2.2), "Freesound「open-buildup.wav」", "fs:443955"),
        "e": (lambda: mix((0, sweep_up(2.4, 200, 2200), 0.8), (0.3, swept_noise(2.0, 600, 5000, 0.3), 0.35), (1.6, shimmer(0.8, 2400), 0.25)), "synth 上升能量掃頻＋噪音＋閃光", ""),
    },
    "ev_burst": {
        "a": (lambda: seg("214455"), "Freesound「magic burst」", "fs:214455"),
        "b": (lambda: seg("539972"), "Freesound「Fire Burst Flash」", "fs:539972"),
        "c": (lambda: seg("814044", 0, 2.4), "Freesound「Creation Magic Blast」", "fs:814044"),
        "d": (lambda: mix((0, seg("539972", 0, 0.7), 1.0), (0.0, seg("214455", 0, 1.6) * 3, 0.7), (0.05, shimmer(1.4, 2200), 0.35), (0.0, K("impact-sounds", "impactBell_heavy_000.ogg"), 0.5)), "Freesound「Fire Burst Flash」+「magic burst」+ Kenney impactBell_heavy_000 + 合成閃光", "fs:539972 fs:214455"),
    },
    "ev_sparkle": {
        "a": (lambda: seg("715067", 0, 1.5), "Freesound「achievement-sparkle」", "fs:715067"),
        "b": (lambda: seg("562292"), "Freesound「Heal - Rpg」", "fs:562292"),
        "c": (lambda: seg("511485"), "Freesound「cartoon_wink_magic_sparkle.wav」", "fs:511485"),
        "d": (lambda: seg("462095", 0, 2.0), "Freesound「Sparkling Star 01.wav」", "fs:462095"),
        "e": (lambda: seg("639429", 0, 2.4), "Freesound「Crystal Twinkle」", "fs:639429"),
    },
}

TAIL = {"tp_cheer": 0.35, "tp_victory": 0.12, "ev_charge": 0.03, "ev_sparkle": 0.15, "tp_round": 0.15, "tp_ko": 0.1, "ev_burst": 0.12}
USE = {
    "tp_fuse": "戰鬥陀螺：三個字合體成一顆陀螺的一瞬間（喀嚓鎖上）",
    "tp_launch": "戰鬥陀螺：發射（拉繩後陀螺高速旋轉起來）",
    "tp_clash1": "戰鬥陀螺：陀螺相撞（輕）",
    "tp_clash2": "戰鬥陀螺：陀螺相撞（中）",
    "tp_clash3": "戰鬥陀螺：陀螺相撞（重）",
    "tp_ko": "戰鬥陀螺：決勝一擊／對手被撞出場（爆發）",
    "tp_count": "戰鬥陀螺：3、2、1 倒數的一聲電子嗶",
    "tp_round": "戰鬥陀螺：每回合勝負揭曉的一聲「鏘」",
    "tp_cheer": "戰鬥陀螺：小觀眾群歡呼",
    "tp_victory": "戰鬥陀螺：整場勝利的短號角",
    "ev_charge": "寵物進化：蓄力（能量上升）",
    "ev_burst": "寵物進化：白光爆開",
    "ev_sparkle": "寵物進化：新形態亮相的閃閃發光",
}
DESC = {
    "tp_fuse": "a crisp metallic 'click-lock' of parts snapping together into one toy (a satisfying mechanical lock)",
    "tp_launch": "a toy spinning top being launched: ripcord pull then a fast rising whirr as it spins up",
    "tp_clash1": "a LIGHT metal-on-metal clink/clash of two small spinning tops colliding (crisp, short)",
    "tp_clash2": "a MEDIUM metal clash of two toy spinning tops colliding (crisp, solid)",
    "tp_clash3": "a HEAVY powerful metal clash/impact with weight (big, resonant but not scary)",
    "tp_ko": "a big knockout impact with an explosive burst feeling, like a finishing hit in a kids' battle game",
    "tp_count": "a clean electronic countdown beep (one beep)",
    "tp_round": "a bright 'ding/clang' that announces a round result in a game show / arena",
    "tp_cheer": "a small crowd of kids cheering (not too loud, joyful)",
    "tp_victory": "a short triumphant brass fanfare for winning a match (2-3 seconds)",
    "ev_charge": "a rising energy charge-up sound (2-3 s) like a creature gathering power before evolving",
    "ev_burst": "a bright white-light magical burst/explosion with a shiny impact, like a creature evolving in an anime",
    "ev_sparkle": "a glittering magical sparkle/twinkle shimmer, reveal of a new form",
}


def render(key, cid):
    fn = CANDS[key][cid][0]
    x = fn().astype(np.float32)
    x = hp(x, 40, 1) if key not in ("tp_count",) else x
    loud = key in ("tp_ko",)
    return finish(x, tail_fade=TAIL.get(key, 0.03), sat=True)


def write(y, pth):
    for _ in range(4):
        encode_mp3(y, pth, kbps=128)
        dp = sample_peak_db(decode(pth, 1))
        if dp <= -3.3:
            break
        y = y * db(-3.5 - dp)
    return pth


def cmd_cands(keys):
    for k in keys:
        os.makedirs(os.path.join(CAND, k), exist_ok=True)
        for cid in CANDS[k]:
            y = render(k, cid)
            write(y, os.path.join(CAND, k, cid + ".mp3"))
            print(k, cid, round(len(y) / SR, 2), "s", round(sample_peak_db(y), 1), "dB", flush=True)


PROMPT = """You are an audio QA reviewer for a children's game (5-year-olds). The clip is meant to be: {d}.
Return ONLY JSON: {{"matches": 1-10 (how well it sounds like the intended sound), "pleasant_for_kids": 1-10 (not harsh/scary/annoying), "artifacts": 1-10 (10 = clean), "heard": "what you actually hear, <=14 words English"}}"""


def job(args):
    k, cid = args
    p = os.path.join(CAND, k, cid + ".mp3")
    data = base64.b64encode(open(p, "rb").read()).decode()
    body = {"contents": [{"parts": [{"text": PROMPT.format(d=DESC[k])}, {"inline_data": {"mime_type": "audio/mp3", "data": data}}]}],
            "generationConfig": {"temperature": 0, "responseMimeType": "application/json"}}
    err = ""
    for _ in range(3):
        try:
            req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", data=json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_API_KEY"]})
            d = json.load(urllib.request.urlopen(req, timeout=120))
            r = json.loads(d["candidates"][0]["content"]["parts"][0]["text"])
            return k, cid, (r[0] if isinstance(r, list) else r)
        except Exception as e:
            err = repr(e)[:120]
            time.sleep(3)
    return k, cid, {"error": err}


def cmd_score(keys):
    jobs = [(k, c) for k in keys for c in CANDS[k]]
    res = {}
    with ThreadPoolExecutor(4) as ex:
        for k, c, r in ex.map(job, jobs):
            res.setdefault(k, {})[c] = r
            print(k, c, r, flush=True)
    sp = os.path.join(CAND, "scores.json")
    old = json.load(open(sp, encoding="utf-8")) if os.path.exists(sp) else {}
    for k, v in res.items():
        old.setdefault(k, {}).update(v)
    json.dump(old, open(sp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


# ---------- 最終選擇（由 cands＋score＋人工判斷決定後填入）----------
PICKS = {   # Gemini 2.5 Flash 評分（candidates/v7/scores.json）＋人工判斷
    "tp_fuse": "b", "tp_launch": "d", "tp_clash1": "c", "tp_clash2": "d", "tp_clash3": "b", "tp_ko": "d", "tp_count": "c",
    "tp_round": "d", "tp_cheer": "a", "tp_victory": "b", "ev_charge": "a", "ev_burst": "d", "ev_sparkle": "d",
}


def lic_text(spec):
    ids = [s.split(":")[1] for s in spec.split() if s.startswith("fs:")]
    return ids


def cmd_final():
    mp = os.path.join(ROOT, "audio", "manifest.json")
    man = json.load(open(mp, encoding="utf-8"))
    cp = os.path.join(ROOT, "audio", "CREDITS.md")
    cred = open(cp, encoding="utf-8").read()
    rows = []
    for k, cid in PICKS.items():
        y = render(k, cid)
        pth = write(y, os.path.join(ROOT, "audio", "sfx", k + ".mp3"))
        x = decode(pth, 1)[:, 0]
        mm = measure(pth)
        act = x[np.abs(x) > np.max(np.abs(x)) * 10 ** (-30 / 20)]
        fn, src, spec = CANDS[k][cid]
        ids = lic_text(spec)
        urls = []
        for i in ids:
            m = [v for kk, v in meta().items() if v["id"] == i][0]
            assert m["licenseOk"] and "publicdomain/zero" in m["licenseUrl"]
            urls.append(m["url"])
        lic = "CC0 1.0（Freesound 頁面逐檔確認；Kenney CC0；合成部分 numpy 自製 CC0）" if ids else "CC0（Kenney CC0／numpy 自製合成）"
        man["sfx"][k] = {
            "file": f"audio/sfx/{k}.mp3", "use": USE[k], "duration": round(len(x) / SR, 3), "peak_dBFS": round(sample_peak_db(x), 2),
            "activeRms_dBFS": round(float(20 * np.log10(np.sqrt(np.mean(act ** 2)))), 1), "lufs": mm["lufs"] if mm["lufs"] > -70 else None,
            "loop": False, "source": src + "（trim／淡出／響度處理）", "sourceUrl": urls[0] if len(urls) == 1 else (urls or None), "license": lic,
            "v7": True,
        }
        rows.append(f"| {k} | {src} — " + (" ; ".join(urls) if urls else "（無外部連結）") + " — CC0 |")
        print(k, cid, round(len(x) / SR, 2), "s pk", round(sample_peak_db(x), 2), "rms", man["sfx"][k]["activeRms_dBFS"], "lufs", mm["lufs"])
    json.dump(man, open(mp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    cred = cred.rstrip("\n") + "\n\n## v7 新增音效（陀螺競技＋寵物進化，2026-10-13，全部 CC0）\n\n| 音效 | 來源 |\n|---|---|\n" + "\n".join(rows) + "\n"
    open(cp, "w", encoding="utf-8").write(cred)


if __name__ == "__main__":
    cmd = sys.argv[1]
    keys = sys.argv[2:] or list(CANDS)
    {"cands": cmd_cands, "score": cmd_score}.get(cmd, lambda k: cmd_final())(keys) if cmd != "final" else cmd_final()
