# -*- coding: utf-8 -*-
"""
build_mysongs.py — 阿葉自己的歌（v8 唱片行「我的歌」）：YouTube 音訊 → 剪掉頭尾空白 → 音量對齊小島音樂（-18 LUFS）→ mp3 → 加密成 audio/songs/<id>.bin。
為什麼加密：網站跟 GitHub repo 是公開的；加密後別人抓到的不是能直接聽的 mp3、掃描也認不出是哪首歌（同 GOLDEN 那首的做法）。
密碼不是秘密（前端 js/zhuyin-mysongs.js 也寫著），只是讓檔案不能直接播。原始音檔只放 tools/_src_song/mu/（.gitignore 擋著，不上傳）。

下載（只抓聲音，不要抓到播放清單）：
  yt-dlp --no-playlist --js-runtimes node -f "ba[ext=m4a]/ba" -o "tools/_src_song/mu/%(id)s.%(ext)s" <網址>
用法：PYTHONIOENCODING=utf-8 python tools/audio/build_mysongs.py [id ...]   （不給 id＝全部重做）
加歌：SONGS 加一筆（yt＝YouTube 影片 id、a/b＝要保留的秒數範圍，先用 silencedetect 看頭尾空白），js/zhuyin-mysongs.js 的 MY_SONGS 也加同 id。
"""
import os, re, subprocess, sys
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "tools", "_src_song", "mu")
OUT = os.path.join(ROOT, "audio", "songs")
PW = "zy-island-songs"                            # 跟 js/zhuyin-mysongs.js 一樣
ITER = 200000                                     # 跟 js/song-crypto.js 一樣
TARGET = -18.0                                    # 跟 audio/bgm 一樣的響度
# id → YouTube 影片 id、保留範圍（秒；None＝到結尾）。11-01 阿葉給的四首（silencedetect -45dB 量頭尾空白）
SONGS = {
    "my_soyeon": {"yt": "7mDDM0eBWR0", "a": 0.0, "b": 208.2},     # 소연（SOYEON）〈퇴사할게여〉：結尾 3.4 秒空白
    "my_ateez": {"yt": "eB-IK2wPWzw", "a": 2.0, "b": 155.6},      # ATEEZ〈BAD〉現場版：開頭 2 秒、結尾 13 秒空白（聽寫過，沒有主持人講話）
    "my_jay": {"yt": "aGsrg1NO1cM", "a": 0.0, "b": 223.4},        # 周杰倫〈女兒殿下〉：結尾 1.3 秒空白
    "my_hero": {"yt": "rDstQNzvV2I", "a": 1.6, "b": None},        # 愛好好聽〈英雄爸爸〉（舞蹈版）：開頭 1.7 秒空白
    "my_eyes": {"yt": "VW0oYTYhefs", "a": 0.8, "b": 259.7},       # 11-01 加：張遠〈看著我的眼睛說〉（動態歌詞 MV）：開頭 0.9 秒、結尾 1.3 秒空白
}

def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")

def src_of(yt):
    for ext in ("m4a", "webm", "mp3", "opus"):
        p = os.path.join(SRC, f"{yt}.{ext}")
        if os.path.exists(p): return p
    raise SystemExit(f"找不到原始音檔 {yt}（先用檔頭的 yt-dlp 指令下載到 {SRC}）")

def trim_args(s):
    a = ["-ss", str(s["a"])]
    if s["b"]: a += ["-to", str(s["b"])]
    return a

def loudness(path, s):
    r = run(["ffmpeg", "-hide_banner", "-nostats", *trim_args(s), "-i", path, "-af", "ebur128", "-f", "null", "-"])
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", r.stderr)
    if not m: raise SystemExit("量不到響度：" + r.stderr[-400:])
    return float(m[-1])

def build(sid):
    s = SONGS[sid]; src = src_of(s["yt"])
    dur = float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src]).stdout.strip())
    end = s["b"] or dur; length = end - s["a"]
    lufs = loudness(src, s); gain = TARGET - lufs
    tmp = os.path.join(SRC, f"{sid}.out.mp3")
    af = f"afade=t=in:d=0.25,afade=t=out:st={max(0, length - 1.5):.2f}:d=1.5,volume={gain:.2f}dB,alimiter=limit=0.89"
    r = run(["ffmpeg", "-y", "-hide_banner", *trim_args(s), "-i", src, "-af", af, "-ar", "44100", "-ac", "2", "-c:a", "libmp3lame", "-b:a", "128k", tmp])
    if r.returncode: raise SystemExit("ffmpeg 失敗：" + r.stderr[-600:])
    data = open(tmp, "rb").read()
    salt, iv = os.urandom(16), os.urandom(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(PW.encode("utf-8"))
    os.makedirs(OUT, exist_ok=True)
    out = os.path.join(OUT, f"{sid}.bin")
    open(out, "wb").write(salt + iv + AESGCM(key).encrypt(iv, data, None))
    after = loudness(tmp, {"a": 0, "b": None})
    print(f"{sid}: {length:.1f} 秒  原本 {lufs:.1f} LUFS → {after:.1f} LUFS  mp3 {len(data)//1024} KB → {os.path.relpath(out, ROOT)}")

if __name__ == "__main__":
    for sid in (sys.argv[1:] or list(SONGS)):
        if sid not in SONGS: raise SystemExit(f"沒有這首：{sid}（可用：{', '.join(SONGS)}）")
        build(sid)
