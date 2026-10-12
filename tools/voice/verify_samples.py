"""驗證語音樣本（耳朵聽不到 → 用數據檢查）→ voice/samples/check.json

1. 檔案檢查：ffprobe 長度 / 取樣率 / 聲道。
2. 盲聽寫：不給答案、只聽音檔，寫出「實際聽到的」國字＋拼音、口音判斷、自然度。
   主判 Gemini 3.8 Flash、第二意見 Gemini 2.5 Flash（音檔前後墊 0.5 秒空白，否則短音檔會亂補字）。
3. 最小對比（不靠 AI 聽寫）：同一個聲音再唸兩個「只差那個音」的參考詞，
   比對樣本跟哪個參考比較像：
   - 企鵝：參考「器鵝」(ㄑㄧˋ，台灣) vs「起鵝」(ㄑㄧˇ，大陸) → 比音高曲線（聲調）
   - 蝸牛：參考「瓜牛」(ㄍㄨㄚ，台灣) vs「窩牛」(ㄨㄛ，大陸) → 比頻譜（MFCC，聲母韻母）
用法：python tools/voice/verify_samples.py   （參考音檔放 scratchpad 或 --refs <資料夾>）
"""
import asyncio
import base64
import json
import os
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gemini_rest as g  # noqa: E402
import make_samples as ms  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SAMPLES = ROOT / "voice" / "samples"
REFS = Path(sys.argv[sys.argv.index("--refs") + 1]) if "--refs" in sys.argv else Path(tempfile.gettempdir()) / "zy_voice_refs"
MAN = json.loads((SAMPLES / "manifest.json").read_text(encoding="utf-8"))
CHECK_P = SAMPLES / "check.json"

PROMPT = """你是華語語音學家。這段音檔是一句中文或一個詞。請完全依照「實際聽到的發音」聽寫：
不要猜說話者想講什麼、不要套用字典的標準讀音；聽到什麼音就寫什麼音（例如聽到 wo1 就寫 wo1，聽到 gua1 就寫 gua1）。
只輸出 JSON：
{"hanzi": "依聽到的音寫成繁體中文", "pinyin": "實際發音的漢語拼音，聲調用數字1-4，輕聲用5，音節用空白分開",
 "accent": "台灣國語 / 大陸普通話 / 外國口音 / 無法判斷 四選一", "accent_reason": "一句話依據",
 "natural": 1到5的整數（5=完全像真人，1=明顯機器音）, "issues": "多唸、吞字、怪停頓、機械感、雜音等問題；沒有就空字串"}"""

PAIRS = {  # 樣本 id → (台灣讀音參考, 大陸讀音參考, 比較方式)
    "r1_qie": (("tw", "器鵝"), ("cn", "起鵝"), "f0"),
    "r2_guaniu": (("tw", "瓜牛"), ("cn", "窩牛"), "mfcc"),
}
# 注意：edge-tts 同一句每次輸出一模一樣，最小對比很可靠；Gemini 每次生成都不同，對比距離只能當參考，以聽寫＋改字測試為主。


# ---------- 音訊特徵（純 numpy，不另裝套件）----------
def load(p, sr=16000):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"], capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.int16).astype(np.float32) / 32768.0


def frames(x, n=400, h=160):
    if len(x) < n:
        x = np.pad(x, (0, n - len(x)))
    k = 1 + (len(x) - n) // h
    return np.stack([x[i * h:i * h + n] for i in range(k)])


def mfcc(x, sr=16000, nmel=26, nc=13):
    f = frames(x) * np.hamming(400)
    spec = np.abs(np.fft.rfft(f, 512)) ** 2
    mel = lambda hz: 2595 * np.log10(1 + hz / 700)
    imel = lambda m: 700 * (10 ** (m / 2595) - 1)
    pts = imel(np.linspace(mel(60), mel(7600), nmel + 2))
    bins = np.floor((512 + 1) * pts / sr).astype(int)
    fb = np.zeros((nmel, 257))
    for i in range(1, nmel + 1):
        a, b, c = bins[i - 1], bins[i], bins[i + 1]
        fb[i - 1, a:b] = (np.arange(a, b) - a) / max(b - a, 1)
        fb[i - 1, b:c] = (c - np.arange(b, c)) / max(c - b, 1)
    e = spec @ fb.T
    keep = e.sum(1) > e.sum(1).max() * 1e-3          # 只留有聲音的幀
    le = np.log(e[keep] + 1e-10)
    n = np.arange(nmel)
    dct = np.cos(np.pi / nmel * (n + 0.5)[None, :] * np.arange(1, nc)[:, None])
    c = le @ dct.T
    return (c - c.mean(0)) / (c.std(0) + 1e-6)


def f0(x, sr=16000, lo=110, hi=520):
    out = []
    for fr in frames(x, 640, 160):                   # 40ms 窗
        fr = fr - fr.mean()
        if np.sqrt((fr ** 2).mean()) < 0.01:
            continue
        ac = np.correlate(fr, fr, "full")[len(fr) - 1:]
        a, b = sr // hi, sr // lo
        lag = a + int(np.argmax(ac[a:b]))
        if ac[lag] / (ac[0] + 1e-9) > 0.45:
            out.append(12 * np.log2(sr / lag))
    v = np.array(out)
    return (v - np.median(v))[:, None] if len(v) else np.zeros((1, 1))


