# 畫畫遊戲音樂音效來源與授權（audio/draw/）

最後更新 2026-10-31。全部可免署名用於公開免費網站。

## 背景音樂 bgm.mp3
- 內容與 `audio/bgm/rainbow.mp3` 相同（Gemini API Lyria 3.5 `lyria-3.5` 生成，候選 rainbow_3，instrumental，經 tools/audio/loopmaker.py 切好循環點）。授權依 Gemini API Additional Terms（https://ai.google.dev/gemini-api/terms ），不需署名，輸出含不可聽見的 SynthID。
- 原本要為「畫畫工作室」新生 3 首，Lyria 呼叫回 HTTP 402（付款/額度），故改用現有曲目；樂器（鐘琴、豎琴、弦樂、鈴聲）與 96 BPM 也貼近畫畫情境。
- 循環點見 audio.json（loopStart 0.5、loopEnd 67.988821，檔案總長 68.49 秒）。

## 音效 sfx/
| 檔 | 來源 | 授權 |
|---|---|---|
| tap | Kenney Interface Sounds click_002 | CC0 |
| pick | Kenney Interface Sounds tick_001 | CC0 |
| fill | Freesound 410335 "Water drop / Splash" by bxyorna（低通、剪短） | CC0 |
| sticker | numpy 自行合成（彈性 pop＋鈴聲亮點） | CC0（自製） |
| undo | Freesound 60013 "Whoosh" by qubodup（倒轉、低通） | CC0 |
| clear | numpy 自行合成（紙張揉皺：隨機噪音爆點＋柔和 whoosh） | CC0（自製） |
| open | Kenney RPG Audio bookFlip3 | CC0 |
| finish | Freesound 456965 "Short Success Sound Glockenspiel Treasure Video Game" by FunWithSound（剪 2.2 秒） | CC0 |
| save | Freesound 625174 "[UI Sound] Approval - High Pitched Bell Synth" by GabFitzgerald | CC0 |
| magic | Freesound 511485 "cartoon_wink_magic_sparkle" by MLaudio | CC0 |
| pop | Freesound 401542 "Pop Sound" by ConarB13 | CC0 |

Kenney 套件：https://kenney.nl/assets （Creative Commons Zero）。Freesound 各檔 CC0 授權網址記錄在 tools/audio/freesound/meta.json。

處理腳本：tools/audio/draw_sfx.py（單聲道 44.1kHz mp3 128k、RMS 約 -18～-22 dBFS）、tools/audio/draw_verify.py（驗收＋產生 audio.json 與 _seam.mp3）。
