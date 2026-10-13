# 音樂音效來源與授權（audio/）

最後更新 2026-10-11。所有檔案皆可免署名使用於公開免費網站；列出來源方便日後查。

## 背景音樂（audio/bgm/）

- 8 首循環 BGM：以 **Gemini API Lyria 3.5**（`lyria-3.5`，prompt 指定 Instrumental only）生成多首候選，再由 Gemini 聽音評分＋ffmpeg 響度/接縫量測挑選，最後以 `tools/audio/loopmaker.py` 剪成無縫循環段。官方文件：https://ai.google.dev/gemini-api/docs/music-generation 。授權依 Gemini API Additional Terms（https://ai.google.dev/gemini-api/terms ）：Google 不主張生成內容所有權、使用責任在使用者，不需署名；輸出含不可聽見的 SynthID 浮水印。
  - 灰區註記（研究 2026-10-11）：該條款禁止「面向／可能被 18 歲以下使用者存取的 API Client」，指執行期呼叫 API 的應用；本專案是離線預先生成素材後放進靜態網站，不在遊戲內呼叫 API，判斷不觸發，但 Lyria 專屬商用條款查不到，信心中。
- Suno v6（Pro 方案，可商用）：island 另生 2 首候選（island_s1、island_s2，來源 https://suno.com/ ），僅進入評分比較；未被選用者不在 audio/ 內。
- party.mp3：自製合成（numpy），CC0。

  - `island.mp3` ← Gemini Lyria lyria-3.5（候選 island_1）
  - `calm.mp3` ← Gemini Lyria lyria-3.5（候選 calm_3）
  - `town.mp3` ← Gemini Lyria lyria-3.5（候選 town_3）
  - `rainbow.mp3` ← Gemini Lyria lyria-3.5（候選 rainbow_3）
  - `night.mp3` ← Gemini Lyria lyria-3.5（候選 night_1）
  - `road.mp3` ← Gemini Lyria lyria-3.5（候選 road_2）
  - `dress.mp3` ← Gemini Lyria lyria-3.5（候選 dress_3）
  - `bubble.mp3` ← Gemini Lyria lyria-3.5（候選 bubble_1）
  - `party.mp3` ← numpy 合成（tools/audio/party_pick.py synth_party）

## 音效（audio/sfx/）

- **Kenney（CC0）**：Interface Sounds、Impact Sounds、UI Audio、Digital Audio、RPG Audio、Music Jingles（後兩者備選，部分未用）。License.txt 逐包確認為 Creative Commons Zero。
  - https://kenney.nl/assets/interface-sounds
  - https://kenney.nl/assets/impact-sounds
  - https://kenney.nl/assets/ui-audio
  - https://kenney.nl/assets/digital-audio
  - https://kenney.nl/assets/rpg-audio
  - https://kenney.nl/assets/music-jingles
- **自製合成（numpy／scipy，CC0）**：答對／答錯／金幣／貼紙／鐘琴／馬林巴類提示音等（卡車、喇叭、海鷗、水花、船笛、吊橋、叮咚、泡泡、得星、新紀錄、送達已改用 Freesound CC0 真實錄音）（`tools/audio/build_sfx.py`）。
- **Freesound（僅收 CC0 1.0）**：每個檔都在該音效頁面確認授權為 Creative Commons 0 才收（見下表網址與作者）；不含 CC-BY／CC-BY-NC 檔。
  挑選方式：每個目標音效找 3～6 個 CC0 候選，與舊版做 Gemini（gemini-3.8-flash 初賽、gemini-3.1-pro-preview 複賽＋決賽）A/B 成對聽音比較（正反順序都贏才算贏），結果在 `tools/audio/candidates/sfx_pairwise.json`。
- 本資料夾沒有使用 Sonniss、ElevenLabs、ZapSplat、Pixabay 等需署名或禁止再散布的素材。