def formants(p, sr=10000, order=12):
    """LPC 估 F1/F2/F3（取有聲段中間一半）。ㄩ 是圓唇音，F2/F3 會比 ㄧ 低很多。"""
    x = load(p, sr)
    e = np.convolve(x ** 2, np.ones(200) / 200, "same")
    idx = np.where(e > e.max() * 0.2)[0]
    seg = x[idx[0]:idx[-1]]
    seg = seg[len(seg) // 4: 3 * len(seg) // 4]
    out = []
    for i in range(0, len(seg) - 250, 100):
        fr = seg[i:i + 250]
        fr = np.append(fr[0], fr[1:] - 0.97 * fr[:-1]) * np.hamming(250)
        r = np.correlate(fr, fr, "full")[249:249 + order + 1]
        a = np.zeros(order + 1); a[0] = 1; err = r[0]
        for k in range(1, order + 1):            # Levinson-Durbin
            kk = -(r[k] + np.dot(a[1:k], r[k - 1:0:-1])) / err
            a[1:k] = a[1:k] + kk * a[k - 1:0:-1]; a[k] = kk; err *= (1 - kk * kk)
        fs = sorted(f for f, b in ((np.angle(z) * sr / 2 / np.pi, -sr / np.pi * np.log(abs(z))) for z in np.roots(a) if np.imag(z) > 0)
                    if f > 250 and b < 400)
        if len(fs) >= 3:
            out.append(fs[:3])
    return [int(f) for f in np.median(np.array(out), 0)] if out else [0, 0, 0]


def dtw(a, b):
    n, m = len(a), len(b)
    d = np.sqrt(((a[:, None, :] - b[None, :, :]) ** 2).sum(-1))
    D = np.full((n + 1, m + 1), np.inf); D[0, 0] = 0
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            D[i, j] = d[i - 1, j - 1] + min(D[i - 1, j], D[i, j - 1], D[i - 1, j - 1])
    return float(D[n, m] / (n + m))


# ---------- 參考音檔 ----------
def make_refs():
    REFS.mkdir(parents=True, exist_ok=True)
    jobs = []
    for c in ms.CANDS:
        for lid, (tw, cn, how) in PAIRS.items():
            for tag, text in (tw, cn):
                p = REFS / f"{c['id']}__{lid}__{tag}.mp3"
                if not p.exists():
                    jobs.append((c, text, p))
    for c, text, p in jobs:
        if c["engine"] == "edge":
            asyncio.run(ms.edge_one(c, text, p))
        else:
            ms.gemini_one(c, text, "word", p)
    return len(jobs)


def padded_wav(path):
    """前後各墊 0.5 秒空白：太短的音檔（單字）模型會亂補字、甚至把指令唸回來；墊空白＋指令放前面就正常。"""
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-af", "adelay=500:all=1,apad=pad_dur=0.6",
                        "-ac", "1", "-ar", "16000", "-f", "wav", "-"], capture_output=True, check=True)
    return r.stdout


def transcribe(path, model):
    body = {"contents": [{"parts": [{"text": PROMPT},
                                    {"inlineData": {"mimeType": "audio/wav", "data": base64.b64encode(padded_wav(path)).decode()}}]}],
            "generationConfig": {"temperature": 0, "responseMimeType": "application/json"}}
    for attempt in range(4):
        st, js = g.call("POST", f"/models/{model}:generateContent", body)
        if st == 200:
            try:                                                   # 10-12：偶爾 200 卻沒有 candidates（被擋/空回應）→ 當成失敗重試，不要整批當掉
                txt = "".join(p.get("text", "") for p in js["candidates"][0]["content"]["parts"])
            except (KeyError, IndexError, TypeError):
                time.sleep(6 * (attempt + 1)); continue
            u = js.get("usageMetadata", {})
            try:
                out = json.loads(txt)
            except Exception:
                out = {"raw": txt[:300]}
            out["_tokens"] = dict(input=u.get("promptTokenCount", 0), output=u.get("candidatesTokenCount", 0) + u.get("thoughtsTokenCount", 0))
            return out
        time.sleep(6 * (attempt + 1))
    return {"error": f"HTTP {st}"}


