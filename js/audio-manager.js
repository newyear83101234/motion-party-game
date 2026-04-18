/**
 * audio-manager.js — 音效管理器
 * 負責 BGM 播放與 SFX 合成（Web Audio API）
 * 基於 MANUS Task #3 音效設計方案
 */

class AudioManager {
  constructor() {
    /** @type {AudioContext|null} */
    this._ctx = null;
    this._masterGain = null;
    this._sfxGain = null;
    this._bgmGain = null;
    this._muted = false;
    // _volume 預設 3.0，上限 5.0（對齊 CLAUDE.md 5.3 節五層音量強化策略第三層）
    this._volume = 3.0;

    // BGM 相關
    /** @type {AudioBufferSourceNode|null} */
    this._bgmSource = null;
    this._bgmBuffers = {};       // { menu, gameplay, results }
    this._currentBGM = null;     // 目前播放的 BGM 名稱
    this._bgmPlaybackRate = 1.0;

    // SFX 檔案緩衝
    this._sfxBuffers = {};

    // SFX 節流（150ms 內同 ID 最多 5 次；全域 16 source，BGM 不計）
    this._sfxThrottleMap = new Map();  // id -> [timestamps in ms]
    this._activeSfxCount = 0;           // 全域 SFX source 計數

    // 防止重複初始化
    this._initialized = false;
  }

  // ══════════════════════════════════════════
  // ── 初始化 ──
  // ══════════════════════════════════════════

  /**
   * 初始化 AudioContext（需在用戶互動後呼叫）
   * @param {string} basePath - BGM 檔案資料夾路徑
   */
  async init(basePath = "MUSIC") {
    if (this._initialized) return;

    this._ctx = new (window.AudioContext || window.webkitAudioContext)();

    // WaveShaperNode（soft clip，防破音）
    this._waveShaper = this._ctx.createWaveShaper();
    const samples = 8192;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(x * 2.0);
    }
    this._waveShaper.curve = curve;
    this._waveShaper.oversample = "4x";

    // 輸出增益（tanh 會把信號壓到 ±1.0，這裡補回音量）
    this._outputGain = this._ctx.createGain();
    this._outputGain.gain.value = 3.0;
    this._outputGain.connect(this._ctx.destination);

    this._waveShaper.connect(this._outputGain);

    // 壓縮器 → waveShaper → destination
    this._compressor = this._ctx.createDynamicsCompressor();
    this._compressor.threshold.value = -50;
    this._compressor.ratio.value = 20;
    this._compressor.knee.value = 0;
    this._compressor.attack.value = 0;
    this._compressor.release.value = 0.05;
    this._compressor.connect(this._waveShaper);

    // 主音量 → 壓縮器
    this._masterGain = this._ctx.createGain();
    this._masterGain.gain.value = this._volume;
    this._masterGain.connect(this._compressor);

    // SFX: osc(0.95) → sfxGain(4.0) → masterGain(4.0) → compressor → waveShaper → dest
    this._sfxGain = this._ctx.createGain();
    this._sfxGain.gain.value = 4.0;
    this._sfxGain.connect(this._masterGain);

    // BGM: source → bgmBoost(5.0) → bgmGain(4.0) → masterGain(4.0) → compressor → waveShaper → dest
    this._bgmGain = this._ctx.createGain();
    this._bgmGain.gain.value = 4.0;
    this._bgmGain.connect(this._masterGain);

    this._bgmBoost = this._ctx.createGain();
    this._bgmBoost.gain.value = 5.0;
    this._bgmBoost.connect(this._bgmGain);

    // 預載 BGM 檔案
    // TASK9 第七輪新增的 BGM（bgm_menu.mp3 100 BPM 溫馨、bgm_gameplay.mp3 128 BPM 活潑），
    // 原先 bgm_01/bgm_02 已被取代（仍保留在 MUSIC/ 當備援）
    const bgmFiles = {
      menu:     `${basePath}/bgm_menu.mp3`,
      gameplay: `${basePath}/bgm_gameplay.mp3`,
      results:  `${basePath}/bgm_03_results.mp3`,
    };