| 音效 | 來源 |
|---|---|
| boat_horn | Freesound「Staten Island Ferry Horn.mp3」by nathanvladimirovich — https://freesound.org/people/nathanvladimirovich/sounds/261846/ — CC0 |
| bridge | Freesound「Gate door drawbridge wooden creaky opens closes hinge.wav」by WavJunction.com — https://freesound.org/people/WavJunction.com/sounds/456763/ — CC0 |
| capsule_open | Kenney Impact Sounds impactPlate_light_001 + synth pop/sparkle |
| coin | synth (numpy square blips) |
| deliver_ok | Freesound「Congrats」by Fupicat — https://freesound.org/people/Fupicat/sounds/607207/ — CC0 |
| ding | Freesound「DoorBell Shortened」by jwheeler91 — https://freesound.org/people/jwheeler91/sounds/442280/ — CC0 |
| door | Kenney RPG Audio doorClose_3 (lowpassed) |
| flip | Kenney RPG Audio bookFlip2 |
| gacha_crank | Kenney RPG Audio metalClick x9 + Impact Sounds impactWood_medium_001 |
| hatch | Kenney Impact Sounds impactGlass_light_001/003 + synth peeps |
| horn | Freesound「Squeaky Toy #1」by Breviceps — https://freesound.org/people/Breviceps/sounds/468443/ — CC0 |
| lever | Kenney RPG Audio metalLatch + Impact Sounds impactMetal_heavy_002/impactWood_light_001 |
| load | Kenney RPG Audio dropLeather + Impact Sounds impactWood_heavy_001 |
| ng | synth (numpy soft marimba, falling) |
| ok | synth (numpy marimba/bell) |
| pop | Freesound「Pop (made by DuffyBro)」by DuffyBro — https://freesound.org/people/DuffyBro/sounds/319107/ — CC0 |
| seagull | Freesound「sea gulls.wav」by Snapper4298 — https://freesound.org/people/Snapper4298/sounds/166703/ — CC0 |
| select | Kenney Interface Sounds select_002 + synth marimba |
| splash | Freesound「Tiny Splash」by dslrguide — https://freesound.org/people/dslrguide/sounds/321490/ — CC0 |
| star | Freesound「Signal-Ring 1」by Vendarro — https://freesound.org/people/Vendarro/sounds/399315/ — CC0 |
| sticker | synth (numpy bell sparkle) |
| tap | Kenney Interface Sounds click_003 |
| truck_drive | Freesound「Motor Loop.wav」by soundjoao — https://freesound.org/people/soundjoao/sounds/325808/ — CC0 |
| truck_start | Freesound「Car Start」by snakebarney — https://freesound.org/people/snakebarney/sounds/138099/ — CC0 |
| truck_stop | Freesound「Air Brake Applied」by chungus43A — https://freesound.org/people/chungus43A/sounds/705390/ — CC0 |
| unload | Kenney RPG Audio handleSmallLeather + Impact Sounds impactWood_medium_003 |
| unlock | Kenney RPG Audio metalLatch + synth bells |
| wear | Kenney RPG Audio cloth2 + synth bells |
| whoosh | synth (numpy swept noise) |
| win | Freesound「WinFantasia.wav」by Fupicat — https://freesound.org/people/Fupicat/sounds/521645/ — CC0 |

## v7 新增音效（陀螺競技＋寵物進化，2026-10-13，全部 CC0）

| 音效 | 來源 |
|---|---|
| tp_fuse | Freesound「Slide lock 1.wav」 — https://freesound.org/people/ingudios/sounds/119494/ — CC0 |
| tp_launch | synth 拉繩＋加速嗡聲 + Kenney impactMetal_light_002 — （無外部連結） — CC0 |
| tp_clash1 | Kenney impactMetal_light_001 — （無外部連結） — CC0 |
| tp_clash2 | Kenney impactMetal_medium_002 + Freesound「Sword Clash.wav」 — https://freesound.org/people/Bird_man/sounds/275159/ — CC0 |
| tp_clash3 | Freesound「Metal Hit Cartoon」 — https://freesound.org/people/Johnnyfarmer/sounds/209771/ — CC0 |
| tp_ko | Freesound「Anvil Hit 2」+「Metal Boom」+ 合成閃光 — https://freesound.org/people/michorvath/sounds/270588/ ; https://freesound.org/people/Johnnyfarmer/sounds/209772/ — CC0 |
| tp_count | synth 乾淨電子嗶 — （無外部連結） — CC0 |
| tp_round | Kenney impactBell_heavy_001 + Freesound「bell ding 1.wav」 — https://freesound.org/people/5ro4/sounds/611113/ — CC0 |
| tp_cheer | Freesound「Short Crowd Cheer.flac」 — https://freesound.org/people/qubodup/sounds/182571/ — CC0 |
| tp_victory | Freesound「Game Success Fanfare」 — https://freesound.org/people/el_boss/sounds/677859/ — CC0 |
| ev_charge | Freesound「Power_Up」 — https://freesound.org/people/gulfstreamav/sounds/843330/ — CC0 |
| ev_burst | Freesound「Fire Burst Flash」+「magic burst」+ Kenney impactBell_heavy_000 + 合成閃光 — https://freesound.org/people/Za-Games/sounds/539972/ ; https://freesound.org/people/DAN2008/sounds/214455/ — CC0 |
| ev_sparkle | Freesound「Sparkling Star 01.wav」 — https://freesound.org/people/LilMati/sounds/462095/ — CC0 |

## v7 新增背景音樂（10-13）

| 鍵 | 來源與授權 |
|---|---|
| battle | Suno 生成（Pro 方案，instrumental）— 注音戰鬥陀螺對戰；50 秒無縫循環（tools/audio/v7_music2.py）。付費方案生成歌曲的權利歸使用者，不需標示 |
| evolve | Suno 生成（Pro 方案，instrumental）— 寵物進化演出；取原曲高潮，前 8 秒用時變低通＋漸強＋riser 自做蓄力（tools/audio/v7_evolve_build.py）。同上 |