def main():
    old = json.loads(CHECK_P.read_text(encoding="utf-8")) if CHECK_P.exists() else {}
    res = {"files": {}, "asr": old.get("asr", {}), "asr2": old.get("asr2", {}), "pairs": {}}
    # 1. 檔案
    for r in MAN["rows"]:
        p = ROOT / r["file"]
        pr = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration,bit_rate:stream=sample_rate,channels",
                             "-of", "json", str(p)], capture_output=True, text=True)
        js = json.loads(pr.stdout or "{}")
        st = (js.get("streams") or [{}])[0]
        res["files"][r["file"]] = dict(duration=float(js.get("format", {}).get("duration", 0)), sample_rate=st.get("sample_rate"),
                                       channels=st.get("channels"), bit_rate=js.get("format", {}).get("bit_rate"))
    # 2. 盲聽寫
    for key, model in (("asr", "gemini-3.8-flash"), ("asr2", "gemini-2.5-flash")):   # 主判：3.8；第二意見：2.5
        todo = [r for r in MAN["rows"] if r["file"] not in res[key] or "error" in res[key][r["file"]] or "raw" in res[key][r["file"]]]
        with ThreadPoolExecutor(4) as ex:
            for r, out in zip(todo, ex.map(lambda r: transcribe(ROOT / r["file"], model), todo)):
                res[key][r["file"]] = out
    # 3. 最小對比
    n = make_refs()
    print("新產生參考音檔", n, "個 →", REFS)
    for c in ms.CANDS:
        for lid, (tw, cn, how) in PAIRS.items():
            feat = f0 if how == "f0" else mfcc
            s = feat(load(SAMPLES / c["id"] / f"{lid}.mp3"))
            dtw_tw = dtw(s, feat(load(REFS / f"{c['id']}__{lid}__tw.mp3")))
            dtw_cn = dtw(s, feat(load(REFS / f"{c['id']}__{lid}__cn.mp3")))
            onset = None
            if how == "f0":   # 第一音節起頭音高（相對整詞中位數，半音）：四聲 ㄑㄧˋ 起頭高（≥+7），三聲 ㄑㄧˇ 起頭低
                onset = round(float(s[:3, 0].mean()), 1)
            res["pairs"][f"{c['id']}/{lid}"] = dict(method=how, onset_st=onset, deterministic=c["engine"] == "edge", ref_tw=tw[1], ref_cn=cn[1], dist_tw=round(dtw_tw, 3), dist_cn=round(dtw_cn, 3),
                                                     closer="台灣" if dtw_tw < dtw_cn else "大陸",
                                                     margin=round(abs(dtw_tw - dtw_cn) / max(dtw_tw, dtw_cn), 2))
    # 4. 「魚」的 ㄩ 有沒有唸成 ㄧ：跟同一個聲音唸的「衣」比 F3（ㄩ 圓唇 → F3 明顯較低）
    res["yu_vs_yi"] = {}
    for c in ms.CANDS:
        ref = REFS / f"{c['id']}__yi.mp3"
        if not ref.exists():
            asyncio.run(ms.edge_one(c, "衣", ref)) if c["engine"] == "edge" else ms.gemini_one(c, "衣", "word", ref)
        fy, fi = formants(SAMPLES / c["id"] / "s4_word.mp3"), formants(ref)
        ratio = round(fy[2] / fi[2], 2) if fi[2] else None
        res["yu_vs_yi"][c["id"]] = dict(yu_F123=fy, yi_ref_F123=fi, F3_ratio=ratio, verdict="ㄩ（正確）" if ratio and ratio < 0.85 else "可疑，像 ㄧ")
    # 5. 改字補救測試：Gemini 把「蝸牛」送成「瓜牛」、「企鵝」送成「器鵝」，聽寫看看是不是台灣讀音
    res["homophone"] = old.get("homophone", {})
    hs = [(c, lid) for c in ms.CANDS if c["engine"] == "gemini" for lid in PAIRS if f"{c['id']}/{lid}" not in res["homophone"]]
    with ThreadPoolExecutor(4) as ex:
        for (c, lid), out in zip(hs, ex.map(lambda t: transcribe(REFS / f"{t[0]['id']}__{t[1]}__tw.mp3", "gemini-3.8-flash"), hs)):
            res["homophone"][f"{c['id']}/{lid}"] = dict(sent_text=PAIRS[lid][0][1], heard=out.get("hanzi"), pinyin=out.get("pinyin"), _tokens=out.get("_tokens"))
    CHECK_P.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    # 摘要
    for c in ms.CANDS:
        print("==", c["id"])
        for r in [r for r in MAN["rows"] if r["cand"] == c["id"]]:
            a = res["asr"].get(r["file"], {}); b = res["asr2"].get(r["file"])
            print(f"  {r['line']:<12} {r['tts_text']:<12} → {a.get('hanzi','?')} | {a.get('pinyin','?')} | {a.get('accent','?')} | 自然{a.get('natural','?')} | {a.get('issues','')}"
                  + (f"  ||2.5: {b.get('hanzi','?')} {b.get('pinyin','?')} {b.get('accent','?')}" if b else ""))
        for lid in PAIRS:
            p = res["pairs"][f"{c['id']}/{lid}"]
            print(f"  [對比] {lid}: 台灣參考 {p['dist_tw']} vs 大陸參考 {p['dist_cn']} → 較像{p['closer']}（差距 {p['margin']}）起頭音高 {p['onset_st']}")
        print("  [魚/衣]", res["yu_vs_yi"][c["id"]])
        for lid in PAIRS:
            if f"{c['id']}/{lid}" in res["homophone"]:
                print("  [改字]", lid, res["homophone"][f"{c['id']}/{lid}"])


if __name__ == "__main__":
    main()
