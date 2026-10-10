"""Gemini REST 小工具（不依賴 google-genai 版本）。
金鑰只從 Windows 使用者環境變數 GEMINI_API_KEY 讀，放在 header，不進網址、不印出。
"""
import base64
import json
import os
import urllib.error
import urllib.request

BASE = "https://generativelanguage.googleapis.com/v1beta"


def _key():
    k = os.environ.get("GEMINI_API_KEY")
    if not k:
        raise SystemExit("找不到環境變數 GEMINI_API_KEY")
    return k


def call(method, path, body=None, timeout=120):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"x-goog-api-key": _key(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8")
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:800]}


def tts(text, voice, model="gemini-3.8-flash-tts", style=None):
    """回傳 (wav_bytes, usage_dict)；失敗丟例外（訊息不含金鑰）。"""
    part = {"type": "text", "text": text}
    if style:
        part["annotations"] = [{"type": "speech_metadata", "style": style}]
    body = {"model": model,
            "input": [{"type": "user_input", "content": [part]}],
            "response_format": {"type": "audio"},
            "generation_config": {"speech_config": [{"voice": voice}]}}
    st, js = call("POST", "/interactions", body)
    if st != 200:
        raise RuntimeError(f"TTS HTTP {st}: {json.dumps(js, ensure_ascii=False)[:600]}")
    return base64.b64decode(find_audio(js)), js.get("usage") or js.get("usage_metadata") or {}


def find_audio(js):
    """在 interactions 回應裡找 base64 音訊（欄位名稱各版本略有不同，遞迴找 data）。"""
    if isinstance(js, dict):
        oa = js.get("output_audio") or js.get("outputAudio")
        if isinstance(oa, dict) and oa.get("data"):
            return oa["data"]
        for k, v in js.items():
            if k in ("data",) and isinstance(v, str) and len(v) > 1000:
                return v
            r = find_audio(v)
            if r:
                return r
    elif isinstance(js, list):
        for v in js:
            r = find_audio(v)
            if r:
                return r
    return None


def tts_generate_content(text, voice, model):
    """舊式 generateContent（給 3.1 / 2.5 preview TTS 用）。回傳 (pcm_or_wav_bytes, mime, usage)。"""
    body = {"contents": [{"parts": [{"text": text}]}],
            "generationConfig": {"responseModalities": ["AUDIO"],
                                 "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}
    st, js = call("POST", f"/models/{model}:generateContent", body)
    if st != 200:
        raise RuntimeError(f"generateContent HTTP {st}: {json.dumps(js, ensure_ascii=False)[:600]}")
    p = js["candidates"][0]["content"]["parts"][0]["inlineData"]
    return base64.b64decode(p["data"]), p.get("mimeType", ""), js.get("usageMetadata", {})


def understand_audio(audio_bytes, mime, prompt, model="gemini-2.5-flash"):
    body = {"contents": [{"parts": [{"inlineData": {"mimeType": mime, "data": base64.b64encode(audio_bytes).decode()}},
                                    {"text": prompt}]}],
            "generationConfig": {"temperature": 0}}
    st, js = call("POST", f"/models/{model}:generateContent", body)
    if st != 200:
        raise RuntimeError(f"understand HTTP {st}: {json.dumps(js, ensure_ascii=False)[:600]}")
    parts = js["candidates"][0]["content"]["parts"]
    return "".join(p.get("text", "") for p in parts), js.get("usageMetadata", {})
