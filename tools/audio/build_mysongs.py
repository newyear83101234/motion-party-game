# -*- coding: utf-8 -*-
"""
build_mysongs.py — 阿葉自己的歌（v8 唱片行「我的歌」）：YouTube 音訊 → 剪出副歌那一段 → 音量對齊小島音樂（-18 LUFS）→ mp3 → 加密成 audio/songs/<id>.bin。
11-03 阿葉「選擇每一個唱片只要播放該歌曲的副歌」：a/b 從「整首去掉頭尾空白」改成「副歌那一段」（約 30～50 秒，檔案小、轉到就馬上出聲）。
  找副歌：faster-whisper 聽寫整首（附時間）→ 找重複最多的那段歌詞 → 起訖點用逐字時間＋每 0.1 秒音量挑「上一句唱完、下一句還沒開口」的空檔
  （工具在當次 scratchpad chorus/asr.py、edge.py；也要確認段落裡沒有講話、頻道廣告）。
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
# id → YouTube 影片 id、副歌範圍 a～b（秒）、fo＝結尾淡出秒數（預設 1.8；切在下一句剛要開始前的用短的，免得最後一個字被淡掉）
# 11-03 起只放副歌：a 停在上一句唱完、副歌第一個字前一點點；b 停在副歌最後一個字之後、下一段開始之前
SONGS = {
    "my_soyeon": {"yt": "7mDDM0eBWR0", "a": 107.1, "b": 143.5, "fo": 0.8},   # 소연（SOYEON）〈퇴사할게여〉第二段副歌（그래 이팔청춘…It was romantic day…La la la）；143.4 換段前的空檔
    "my_ateez": {"yt": "eB-IK2wPWzw", "a": 32.9, "b": 56.28, "fo": 0.3},    # ATEEZ〈BAD〉現場版：預副歌＋副歌（She's so bad…Runnin' on a solo）；56.3 下一段饒舌的重拍進來前
    "my_jay": {"yt": "aGsrg1NO1cM", "a": 71.6, "b": 111.6, "fo": 0.9},      # 周杰倫〈女兒殿下〉喂 寶貝…快走快走吧（頭 0–22 秒、尾 203 秒後是小孩講話的對白，這段沒有）
    "my_hero": {"yt": "rDstQNzvV2I", "a": 165.0, "b": 203.3, "fo": 0.5},    # 愛好好聽〈英雄爸爸〉最後兩遍副歌（幸福啊 有爸爸陪我玩耍…我永遠愛你啊）
    "my_eyes": {"yt": "VW0oYTYhefs", "a": 63.05, "b": 116.5, "fo": 1.6},    # 張遠〈看著我的眼睛說〉第一段完整副歌（來 你看著我的眼睛說…我抱你這最後一次）
    "my_smile": {"yt": "6BEfgRupc6Q", "a": 62.0, "b": 108.4, "fo": 0.6},    # 11-03 加：萌妞贊隊〈你笑起來真好看〉間奏後的兩遍副歌；108.46 再唱一次「整個世界」前切
    "my_maruko": {"yt": "l3cH_LUZjkI", "a": 101.85, "b": 136.0, "fo": 0.8}, # 11-03 加：櫻桃小丸子主題曲〈稍息立正站好〉中文版（波波星球）第二遍副歌；影片頭 0–6 秒、尾 226 秒後是頻道講話，都不在這段
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
    fo = s.get("fo", 1.8)
    af = f"afade=t=in:d=0.12,afade=t=out:st={max(0, length - fo):.2f}:d={fo},volume={gain:.2f}dB,alimiter=limit=0.89"   # 副歌從一句的開頭切：淡入很短（只防爆音）、結尾淡出 fo 秒
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
