/**
 * Tetris Game Implementation
 * - Random initial rotations for all tetrominoes
 * - Classic LCD brick game over wipe animation on screen
 * - Scoring: 10 per line, 1000 per level, -50ms per level
 */

class TetrisGame {
  constructor(consoleApi) {
    this.console = consoleApi;

    this.cols = 10;
    this.rows = 20;
    this.board = Array.from({ length: this.rows }, () => Array(this.cols).fill(0));

    this.shapes = {
      'I': [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
      ],
      'J': [
        [1, 0, 0],
        [1, 1, 1],
        [0, 0, 0]
      ],
      'L': [
        [0, 0, 1],
        [1, 1, 1],
        [0, 0, 0]
      ],
      'O': [
        [1, 1],
        [1, 1]
      ],
      'S': [
        [0, 1, 1],
        [1, 1, 0],
        [0, 0, 0]
      ],
      'T': [
        [0, 1, 0],
        [1, 1, 1],
        [0, 0, 0]
      ],
      'Z': [
        [1, 1, 0],
        [0, 1, 1],
        [0, 0, 0]
      ]
    };

    this.score = 0;
    this.hiScore = parseInt(localStorage.getItem('brick_hi_tetris') || '0', 10);
    this.lines = 0;
    this.level = 1;
    this.isPaused = false;
    this.isGameOver = false;
    this.timer = null;
    this.dropInterval = 1000;

    this.currentPiece = null;
    this.nextPiece = null;

    // Controls Binding
    this.console.on('LEFT', () => this.moveLeft());
    this.console.on('RIGHT', () => this.moveRight());
    this.console.on('DOWN', () => this.moveBottom());
    this.console.on('ROTATE', () => this.rotate());
    this.console.on('PAUSE', () => this.togglePause());

    this.initNextPiece();
  }

  // மேட்ரிக்ஸை 90 டிகிரி சுழற்றும் பொதுவான முறை
  rotateMatrix(matrix) {
    return matrix[0].map((_, i) => matrix.map(row => row[i]).reverse());
  }

  // புதிய வடிவத்தைத் தேர்ந்தெடுத்து, அதை ரேண்டமாக 0-3 முறை சுழற்றுதல்
  getRandomPieceMatrix() {
    const keys = Object.keys(this.shapes);
    const randKey = keys[Math.floor(Math.random() * keys.length)];
    let matrix = this.shapes[randKey];

    // 0, 1, 2, அல்லது 3 முறை சுழற்சி
    const rotations = Math.floor(Math.random() * 4);
    for (let i = 0; i < rotations; i++) {
      matrix = this.rotateMatrix(matrix);
    }
    return matrix;
  }

  initNextPiece() {
    this.nextPiece = {
      matrix: this.getRandomPieceMatrix()
    };
  }

  start() {
    this.spawnPiece();
    this.console.setScore(this.score);
    this.console.setHiScore(this.hiScore);
    this.console.setLines(this.lines);
    this.console.setLevel(this.level);
    this.render();
    this.startTimer();
  }

  destroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  startTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), this.dropInterval);
  }

  togglePause() {
    if (this.isGameOver) return;
    this.isPaused = !this.isPaused;
    this.console.setPaused(this.isPaused);
    this.console.playBeep('move');
    if (this.isPaused) {
      if (this.timer) clearInterval(this.timer);
    } else {
      this.startTimer();
    }
  }

  spawnPiece() {
    this.currentPiece = {
      matrix: this.nextPiece.matrix,
      x: Math.floor((this.cols - this.nextPiece.matrix[0].length) / 2),
      y: 0
    };

    this.initNextPiece();

    // புதிய வடிவம் வரும்போதே மோதினால் Game Over
    if (this.checkCollision(this.currentPiece.matrix, this.currentPiece.x, this.currentPiece.y)) {
      this.triggerGameOver();
    }
  }

  // பிரவுசர் அலர்ட் இன்றி பிரிக் கேன்வாஸிலேயே நடக்கும் Game Over அனிமேஷன்
  triggerGameOver() {
    this.isGameOver = true;
    this.destroy();
    this.console.playBeep('gameover');
    this.saveHighScore();

    let currentRow = this.rows - 1;
    // 1. கீழிருந்து மேல் நோக்கி திரையை முழுவதுமாக நிரப்புதல்
    const fillInterval = setInterval(() => {
      if (currentRow >= 0) {
        for (let c = 0; c < this.cols; c++) {
          this.console.drawPixel(this.console.mainCtx, c, currentRow, 20, 1);
        }
        currentRow--;
      } else {
        clearInterval(fillInterval);
        // 2. பின்னர் மேலிருந்து கீழ் நோக்கி திரையை முழுவதுமாக அழித்தல்
        let clearRow = 0;
        const emptyInterval = setInterval(() => {
          if (clearRow < this.rows) {
            for (let c = 0; c < this.cols; c++) {
              this.console.drawPixel(this.console.mainCtx, c, clearRow, 20, 0);
            }
            clearRow++;
          } else {
            clearInterval(emptyInterval);
            // அனிமேஷன் முடிந்ததும் மெனு திரைக்குத் திரும்புதல்
            setTimeout(() => {
              this.console.exitToMenu();
            }, 400);
          }
        }, 30);
      }
    }, 35);
  }

  saveHighScore() {
    if (this.score > this.hiScore) {
      this.hiScore = this.score;
      localStorage.setItem('brick_hi_tetris', String(this.hiScore));
      this.console.setHiScore(this.hiScore);
    }
  }

  tick() {
    if (this.isPaused || this.isGameOver) return;
    this.moveBottom();
  }

  moveLeft() {
    if (this.isPaused || this.isGameOver || !this.currentPiece) return;
    if (!this.checkCollision(this.currentPiece.matrix, this.currentPiece.x - 1, this.currentPiece.y)) {
      this.currentPiece.x--;
      this.console.playBeep('move');
      this.render();
    }
  }

  moveRight() {
    if (this.isPaused || this.isGameOver || !this.currentPiece) return;
    if (!this.checkCollision(this.currentPiece.matrix, this.currentPiece.x + 1, this.currentPiece.y)) {
      this.currentPiece.x++;
      this.console.playBeep('move');
      this.render();
    }
  }

  moveBottom() {
    if (this.isPaused || this.isGameOver || !this.currentPiece) return;
    if (!this.checkCollision(this.currentPiece.matrix, this.currentPiece.x, this.currentPiece.y + 1)) {
      this.currentPiece.y++;
      this.render();
    } else {
      this.lockPiece();
    }
  }

  rotate() {
    if (this.isPaused || this.isGameOver || !this.currentPiece) return;
    const rotated = this.rotateMatrix(this.currentPiece.matrix);

    let kick = 0;
    if (this.checkCollision(rotated, this.currentPiece.x, this.currentPiece.y)) {
      if (!this.checkCollision(rotated, this.currentPiece.x - 1, this.currentPiece.y)) kick = -1;
      else if (!this.checkCollision(rotated, this.currentPiece.x + 1, this.currentPiece.y)) kick = 1;
      else return;
    }

    this.currentPiece.x += kick;
    this.currentPiece.matrix = rotated;
    this.console.playBeep('rotate');
    this.render();
  }

  checkCollision(matrix, offsetX, offsetY) {
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c] !== 0) {
          const newX = offsetX + c;
          const newY = offsetY + r;

          if (newX < 0 || newX >= this.cols || newY >= this.rows) return true;
          if (newY >= 0 && this.board[newY][newX] !== 0) return true;
        }
      }
    }
    return false;
  }

  lockPiece() {
    const m = this.currentPiece.matrix;
    for (let r = 0; r < m.length; r++) {
      for (let c = 0; c < m[r].length; c++) {
        if (m[r][c] !== 0) {
          const targetY = this.currentPiece.y + r;
          const targetX = this.currentPiece.x + c;
          if (targetY >= 0) {
            this.board[targetY][targetX] = 1;
          }
        }
      }
    }

    this.clearLines();
    this.spawnPiece();
    if (!this.isGameOver) {
      this.render();
    }
  }

  updateLevelAndSpeed() {
    const newLevel = Math.min(10, Math.floor(this.score / 1000) + 1);

    if (newLevel !== this.level) {
      this.level = newLevel;
      this.dropInterval = 1000 - (this.level - 1) * 50;
      this.console.setLevel(this.level);
      this.startTimer();
    }
  }

  clearLines() {
    let cleared = 0;
    for (let r = this.rows - 1; r >= 0; r--) {
      if (this.board[r].every(cell => cell === 1)) {
        this.board.splice(r, 1);
        this.board.unshift(Array(this.cols).fill(0));
        cleared++;
        r++;
      }
    }

    if (cleared > 0) {
      this.lines += cleared;
      this.score += cleared * 10;

      this.console.playBeep('clear');
      this.console.setLines(this.lines);
      this.console.setScore(this.score);

      this.saveHighScore();
      this.updateLevelAndSpeed();
    }
  }

  drawNextPiece() {
    const ctx = this.console.nextCtx;
    ctx.clearRect(0, 0, this.console.nextCanvas.width, this.console.nextCanvas.height);
    if (!this.nextPiece) return;

    const m = this.nextPiece.matrix;
    const size = 12;
    const offX = Math.floor((4 - m[0].length) / 2);
    const offY = Math.floor((4 - m.length) / 2);

    for (let r = 0; r < m.length; r++) {
      for (let c = 0; c < m[r].length; c++) {
        if (m[r][c] === 1) {
          this.console.drawPixel(ctx, offX + c, offY + r, size, 1);
        }
      }
    }
  }

  render() {
    if (this.isGameOver) return;
    this.console.clearAll();

    // போர்டில் உள்ள கட்டங்கள்
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.board[r][c] === 1) {
          this.console.drawPixel(this.console.mainCtx, c, r, 20, 1);
        }
      }
    }

    // நகரும் வடிவம்
    if (this.currentPiece) {
      const m = this.currentPiece.matrix;
      for (let r = 0; r < m.length; r++) {
        for (let c = 0; c < m[r].length; c++) {
          if (m[r][c] === 1) {
            const drawX = this.currentPiece.x + c;
            const drawY = this.currentPiece.y + r;
            if (drawY >= 0) {
              this.console.drawPixel(this.console.mainCtx, drawX, drawY, 20, 1);
            }
          }
        }
      }
    }

    this.drawNextPiece();
  }
}

// ரெஜிஸ்ட்ரி பதிவு
window.BrickGameRegistry.register({
  name: 'Tetris',
  code: 'A',
  GameClass: TetrisGame
});
