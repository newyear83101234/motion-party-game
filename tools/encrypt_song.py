# -*- coding: utf-8 -*-
"""
encrypt_song.py — 把原始 mp3 用密碼加密成 .enc（與前端 Web Crypto 對齊）。
方案：PBKDF2-HMAC-SHA256(密碼, salt, 200000 次) 派生 256-bit 金鑰 → AES-256-GCM。
輸出檔結構（純 bytes 串接）：salt(16) || iv(12) || ciphertext(含 GCM tag)。
原始 mp3 永不進 git；本工具只在本機跑。
用法：python tools/encrypt_song.py <原始mp3路徑> <密碼>
"""
import sys, os
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

OUT = r"d:\Claude\Projects\GAME DIY\MUSIC\kpop_song.enc"
ITER = 200000

def main():
    if len(sys.argv) < 3:
        print("用法：python tools/encrypt_song.py <原始mp3路徑> <密碼>"); return
    src, pw = sys.argv[1], sys.argv[2]
    data = open(src, "rb").read()
    salt = os.urandom(16)
    iv = os.urandom(12)
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER)
    key = kdf.derive(pw.encode("utf-8"))
    ct = AESGCM(key).encrypt(iv, data, None)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "wb").write(salt + iv + ct)
    print(f"OK 加密完成 -> {OUT}  ({len(salt+iv+ct)} bytes, 原始 {len(data)} bytes)")

if __name__ == "__main__":
    main()
