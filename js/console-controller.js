/**
 * Brick Console Core Controller & Engine
 * Features: Long-press repeat, Web Audio retro beeps, Menu & HUD
 */

window.BrickGameRegistry = {
  games: [],
  register(gameDefinition) {
    this.games.push(gameDefinition);
    if (window.consoleInstance && window.consoleInstance.isOn) {
      window.consoleInstance.renderMenu();
    }
  }
};

const LCD_LETTERS = {
  'A': [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1]
  ],
  'B': [
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 0]
  ]
};

class BrickConsole {
  constructor() {
    this.handlers = {};

    this.mainCanvas = document.getElementById('mainCanvas');
    this.nextCanvas = document.getElementById('nextCanvas');
    this.mainCtx = this.mainCanvas.getContext('2d');
    this.nextCtx = this.nextCanvas.getContext('2d');

    this.gameCodeEl = document.getElementById('gameCodeDisplay');
    this.scoreEl = document.getElementById('scoreDisplay');
    this.hiScoreEl = document.getElementById('hiScoreDisplay');
    this.linesEl = document.getElementById('linesDisplay');
    this.levelEl = document.getElementById('levelDisplay');
    this.pauseStatusEl = document.getElementById('pauseStatus');
    this.soundStatusEl = document.getElementById('soundStatus');

    // System State
    this.isOn = false;
    this.soundEnabled = true;
    this.state = 'OFF'; // 'OFF', 'MENU', 'PLAYING'
    this.selectedGameIndex = 0;
    this.activeGameInstance = null;

    // Long press repeat timers
    this.repeatDelayTimer = null;
    this.repeatIntervalTimer = null;

    // Web Audio Synthesizer
    this.audioCtx = null;

    this._bindEvents();
    this._bindFullscreen();
    this.turnOff();
  }

