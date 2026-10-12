# 注音戰鬥陀螺：常用字資料與戰力公式（資料來源、授權、重建方法）

> 2026-10-12 建。對應規格 docs/zhuyin-tops-spec.md §2。產物：`js/zhuyin-tops-dict.json`（前端動態載入）、`tools/tops/gas/TopsDict.gs`＋`TopsPower.gs`（Apps Script 後端用）。

## 1. 資料來源與授權（全部可再散布；**沒有用萌典資料**）

| 用在哪 | 來源 | 授權 | 怎麼用 |
|---|---|---|---|
| 每個字的台灣注音讀音（含破音字）、字頻、「每個讀音」的頻率 | [McBopomofo 小麥注音輸入法](https://github.com/openvanilla/McBopomofo) 詞庫 `Source/Data/BPMFBase.txt`、`BPMFMappings.txt`、`phrase.occ`（固定 commit `be6564acad6c4d3265c34a2e1a872d80f9db6068`，2026-09-29） | MIT License，Copyright (c) 2011-2026 Mengjuei Hsieh et al.（詞庫源自 libtabe 的 tsi.src，BSD 授權） | 讀音照輸入法的台灣讀音；字頻＝語料裡出現次數；破音字每個讀音的頻率＝含該讀音的詞的次數加總（候選字排序用） |
| 常用字範圍 | Unicode Unihan 15.0.0 `Unihan_OtherMappings.txt` 的 `kBigFive` | Unicode License（Unicode Data Files and Software License，允許複製、修改、散布） | 只取「Big5 常用字區 A440–C67E」這個範圍，再用字頻篩 |
| 遊戲詞庫讀音（強制收錄） | 本專案 `js/zhuyin-words.js`、`js/zhuyin-tops.js` 的 INSPIRE | 本專案自有 | 人工校對過的台灣讀音一定收（例：亞 ㄧㄚˋ、蝸 ㄍㄨㄚ） |
| 四項能力值 | Noto Sans TC（Google Fonts，`C:\Windows\Fonts\NotoSansTC-VF.ttf`，Version 2.04，sha256 開頭 `c6481c5d9342`，字重 500） | SIL Open Font License 1.1 | 字型**不散布**，只散布「用它畫出來量到的數字」 |

MIT 授權要求附上著作權與授權聲明，全文如下（字典檔 `about` 欄也有摘要）：

```
MIT License

Copyright (c) 2011-2026 Mengjuei Hsieh et al.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

不用的來源：萌典／教育部《重編國語辭典》（CC BY-ND，不能改作再散布）、pypinyin（大陸讀音，台灣讀音不準）。
（介面文字的自動旁注音 `tools/build_zhuyin_ui.py` 本來就會查萌典，那是另一條既有流程，跟這份字典無關。）

## 2. 重建

```
PYTHONIOENCODING=utf-8 python tools/tops/build_dict.py     # 下載（快取在 %TEMP%\zy-tops-cache）→ 選字 → headless Chromium 量字形 → 輸出 json ＋ GAS 兩個 .gs
python tools/tops/build_gas.py                              # 只改了 js/zhuyin-tops-power.js 時跑這支
node tools/tops/power_dist.mjs                              # 戰力分佈（調 ★ 數字用）
node tools/zy-test/tops.js                                  # 全部測試（要先開 python -m http.server 8765）
```
- 字型換版本＝能力值會變（快取檔名含字型 sha256），已經上榜的戰力也會跟著變——**上線後不要換字型或改量法**；真的要改，排行榜要一起重算。
- 換別台電腦重建：沒有 `C:\Windows\Fonts\NotoSansTC-VF.ttf` 會改下載 Google Fonts 的 NotoSansTC[wght].ttf（版本可能不同 → 數字會不同），可用環境變數 `ZY_TOPS_FONT` 指定同一個字型檔。

## 3. 選字與讀音規則（build_dict.py）

- 收字：Big5 常用字區裡字頻 ≥12 的字＋常用字區外但字頻 ≥150 的字（香菇的「菇」、獼猴的「獼」…）＋遊戲詞庫用到的字 → **4787 字**。
- 讀音：輸入法列的讀音裡，留下「該讀音頻率 ≥ max(2, 該字總頻率 0.3%)」或最常用的那個（去掉「期 ㄐㄧ」「行 ㄏㄤˋ」這種幾乎沒人用的讀音）＋遊戲詞庫的讀音 → **1203 個音節、5183 筆候選**。
- 候選字排序：依「該讀音」的頻率（破音字在冷門讀音那邊排後面，例：ㄓㄨㄥˋ 重眾中仲種、ㄔㄨㄥˊ 重蟲崇）。
- 輕聲：輸入法有收的輕聲字先列（ㄅㄚ˙ 吧爸巴），再接同音節一～四聲的字（`topsCandidates`）。
- 主要讀音（押韻、同聲調加成用；伺服器只拿到詞句，所以一律用這個）：該字最常用的讀音。

## 4. 能力值（字形量測，measure_glyphs.js）

64×64 畫布、Noto Sans TC 字重 500、58px、置中：
| 能力 | 原始量 | 處理 |
|---|---|---|
| 重量 | 墨水比例（灰階加總 / 4096） | 名次百分位 → 1–99 |
| 穩定 | 左右對稱 40%＋上下對稱 25%＋重心靠中 35% | 名次百分位；跟重量的相關打五折（殘差混合） |
| 攻擊 | 輪廓像素 60%＋尖角數 40% | 同上，保留 45% |
| 防禦 | 凸包填滿率 | 同上，保留 35% |

「跟重量的相關打折」：不打折時四項都跟筆畫多寡高度相關（重量×防禦 0.86），筆畫多的字樣樣第一、對戰沒變化；打折後相關係數 0.03–0.43。例：一＝重 1／穩 99／攻 11／防 99（一道牆）、龍＝87／67／78／34。

## 5. 字典檔格式（js/zhuyin-tops-dict.json，93 KB，gzip 54 KB）

`{ about, v, font, n, chars, stats, prim, syl, cand }`
- `chars`：4787 字（字頻高→低）；`stats`：每字 8 位數字＝重量、穩定、攻擊、防禦各 2 位；`prim`：每字 2 個字元＝主要讀音在 `syl` 的編號（64 進位，字母表 `0-9A-Za-z_-`）
- `syl`／`cand`：音節（一聲不標、輕聲 ˙ 在尾）→ 候選字串
- 解碼：`js/zhuyin-tops-power.js` 的 `topsDecodeDict()`（GAS 同一份）

## 6. 戰力公式（js/zhuyin-tops-power.js；★＝可調）

- 單字戰力＝重量×1.2＋穩定×1.0＋攻擊×1.3＋防禦×1.1，線性換算到 100–1999。表外的字用字碼雜湊（FNV-1a）給 20–80 的平凡能力。
- 同一個字第 3 次起只算 6 成★（不然「最強的字打 5 次」穩坐第一）。
- 加成（每種每句一次）★：疊字 +200；押韻（同韻母 3 字 +300、4 字 +450、5 字 +600；不看介音與聲調）；同聲調連發（連 3 字 +250、4 字 +350、5 字 +450）；動物字 +150；顏色字 +150；強字（超強王神霸帝皇勇猛威無敵巨鋼鐵雷電火）+100。
- 上限 9999。
- 分佈（字頻前 3000 字隨機 2 萬句，2026-10-12）：p5 3877、中位 5119、p95 6507、最高 8044；3000–6500 佔 95.0%、≥8000 佔 0.01%；刻意用爬山法找最強組合才湊得到 9999（例「蘭曇曇鰻鐮」原始 8733＋加成 → 9999）。
- 例句：宇宙強爸爸 4643（疊字、強字）、超級賽亞人 4994（強字）、努力小紅帽 3618（顏色）、紅色翹翹板 5289（疊字、同聲調、顏色）。

## 7. 全島榜把關（`topsPhraseIssue`，前後端同一份）

回傳 null＝可以；`"len"` 不是 5 個字、`"notcommon"` 有字不在常用字表、`"formula"` 開頭是 `= + - @`（試算表公式注入）、`"blocked"` 含黑名單（`TOPS_BLOCK`，含常見諧音繞法；比對前先把「媽媽」拿掉，避免「媽媽的拖鞋」被「媽的」誤擋）。
前端：可能擠進前 5 而且沒問題的才呼叫 `api.onSubmit(詞句, 戰力)`；其他詞句照樣能玩、進「我家排行」，永遠不離開裝置。後端仍要自己重算戰力、自己再跑一次 `topsPhraseIssue`。