    const loadPromises = Object.entries(bgmFiles).map(async ([key, url]) => {
      try {
        console.log(`[AudioManager] BGM 載入中: ${key} → ${url}`);
        const response = await fetch(url);
        if (!response.ok) {
          console.error(`[AudioManager] BGM fetch 失敗: ${key}, HTTP ${response.status} ${response.statusText}, URL: ${url}`);
          return;
        }
        const arrayBuffer = await response.arrayBuffer();
        console.log(`[AudioManager] BGM 解碼中: ${key} (${(arrayBuffer.byteLength / 1024).toFixed(0)} KB)`);
        this._bgmBuffers[key] = await this._ctx.decodeAudioData(arrayBuffer);
        console.log(`[AudioManager] BGM 載入完成: ${key} ✅`);
      } catch (e) {
        console.error(`[AudioManager] BGM 載入失敗: ${key}, URL: ${url}`, e);
      }
    });

    await Promise.all(loadPromises);

    // 預載 SFX 音效檔案
    const sfxFiles = {
      // ── 直升機競賽音效 ──
      sfx_heli_boost:   `${basePath}/sfx_heli_boost.mp3`,
      sfx_heli_whoosh:  `${basePath}/sfx_heli_whoosh.mp3`,
      sfx_heli_win:     `${basePath}/sfx_heli_win.mp3`,
      sfx_countdown:    `${basePath}/sfx_countdown.mp3`,
      sfx_time_warning: `${basePath}/sfx_time_warning.mp3`,

      // ── 姿勢模仿：姿勢語音提示 ──
      pose_01_wansui:       `${basePath}/pose_01_wansui.wav`,
      pose_02_airplane:     `${basePath}/pose_02_airplane.wav`,
      pose_03_bigv:         `${basePath}/pose_03_bigv.wav`,
      pose_04_handsonhips:  `${basePath}/pose_04_handsonhips.wav`,
      pose_05_zombie:       `${basePath}/pose_05_zombie.wav`,
      pose_06_starfish:     `${basePath}/pose_06_starfish.wav`,
      pose_07_weightlift:   `${basePath}/pose_07_weightlift.wav`,
      pose_08_superman:     `${basePath}/pose_08_superman.wav`,
      pose_09_scarecrow:    `${basePath}/pose_09_scarecrow.wav`,
      pose_10_sumo:         `${basePath}/pose_10_sumo.wav`,
      pose_11_gorilla:      `${basePath}/pose_11_gorilla.wav`,
      pose_12_surrender:    `${basePath}/pose_12_surrender.wav`,

      // ── 姿勢模仿：系統音效 ──
      sys_calibrate:  `${basePath}/sys_01_calibrate.wav`,
      sys_ready:      `${basePath}/sys_02_ready.wav`,
      sys_count3:     `${basePath}/sys_03_count3.wav`,
      sys_count2:     `${basePath}/sys_04_count2.wav`,
      sys_count1:     `${basePath}/sys_05_count1.wav`,
      sys_go:         `${basePath}/sys_06_go.wav`,
      sys_perfect:    `${basePath}/sys_07_perfect.wav`,
      sys_great:      `${basePath}/sys_08_great.wav`,
      sys_good:       `${basePath}/sys_09_good.wav`,
      sys_tryagain:   `${basePath}/sys_10_tryagain.wav`,
      sys_winner:     `${basePath}/sys_11_winner.wav`,
      sys_gameover:   `${basePath}/sys_12_gameover.wav`,
    };
    const sfxLoadPromises = Object.entries(sfxFiles).map(async ([key, url]) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const arrayBuffer = await response.arrayBuffer();
        this._sfxBuffers[key] = await this._ctx.decodeAudioData(arrayBuffer);
        console.log(`[AudioManager] SFX 載入完成: ${key}`);
      } catch (e) {
        console.warn(`[AudioManager] SFX 載入失敗: ${key}`, e);
      }
    });
    await Promise.all(sfxLoadPromises);

    this._initialized = true;
    console.log("[AudioManager] 初始化完成");
  }

  /**
   * 確保 AudioContext 處於運行狀態（iOS/Chrome 自動暫停政策）
   */
  resume() {
    if (this._ctx && this._ctx.state === "suspended") {
      this._ctx.resume();
    }
  }

  // ══════════════════════════════════════════
  // ── BGM 控制 ──
  // ══════════════════════════════════════════

  /**
   * 播放背景音樂
   * @param {"menu"|"gameplay"|"results"} name
   * @param {boolean} loop - 是否循環
   */
  playBGM(name, loop = true) {
    if (!this._ctx) {
      console.error(`[AudioManager] playBGM("${name}") 失敗：AudioContext 未初始化`);
      return;
    }
    if (!this._bgmBuffers[name]) {
      console.error(`[AudioManager] playBGM("${name}") 失敗：BGM 尚未載入。已載入的: ${Object.keys(this._bgmBuffers).join(", ")}`);
      return;
    }
    this.resume();

    // 如果同一首已在播放，不重複
    if (this._currentBGM === name && this._bgmSource) {
      console.log(`[AudioManager] BGM "${name}" 已在播放中，跳過`);
      return;
    }

    this.stopBGM();

    const source = this._ctx.createBufferSource();
    source.buffer = this._bgmBuffers[name];
    source.loop = loop;
    source.playbackRate.value = this._bgmPlaybackRate;
    source.connect(this._bgmBoost);  // bgmBoost(5.0) → bgmGain(4.0) → masterGain → compressor → waveShaper → dest
    source.start(0);
    console.log(`[AudioManager] BGM 開始播放: "${name}", loop=${loop}, state=${this._ctx.state}`);

    this._bgmSource = source;
    this._currentBGM = name;

    source.onended = () => {
      if (this._currentBGM === name) {
        this._bgmSource = null;
        this._currentBGM = null;
      }
    };
  }

  /** 停止背景音樂（fadeTime=0 即時停止，>0 淡出） */
  stopBGM(fadeTime = 0.3) {
    if (!this._bgmSource || !this._ctx) return;
    const source = this._bgmSource;
    this._bgmSource = null;
    this._currentBGM = null;

    if (fadeTime <= 0) {
      // 即時停止，不做 fade — 避免 gain ramp 影響後續播放
      try { source.stop(); } catch (_) {}
      // 確保 bgmGain ���復正常值
      this._bgmGain.gain.cancelScheduledValues(this._ctx.currentTime);
      this._bgmGain.gain.setValueAtTime(this.getBGMVolume(), this._ctx.currentTime);
      return;
    }

    const now = this._ctx.currentTime;
    // 淡出效果
    this._bgmGain.gain.setValueAtTime(this._bgmGain.gain.value, now);
    this._bgmGain.gain.linearRampToValueAtTime(0, now + fadeTime);

    setTimeout(() => {
      try { source.stop(); } catch (_) {}
      // 恢復 BGM 音量
      this._bgmGain.gain.cancelScheduledValues(this._ctx.currentTime);
      this._bgmGain.gain.setValueAtTime(this.getBGMVolume(), this._ctx.currentTime);
    }, fadeTime * 1000 + 50);
  }

  /**
   * 設定 BGM 播放速率（遊戲中難度加速用）
   * @param {number} rate - 播放速率（1.0 = 正常）
   */
  setBGMPlaybackRate(rate) {
    this._bgmPlaybackRate = rate;
    if (this._bgmSource) {
      this._bgmSource.playbackRate.setValueAtTime(rate, this._ctx.currentTime);
    }
  }

  // ══════════════════════════════════════════
  // ── SFX（Web Audio API 合成）──
  // ══════════════════════════════════════════

  /**
   * 播放指定音效
   * @param {string} id - 音效 ID
   */
  play(id) {
    if (!this._ctx || this._muted) return;

    // 節流：同 ID 150ms 內最多 5 次；全域 active source 超過 16 則 drop
    const nowMs = this._ctx.currentTime * 1000;
    const timestamps = this._sfxThrottleMap.get(id) || [];
    const recent = timestamps.filter(t => nowMs - t < 150);
    if (recent.length >= 5) return;
    if (this._activeSfxCount >= 16) return;
    recent.push(nowMs);
    this._sfxThrottleMap.set(id, recent);

    this.resume();

    switch (id) {
      // ── 選單 / UI ──
      case "menu_click":     this._sfxMenuClick(); break;
      case "btn_hover":      this._sfxBtnHover(); break;
      case "btn_click":      this._sfxBtnClick(); break;

      // ── 倒數 ──
      case "countdown_3":    this._sfxCountdown(600); break;
      case "countdown_2":    this._sfxCountdown(800); break;
      case "countdown_1":    this._sfxCountdown(1000); break;
      case "countdown_go":   this._sfxCountdownGo(); break;

      // ── 遊戲中 SFX ──
      case "ice_appear":     this._sfxIceAppear(); break;
      case "ice_hit":        this._sfxIceHit(); break;
      case "bomb_hit":       this._sfxBombHit(); break;
      case "miss":           this._sfxMiss(); break;
      case "score":          this._sfxScore(); break;

      // ── Combo ──
      case "combo_3":        this._sfxCombo(1200, 1500, 0.8); break;
      case "combo_5":        this._sfxCombo(1500, 1800, 0.85); break;
      case "combo_10":       this._sfxComboMax(); break;

      // ── 時間 ──
      case "time_warning":   this._sfxTimeWarning(); break;
      case "time_up":        this._sfxTimeUp(); break;

      // ── 結算 ──
      case "score_roll":     this._sfxScoreRoll(); break;
      case "star_appear":    this._sfxStarAppear(); break;
      case "confetti":       this._sfxConfetti(); break;

      default:
        console.warn(`[AudioManager] 未知音效: ${id}`);
    }
  }

  /**
   * 從預載入的音效檔案播放 SFX
   * @param {string} name - 音效名稱（如 "sfx_heli_boost"）
   */
  playSFXFromFile(name) {
    if (!this._ctx || this._muted || !this._sfxBuffers[name]) return;

    // 節流（同上）
    const nowMs = this._ctx.currentTime * 1000;
    const timestamps = this._sfxThrottleMap.get(name) || [];
    const recent = timestamps.filter(t => nowMs - t < 150);
    if (recent.length >= 5) return;
    if (this._activeSfxCount >= 16) return;
    recent.push(nowMs);
    this._sfxThrottleMap.set(name, recent);

    this.resume();
    const source = this._ctx.createBufferSource();
    source.buffer = this._sfxBuffers[name];
    source.connect(this._sfxGain);
    this._activeSfxCount++;
    source.onended = () => { this._activeSfxCount = Math.max(0, this._activeSfxCount - 1); };
    source.start();
  }

  // ── 選單 / UI 音效 ──

  /** SFX-01: 選單點擊 — 800→1200Hz 上升正弦波 */
  _sfxMenuClick() {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.linearRampToValueAtTime(1200, now + 0.15);

    gain.gain.setValueAtTime(0.95, now);
    gain.gain.setValueAtTime(0.95, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  /** UI-01: 按鈕 Hover — 輕微 1200Hz 嗶聲 */
  _sfxBtnHover() {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = 1200;

    gain.gain.setValueAtTime(0.95, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  /** UI-02: 按鈕點擊確認 — 雙音上升 */
  _sfxBtnClick() {
    const ctx = this._ctx;
    const now = ctx.currentTime;

    [1000, 1500].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.linearRampToValueAtTime(freq * 1.2, now + 0.15);
      gain.gain.setValueAtTime(0.95, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(this._sfxGain);
      osc.start(now);
      osc.stop(now + 0.2);
    });
  }

  // ── 倒數音效 ──

  /** SFX-02a/b/c: 倒數 3, 2, 1 */
  _sfxCountdown(freq) {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0.95, now);
    gain.gain.setValueAtTime(0.95, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  /** SFX-02d: GO! — 雙音 + 白噪音 */
  _sfxCountdownGo() {
    const ctx = this._ctx;
    const now = ctx.currentTime;

    // 雙正弦波
    [1200, 600].forEach(freq => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.95, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(this._sfxGain);
      osc.start(now);
      osc.stop(now + 0.33);
    });

    // 白噪音
    this._playNoise(0.08, 0.3);
  }

  // ── 遊戲中 SFX ──

  /** SFX-03: 冰塊出現 — 2000→1500Hz 下降 + 白噪音 */
  _sfxIceAppear() {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(2000, now);
    osc.frequency.linearRampToValueAtTime(1500, now + 0.35);

    gain.gain.setValueAtTime(0.95, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(now);
    osc.stop(now + 0.4);

    this._playNoise(0.07, 0.3);
  }

  /** SFX-04: 冰塊擊碎 — 白噪音 + 多頻混合 */
  _sfxIceHit() {
    const ctx = this._ctx;
    const now = ctx.currentTime;

    // 多頻正弦波（冰碎裂感）
    [2000, 2500, 3000].forEach(freq => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.95, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(this._sfxGain);
      osc.start(now);
      osc.stop(now + 0.25);
    });

    // 白噪音（碎裂質感）
    this._playNoiseBandpass(0.5, 0.2, 3000, 1.5);
  }

  /** SFX-05: 炸彈冰塊擊碎 — 低頻 Kick + 高頻噪音 */
  _sfxBombHit() {
    const ctx = this._ctx;
    const now = ctx.currentTime;

    // 低頻 kick（爆炸感）
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(250, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.3);
    gain.gain.setValueAtTime(0.95, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(now);
    osc.stop(now + 0.35);

    // 高頻噪音
    this._playNoiseBandpass(0.6, 0.25, 2500, 2);
  }

  /** SFX-06: 未命中 — 600→400Hz 下降 */
  _sfxMiss() {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.linearRampToValueAtTime(400, now + 0.25);

    gain.gain.setValueAtTime(0.95, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(now);
    osc.stop(now + 0.3);

    this._playNoise(0.06, 0.2);
  }

  /** SFX-08: 得分 — 1000Hz 短促正弦波 */
  _sfxScore() {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = 1000;

    gain.gain.setValueAtTime(0.95, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  // ── Combo 音效 ──

  /** SFX-07a/b: Combo ×3, ×5 — 雙音 */
  _sfxCombo(f1, f2, vol) {
    const ctx = this._ctx;
    const now = ctx.currentTime;

    [f1, f2].forEach(freq => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(this._sfxGain);
      osc.start(now);
      osc.stop(now + 0.25);
    });
  }

  /** SFX-07c: Combo ×10 — 雙音 + 白噪音（華麗感） */
  _sfxComboMax() {
    const ctx = this._ctx;
    const now = ctx.currentTime;

    [1800, 2200].forEach(freq => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.95, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(this._sfxGain);
      osc.start(now);
      osc.stop(now + 0.3);
    });

    this._playNoise(0.08, 0.25);
  }

  // ── 時間音效 ──

  /** SFX-09: 時間警告 — 1600Hz 脈動嗶聲 */
  _sfxTimeWarning() {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = 1600;

    gain.gain.setValueAtTime(0.95, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(now);
    osc.stop(now + 0.12);

    // 白噪音增強緊迫感
    this._playNoise(0.08, 0.08);
  }

  /** SFX-10: 時間到 — 2000→2500Hz 上升 */
  _sfxTimeUp() {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(2000, now);
    osc.frequency.linearRampToValueAtTime(2500, now + 0.4);

    gain.gain.setValueAtTime(0.95, now);
    gain.gain.setValueAtTime(0.95, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  // ── 結算音效 ──

  /** SFX-11: 結算分數滾動 — 800~1200Hz 隨機短促音 */
  _sfxScoreRoll() {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const freq = 800 + Math.random() * 400;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0.95, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  /** SFX-12: 星級評價出現 — 2000→3000Hz 上升 + 白噪音 */
  _sfxStarAppear() {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(2000, now);
    osc.frequency.linearRampToValueAtTime(3000, now + 0.35);

    gain.gain.setValueAtTime(0.95, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(now);
    osc.stop(now + 0.4);

    this._playNoise(0.1, 0.3);
  }

  /** SFX-13: 五彩紙片飄落 — 白噪音底層 + 偶發叮聲 */
  _sfxConfetti() {
    const ctx = this._ctx;
    const now = ctx.currentTime;

    // 白噪音底層
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.linearRampToValueAtTime(0.001, now + 2.5);
    noise.connect(noiseGain);
    noiseGain.connect(this._sfxGain);
    noise.start(now);
    noise.stop(now + 2.5);

    // 偶發叮聲（每 0.4s 一個）
    for (let t = 0; t < 2; t += 0.4) {
      const freq = 2000 + Math.random() * 1000;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.95, now + t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.15);
      osc.connect(gain);
      gain.connect(this._sfxGain);
      osc.start(now + t);
      osc.stop(now + t + 0.2);
    }
  }

  // ══════════════════════════════════════════
  // ── 噪音工具 ──
  // ══════════════════════════════════════════

  /** 播放白噪音 */
  _playNoise(volume, duration) {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const bufferSize = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(gain);
    gain.connect(this._sfxGain);
    source.start(now);
    source.stop(now + duration + 0.01);
  }

  /** 播放帶帶通濾波器的噪音 */
  _playNoiseBandpass(volume, duration, freq, Q) {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const bufferSize = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = Q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this._sfxGain);
    source.start(now);
    source.stop(now + duration + 0.01);
  }

  // ══════════════════════════════════════════
  // ── 音量控制 ──
  // ══════════════════════════════════════════

  /**
   * 設定 BGM 音量
   * @param {number} level - 0-5.0（對齊 main.js 的 MAX_VOLUME=5）
   *   歷史踩坑：原本 Math.min(1, ...) 會把 _bgmGain 的 4.0 基準鎖死到 1.0，
   *   導致音量五層強化策略第三層（masterGain 上限 5.0）形同虛設，玩家反映「音量還是小」
   */
  setBGMVolume(level) {
    const val = Math.max(0, Math.min(5.0, level));
    if (this._bgmGain) {
      this._bgmGain.gain.setValueAtTime(val, this._ctx.currentTime);
    }
  }

  /** 取得 BGM 音量 */
  getBGMVolume() {
    return this._bgmGain ? this._bgmGain.gain.value : 4.0;
  }

  /**
   * 設定 SFX 音量
   * @param {number} level - 0-5.0（對齊 main.js 的 MAX_VOLUME=5）
   */
  setSFXVolume(level) {
    const val = Math.max(0, Math.min(5.0, level));
    if (this._sfxGain) {
      this._sfxGain.gain.setValueAtTime(val, this._ctx.currentTime);
    }
  }

  /** 取得 SFX 音量 */
  getSFXVolume() {
    return this._sfxGain ? this._sfxGain.gain.value : 4.0;
  }

  /**
   * 設定主音量
   * @param {number} level - 0-5.0（預設 3.0，上限 5.0）
   */
  setVolume(level) {
    this._volume = Math.max(0, Math.min(5.0, level));
    if (this._masterGain) {
      this._masterGain.gain.setValueAtTime(this._volume, this._ctx.currentTime);
    }
  }

  getVolume() {
    return this._volume;
  }

  mute() {
    this._muted = true;
    if (this._masterGain) {
      this._masterGain.gain.setValueAtTime(0, this._ctx.currentTime);
    }
  }

  unmute() {
    this._muted = false;
    if (this._masterGain) {
      this._masterGain.gain.setValueAtTime(this._volume, this._ctx.currentTime);
    }
  }

  isMuted() {
    return this._muted;
  }
}

// 單例匯出
const audioManager = new AudioManager();
export default audioManager;