  // 90s Square Wave Retro Sound Generator
  initAudio() {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playBeep(type = 'move') {
    if (!this.soundEnabled || !this.isOn) return;
    try {
      this.initAudio();
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'square'; // Classic 8-bit buzzer

      const now = this.audioCtx.currentTime;

      if (type === 'move') {
        osc.frequency.setValueAtTime(300, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (type === 'rotate') {
        osc.frequency.setValueAtTime(450, now);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'clear') {
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'gameover') {
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(150, now + 0.35);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      }

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
    } catch (e) {}
  }

  on(action, callback) {
    if (!this.handlers[action]) this.handlers[action] = [];
    this.handlers[action].push(callback);
  }

  emit(action) {
    if (action === 'POWER') {
      this.togglePower();
      return;
    }

    if (!this.isOn) return;

    if (action === 'SOUND') {
      this.soundEnabled = !this.soundEnabled;
      this.setSound(this.soundEnabled);
      if (this.soundEnabled) this.playBeep('move');
      return;
    }

    if (this.state === 'MENU') {
      this.handleMenuInput(action);
      return;
    }

    if (this.state === 'PLAYING') {
      if (action === 'RESET') {
        this.exitToMenu();
        return;
      }
      if (this.handlers[action]) {
        this.handlers[action].forEach(cb => cb());
      }
    }
  }

  togglePower() {
    if (this.isOn) {
      this.turnOff();
    } else {
      this.turnOn();
    }
  }

  turnOn() {
    this.initAudio();
    this.isOn = true;
    this.state = 'MENU';
    this.selectedGameIndex = 0;
    this.setPaused(false);
    this.setSound(this.soundEnabled);
    this.playBeep('clear');
    this.renderMenu();
  }

  turnOff() {
    this.stopRepeat();
    this.isOn = false;
    this.state = 'OFF';
    if (this.activeGameInstance && typeof this.activeGameInstance.destroy === 'function') {
      this.activeGameInstance.destroy();
    }
    this.activeGameInstance = null;
    this.handlers = {};

    this.mainCtx.clearRect(0, 0, this.mainCanvas.width, this.mainCanvas.height);
    this.nextCtx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
    this.gameCodeEl.innerText = '--';
    this.scoreEl.innerText = '-----';
    this.hiScoreEl.innerText = '-----';
    this.linesEl.innerText = '--';
    this.levelEl.innerText = '--';
    this.setPaused(false);
    this.setSound(false);
  }

  handleMenuInput(action) {
    const totalGames = window.BrickGameRegistry.games.length;
    if (totalGames === 0) return;

    if (action === 'UP' || action === 'RIGHT') {
      this.selectedGameIndex = (this.selectedGameIndex + 1) % totalGames;
      this.playBeep('move');
      this.renderMenu();
    } else if (action === 'DOWN' || action === 'LEFT') {
      this.selectedGameIndex = (this.selectedGameIndex - 1 + totalGames) % totalGames;
      this.playBeep('move');
      this.renderMenu();
    } else if (action === 'PAUSE' || action === 'ROTATE') {
      this.playBeep('rotate');
      this.startGame();
    }
  }

  renderMenu() {
    this.clearAll();
    const games = window.BrickGameRegistry.games;
    if (games.length === 0) return;

    const game = games[this.selectedGameIndex];
    // கேமின் குறியீடு மற்றும் பெயர் இரண்டையும் காட்டுதல்
    this.gameCodeEl.innerText = `${game.code}: ${game.name.toUpperCase()}`;
    
    // High Score லோக்கல் ஸ்டோரேஜில் இருந்து படித்தல்
    const savedHi = localStorage.getItem(`brick_hi_${game.name.toLowerCase()}`) || 0;
    this.setHiScore(savedHi);
    this.setScore(0);
    this.setLevel(1);
    this.setLines(0);

    const letterMatrix = LCD_LETTERS[game.code] || LCD_LETTERS['A'];
    const startX = 2;
    const startY = 6;

    for (let r = 0; r < letterMatrix.length; r++) {
      for (let c = 0; c < letterMatrix[r].length; c++) {
        if (letterMatrix[r][c] === 1) {
          this.drawPixel(this.mainCtx, startX + c, startY + r, 20, 1);
        }
      }
    }
  }

  startGame() {
    const games = window.BrickGameRegistry.games;
    if (games.length === 0) return;

    this.state = 'PLAYING';
    this.clearAll();
    const gameDef = games[this.selectedGameIndex];
    
    this.activeGameInstance = new gameDef.GameClass(this);
    if (typeof this.activeGameInstance.start === 'function') {
      this.activeGameInstance.start();
    }
  }

  exitToMenu() {
    this.stopRepeat();
    if (this.activeGameInstance && typeof this.activeGameInstance.destroy === 'function') {
      this.activeGameInstance.destroy();
    }
    this.activeGameInstance = null;
    this.handlers = {};
    this.state = 'MENU';
    this.renderMenu();
  }

  drawPixel(ctx, x, y, size = 20, state = 1) {
    const pad = 1;
    const innerPad = Math.max(2, Math.floor(size * 0.2));
    const corePad = innerPad + Math.max(1, Math.floor(size * 0.1));
    const px = x * size;
    const py = y * size;

    if (state === 1) {
      ctx.fillStyle = '#1c2217';
      ctx.fillRect(px + pad, py + pad, size - pad * 2, size - pad * 2);

      ctx.fillStyle = '#9ead86';
      ctx.fillRect(px + innerPad, py + innerPad, size - innerPad * 2, size - innerPad * 2);

      ctx.fillStyle = '#1c2217';
      ctx.fillRect(px + corePad, py + corePad, size - corePad * 2, size - corePad * 2);
    } else {
      ctx.strokeStyle = 'rgba(75, 87, 63, 0.25)';
      ctx.strokeRect(px + pad + 0.5, py + pad + 0.5, size - pad * 2 - 1, size - pad * 2 - 1);
    }
  }

  setScore(val) { this.scoreEl.innerText = String(val).padStart(5, '0'); }
  setHiScore(val) { this.hiScoreEl.innerText = String(val).padStart(5, '0'); }
  setLines(val) { this.linesEl.innerText = String(val).padStart(2, '0'); }
  setLevel(val) { this.levelEl.innerText = String(val).padStart(2, '0'); }

  setPaused(isPaused) {
    if (isPaused) this.pauseStatusEl.classList.add('active');
    else this.pauseStatusEl.classList.remove('active');
  }

  setSound(isOn) {
    if (isOn) this.soundStatusEl.classList.add('active');
    else this.soundStatusEl.classList.remove('active');
  }

  clearAll() {
    this.mainCtx.clearRect(0, 0, this.mainCanvas.width, this.mainCanvas.height);
    this.nextCtx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);

    for (let r = 0; r < 20; r++) {
      for (let c = 0; c < 10; c++) {
        this.drawPixel(this.mainCtx, c, r, 20, 0);
      }
    }
  }

  _bindFullscreen() {
    const fsBtn = document.getElementById('btnFullscreen');
    if (!fsBtn) return;
    fsBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      }
    });
  }

  // Long press / Auto Repeat Logic
  startRepeat(action) {
    this.stopRepeat();
    this.emit(action);

    // ஆரம்ப தாமதம் 220ms, பின்னர் ஒவ்வொரு 75ms-க்கும் தொடர்ச்சியான இயக்கம்
    if (action === 'LEFT' || action === 'RIGHT' || action === 'DOWN') {
      this.repeatDelayTimer = setTimeout(() => {
        this.repeatIntervalTimer = setInterval(() => {
          this.emit(action);
        }, 75);
      }, 220);
    }
  }

  stopRepeat() {
    if (this.repeatDelayTimer) clearTimeout(this.repeatDelayTimer);
    if (this.repeatIntervalTimer) clearInterval(this.repeatIntervalTimer);
    this.repeatDelayTimer = null;
    this.repeatIntervalTimer = null;
  }

  _bindEvents() {
    const buttons = document.querySelectorAll('button[data-action]');
    buttons.forEach(btn => {
      const action = btn.dataset.action;

      const onStart = (e) => {
        e.preventDefault();
        this.startRepeat(action);
      };

      const onEnd = (e) => {
        e.preventDefault();
        this.stopRepeat();
      };

      btn.addEventListener('touchstart', onStart, { passive: false });
      btn.addEventListener('touchend', onEnd);
      btn.addEventListener('touchcancel', onEnd);

      btn.addEventListener('mousedown', onStart);
      btn.addEventListener('mouseup', onEnd);
      btn.addEventListener('mouseleave', onEnd);
    });

    const activeKeys = {};
    const keyMap = {
      'ArrowLeft': 'LEFT', 'a': 'LEFT',
      'ArrowRight': 'RIGHT', 'd': 'RIGHT',
      'ArrowDown': 'DOWN', 's': 'DOWN',
      'ArrowUp': 'ROTATE', 'w': 'ROTATE',
      ' ': 'ROTATE',
      'Enter': 'PAUSE', 'p': 'PAUSE',
      'r': 'RESET',
      'o': 'POWER',
      'm': 'SOUND'
    };

    window.addEventListener('keydown', (e) => {
      const action = keyMap[e.key];
      if (action && !activeKeys[e.key]) {
        e.preventDefault();
        activeKeys[e.key] = true;
        this.startRepeat(action);
      }
    });

    window.addEventListener('keyup', (e) => {
      if (keyMap[e.key]) {
        e.preventDefault();
        delete activeKeys[e.key];
        this.stopRepeat();
      }
    });
  }
}

window.consoleInstance = new BrickConsole();
