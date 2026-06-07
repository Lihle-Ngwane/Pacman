

class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  init(data) {
    this.mode          = (data && data.mode) || 'normal';
    this.player        = null; this.player2 = null;
    this.ghosts        = [];
    this.dotsGrid      = []; this.pelletsGrid = [];
    this.specialGrid   = [];  // power-up tile sprites
    this.mazeData      = null;
    this._mazeGfx      = null;

    this.score         = 0; this.score2 = 0;
    this.lives         = 3; this.lives2 = 3;
    this.level         = 1;
    this.dotsLeft      = 0; this.dotsEaten = 0;

    this.p1eliminated  = false; this.p2eliminated = false;

    this.currentMode   = 'scatter';
    this.modeIdx       = 0;
    this.modeTimer     = MODE_SCHEDULE[0].dur;

    this.frightenedActive = false; this.ghostsEaten = 0;
    this.freezeActive     = false;
    this.revealActive     = false; this.revealTimer = 0;

    this.fruit = null; this.fruitType = null; this.fruitTimer = 0;
    this._fruitShown = [];
    this._frozen      = false;
    this._extraGiven  = false; this._extra2Given = false;

    this.tracker  = new PlayerTracker();
    this.tracker2 = new PlayerTracker();

    this.audio = null;
    this._revealGraphics = null;
  }

  create() {
    // Reuse existing AudioManager if one already exists so audio
    // nodes survive the GameScene → GameOverScene transition
    if (!window._pacmanAudio) window._pacmanAudio = new AudioManager();
    this.audio = window._pacmanAudio;
    this.audio.resume();
    this.mazeData = new MazeGenerator().generate();
    this.dotsLeft = countDots(this.mazeData);
    this._totalDots  = this.dotsLeft;
    this._fruitShown = [];

    this._buildMaze();
    this._spawnPlayer();
    this._spawnGhosts();

    this._keys = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.UP,
      down:  Phaser.Input.Keyboard.KeyCodes.DOWN,
      left:  Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      w:     Phaser.Input.Keyboard.KeyCodes.W,
      s:     Phaser.Input.Keyboard.KeyCodes.S,
      a:     Phaser.Input.Keyboard.KeyCodes.A,
      d:     Phaser.Input.Keyboard.KeyCodes.D,
    });

    this._revealGraphics = this.add.graphics().setDepth(15);

    this.scene.launch('UIScene', { mode: this.mode });
    this.scene.bringToTop('UIScene');

    this._emit('score', this.score);
    this._emit('lives', this.lives);
    this._emit('level', this.level);
    if (this.mode === 'multiplayer') {
      this._emit('score2', this.score2);
      this._emit('lives2', this.lives2);
    }

    this.currentMode = 'scatter'; this.modeIdx = 0;
    this.modeTimer   = MODE_SCHEDULE[0].dur;
    this._frozen     = true;
    this.audio.start();
    this.audio.startMusic();
    this.time.delayedCall(2200, () => {
      this._frozen = false;
      this.audio.startSiren(false);
      this._checkGhostRelease();
    });
  }

  // ---- UPDATE ----

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    if (this._frozen) return;

    this._handleInput();

    this.player.update(dt);
    if (this.mode === 'multiplayer' && this.player2 && !this.p2eliminated)
      this.player2.update(dt);

    const players = this._getPlayers();
    this.ghosts.forEach(g => g.update(dt, players, this.ghosts, this.tracker));

    // Tracker ticks
    this.tracker.tick(dt, this.player, this.ghosts);
    if (this.mode === 'multiplayer' && this.player2)
      this.tracker2.tick(dt, this.player2, this.ghosts);

    this._checkGhostCollision();
    this._tickMode(dt);
    this._tickFruit(dt);
    this._tickReveal(dt);
  }

  _getPlayers() {
    if (this.mode !== 'multiplayer') return [this.player];
    const arr = [this.player];
    if (this.player2 && !this.p2eliminated) arr.push(this.player2);
    return arr;
  }

  // ---- INPUT ----

  _handleInput() {
    const k = this._keys;
    if (this.mode === 'multiplayer') {
      if (!this.p1eliminated) {
        if      (k.a.isDown) this.player.requestDir(-1, 0);
        else if (k.d.isDown) this.player.requestDir( 1, 0);
        else if (k.w.isDown) this.player.requestDir( 0,-1);
        else if (k.s.isDown) this.player.requestDir( 0, 1);
      }
      if (this.player2 && !this.p2eliminated) {
        if      (k.left.isDown)  this.player2.requestDir(-1, 0);
        else if (k.right.isDown) this.player2.requestDir( 1, 0);
        else if (k.up.isDown)    this.player2.requestDir( 0,-1);
        else if (k.down.isDown)  this.player2.requestDir( 0, 1);
      }
    } else {
      if      (k.left.isDown  || k.a.isDown) this.player.requestDir(-1, 0);
      else if (k.right.isDown || k.d.isDown) this.player.requestDir( 1, 0);
      else if (k.up.isDown    || k.w.isDown) this.player.requestDir( 0,-1);
      else if (k.down.isDown  || k.s.isDown) this.player.requestDir( 0, 1);
    }
  }

  // ---- MAZE RENDERING ----

  _buildMaze() {
    if (this._mazeGfx) { this._mazeGfx.destroy(); }
    this._mazeGfx = this.add.graphics().setDepth(0);
    const gfx = this._mazeGfx;

    gfx.fillStyle(0x000000);
    gfx.fillRect(0, UI_H, GAME_W, GAME_H);
    gfx.fillStyle(0x1919a6);
    gfx.lineStyle(1, 0x3333ff, 1);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = this.mazeData[r][c];
        const px = c*TILE, py = r*TILE+UI_H;
        if (t === T_WALL) {
          gfx.fillRect(px+1, py+1, TILE-2, TILE-2);
          gfx.strokeRect(px, py, TILE, TILE);
        }
        if (t === T_DOOR) {
          gfx.lineStyle(3, 0xffb8ff, 1);
          gfx.lineBetween(px, py+TILE/2, px+TILE, py+TILE/2);
          gfx.lineStyle(1, 0x3333ff, 1);
        }
      }
    }

    this.dotsGrid    = Array.from({length:ROWS}, () => Array(COLS).fill(null));
    this.pelletsGrid = Array.from({length:ROWS}, () => Array(COLS).fill(null));
    this.specialGrid = Array.from({length:ROWS}, () => Array(COLS).fill(null));

    // Power-up texture keys
    const puKey = { [T_SPEED]:'pu_speed', [T_FREEZE]:'pu_freeze', [T_REVEAL]:'pu_reveal' };

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t  = this.mazeData[r][c];
        const px = c*TILE+TILE/2, py = r*TILE+TILE/2+UI_H;

        if (t === T_DOT) {
          this.dotsGrid[r][c] = this.add.image(px, py, 'dot').setDepth(1);
        } else if (t === T_PELLET) {
          const img = this.add.image(px, py, 'pellet').setDepth(1);
          this.pelletsGrid[r][c] = img;
          this.tweens.add({ targets:img, alpha:0.1, duration:400, yoyo:true, repeat:-1 });
        } else if (puKey[t]) {
          const img = this.add.image(px, py, puKey[t]).setDepth(2);
          this.specialGrid[r][c] = img;
          this.tweens.add({ targets:img, scale:1.2, duration:600, yoyo:true, repeat:-1 });
        }
      }
    }
  }

  // ---- SPAWN ----

  _spawnPlayer() {
    if (this.player) this.player.sprite.destroy();
    this.player = new PacMan(this, this.mazeData, 0);
    if (this.mode === 'multiplayer') {
      if (this.player2) this.player2.sprite.destroy();
      this.player2 = new PacMan(this, this.mazeData, 1);
    }
  }

  _spawnGhosts() {
    this.ghosts.forEach(g => g.sprite.destroy());
    this.ghosts = GHOST_TYPES.map(type => new Ghost(this, type, this.mazeData));
  }

  // ---- TILE CALLBACK ----

  onPacReachedTile(tx, ty, playerIndex) {
    const t   = this.mazeData[ty][tx];
    const pac = playerIndex === 0 ? this.player : this.player2;

    if (t === T_DOT) {
      this._eatItem(ty, tx, 'dot');
      this._addScore(SCORE.dot, playerIndex);
      this.audio.waka();
    } else if (t === T_PELLET) {
      this._eatItem(ty, tx, 'pellet');
      this._addScore(SCORE.pellet, playerIndex);
      this.audio.pellet();
      this._activateFrightened();
      this.tracker.onPelletEaten(pac, this.ghosts);
    } else if (t === T_SPEED) {
      this._eatItem(ty, tx, 'special');
      this._addScore(SCORE.speed_pu, playerIndex);
      pac.activatePowerUp(T_SPEED);
      this._emit('powerUp', { type:'speed', player: playerIndex });
      this.audio.pellet();
    } else if (t === T_FREEZE) {
      this._eatItem(ty, tx, 'special');
      this._addScore(SCORE.freeze_pu, playerIndex);
      this._activateFreeze();
      this._emit('powerUp', { type:'freeze', player: playerIndex });
    } else if (t === T_REVEAL) {
      this._eatItem(ty, tx, 'special');
      this._addScore(SCORE.reveal_pu, playerIndex);
      this._activateReveal();
      this._emit('powerUp', { type:'reveal', player: playerIndex });
    }

    if (t !== T_WALL && t !== T_DOOR && t !== T_EMPTY) {
      this._checkGhostRelease();
      this._checkFruitSpawn();
      if (this.dotsLeft <= 0) { this._levelComplete(); return; }
    }
  }

  _eatItem(r, c, kind) {
    this.mazeData[r][c] = T_EMPTY;
    if (kind === 'dot' && this.dotsGrid[r][c]) {
      this.dotsGrid[r][c].destroy(); this.dotsGrid[r][c] = null;
    } else if (kind === 'pellet' && this.pelletsGrid[r][c]) {
      this.pelletsGrid[r][c].destroy(); this.pelletsGrid[r][c] = null;
    } else if (kind === 'special' && this.specialGrid[r][c]) {
      this.tweens.killTweensOf(this.specialGrid[r][c]);
      this.specialGrid[r][c].destroy(); this.specialGrid[r][c] = null;
    }
    this.dotsLeft--; this.dotsEaten++;
  }

  // ---- GHOST COLLISION ----

  _checkGhostCollision() {
    if (this._frozen) return;
    for (const g of this.ghosts) {
      if (g.state==='eaten'||g.state==='house'||g.state==='exiting') continue;

      if (!this.p1eliminated && this.player.alive) {
        const d = Math.hypot(g.x-this.player.x, g.y-this.player.y);
        if (d < TILE*0.75) {
          if (g.state==='frightened') { this._eatGhost(g,0); continue; }
          else { this._playerCaught(0); return; }
        }
      }
      if (this.mode==='multiplayer' && !this.p2eliminated && this.player2?.alive) {
        const d = Math.hypot(g.x-this.player2.x, g.y-this.player2.y);
        if (d < TILE*0.75) {
          if (g.state==='frightened') { this._eatGhost(g,1); continue; }
          else { this._playerCaught(1); return; }
        }
      }
    }
  }

  _eatGhost(ghost, playerIndex) {
    const pts = SCORE.ghost[Math.min(this.ghostsEaten,3)];
    this.ghostsEaten++;
    ghost.setEaten();
    this._addScore(pts, playerIndex);
    this.audio.eatGhost();
    this._showFloatingText(ghost.x, ghost.y, `${pts}`);
  }

  // ---- POWER-UPS ----

  _activateFrightened() {
    const dur = PU_DURATION.fright[Math.min(this.level-1, PU_DURATION.fright.length-1)];
    this.frightenedActive = true; this.ghostsEaten = 0;
    this.ghosts.forEach(g => g.setFrightened(dur));
    this.audio.startSiren(true);
    this.time.delayedCall(dur*1000, () => {
      this.frightenedActive = false;
      if (!this.ghosts.some(g=>g.state==='frightened')) this.audio.startSiren(false);
    });
  }

  _activateFreeze() {
    const dur = PU_DURATION.freeze;
    this.freezeActive = true;
    this.ghosts.forEach(g => g.freeze(dur));
    this._showFloatingText(GAME_W/2, GAME_H/2+UI_H, 'FROZEN!');
    this.time.delayedCall(dur*1000, () => { this.freezeActive = false; });
  }

  _activateReveal() {
    this.revealActive = true;
    this.revealTimer  = PU_DURATION.reveal;
    this._showFloatingText(GAME_W/2, GAME_H/2+UI_H, 'GHOST TARGETS REVEALED!');
  }

  _tickReveal(dt) {
    if (!this.revealActive) { this._revealGraphics?.clear(); return; }
    this.revealTimer -= dt;
    if (this.revealTimer <= 0) {
      this.revealActive = false;
      this._revealGraphics.clear(); return;
    }
    // Draw a small arrow toward each ghost's target tile
    this._revealGraphics.clear();
    for (const g of this.ghosts) {
      if (g.state==='eaten'||g.state==='house') continue;
      const target = g._getTarget?.();
      if (!target) continue;
      const gx = g.x, gy = g.y;
      const tx = target.x*TILE+TILE/2, ty = target.y*TILE+TILE/2+UI_H;
      this._revealGraphics.lineStyle(2, 0xffd700, 0.6);
      this._revealGraphics.lineBetween(gx, gy, tx, ty);
      this._revealGraphics.fillStyle(0xffd700, 0.6);
      this._revealGraphics.fillCircle(tx, ty, 4);
    }
  }

  // ---- MODE SCHEDULE ----

  _tickMode(dt) {
    if (this.frightenedActive || this.modeTimer===Infinity) return;
    this.modeTimer -= dt;
    if (this.modeTimer <= 0) {
      this.modeIdx++;
      if (this.modeIdx >= MODE_SCHEDULE.length) { this.modeTimer=Infinity; return; }
      const entry = MODE_SCHEDULE[this.modeIdx];
      this.currentMode = entry.mode; this.modeTimer = entry.dur;
      this.ghosts.forEach(g => g.setMode(entry.mode));
    }
  }

  _checkGhostRelease() {
    for (const g of this.ghosts)
      if (g.state==='house' && this.dotsEaten >= GHOST_EXIT_DOTS[g.type])
        g.exitHouse();
  }

  // ---- FRUIT ----

  _checkFruitSpawn() {
    const ratio = this.dotsLeft / this._totalDots;
    for (const th of FRUIT_THRESHOLDS) {
      if (!this._fruitShown.includes(th.at) && ratio <= th.at && !this.fruit) {
        this._fruitShown.push(th.at);
        this._spawnFruit(th.type); break;
      }
    }
  }

  _spawnFruit(type) {
    const px = FRUIT_TILE.x*TILE+TILE/2, py = FRUIT_TILE.y*TILE+TILE/2+UI_H;
    this.fruit = this.add.image(px, py, type).setDepth(3);
    this.fruitType = type; this.fruitTimer = 10;
    this.tweens.add({ targets:this.fruit, y:py-4, duration:500, yoyo:true, repeat:-1 });
  }

  _collectFruit(playerIndex) {
    if (!this.fruit) return;
    const type = this.fruitType;
    let pts = 0;
    if (type==='cherry')     pts = SCORE.cherry;
    if (type==='strawberry') pts = SCORE.strawberry;
    if (type==='life_pack') {
      pts = SCORE.life_pack;
      if (playerIndex===0) { this.lives=Math.min(this.lives+1,MAX_LIVES); this._emit('lives',this.lives); }
      else { this.lives2=Math.min(this.lives2+1,MAX_LIVES); this._emit('lives2',this.lives2); }
      this.audio.lifeUp();
      this._showFloatingText(this.fruit.x, this.fruit.y, '1UP!');
    } else {
      this.audio.fruit();
      this._showFloatingText(this.fruit.x, this.fruit.y, `${pts}`);
    }
    this._addScore(pts, playerIndex);
    this.tweens.killTweensOf(this.fruit);
    this.fruit.destroy(); this.fruit=null; this.fruitType=null; this.fruitTimer=0;
  }

  _tickFruit(dt) {
    if (!this.fruit) return;
    this.fruitTimer -= dt;
    if (this.fruitTimer <= 0) {
      this.tweens.killTweensOf(this.fruit);
      this.fruit.destroy(); this.fruit=null; this.fruitType=null; return;
    }
    if (!this.p1eliminated && this.player.alive) {
      if (Math.hypot(this.player.x-this.fruit.x, this.player.y-this.fruit.y) < TILE*0.8) {
        this._collectFruit(0); return;
      }
    }
    if (this.mode==='multiplayer' && !this.p2eliminated && this.player2?.alive) {
      if (Math.hypot(this.player2.x-this.fruit.x, this.player2.y-this.fruit.y) < TILE*0.8) {
        this._collectFruit(1); return;
      }
    }
  }

  // ---- PLAYER CAUGHT ----

  _playerCaught(playerIndex) {
    if (this._frozen) return;
    this._frozen = true;
    this.audio.stopSiren();
    this.ghosts.forEach(g => g.sprite.setAlpha(0.3));
    const pac = playerIndex===0 ? this.player : this.player2;
    this.time.delayedCall(500, () => {
      pac.alive = false; this.audio.death();
      this.tweens.add({
        targets: pac.sprite, scaleX:0, scaleY:0, angle:360, duration:900,
        onComplete: () => this._afterDeath(playerIndex)
      });
    });
  }

  _afterDeath(playerIndex) {
    if (playerIndex===0) {
      this.lives--;
      this._emit('lives', this.lives);
      if (this.lives <= 0) { this.p1eliminated=true; this._emit('p1eliminated',null); this._checkBothEliminated(); return; }
    } else {
      this.lives2--;
      this._emit('lives2', this.lives2);
      if (this.lives2 <= 0) { this.p2eliminated=true; this._emit('p2eliminated',null); this._checkBothEliminated(); return; }
    }
    this.time.delayedCall(600, () => {
      const pac = playerIndex===0 ? this.player : this.player2;
      // Kill any active death tween and destroy the old sprite cleanly
      this.tweens.killTweensOf(pac.sprite);
      pac.sprite.destroy();
      // Create fresh sprite via reset
      pac.sprite = this.add.image(pac.x, pac.y, 'pac_open').setDepth(6);
      if (playerIndex === 1) pac.sprite.setTint(0x00ffff);
      pac.reset();
      this.ghosts.forEach(g => g.sprite.setAlpha(1));
      this._resetGhosts();
      this._frozen = false; this.audio.startSiren(false);
    });
  }

  _resetGhosts() {
    this.ghosts.forEach(g => g.sprite.destroy());
    this.ghosts = GHOST_TYPES.map(t => new Ghost(this, t, this.mazeData));
    this.dotsEaten=0; this.currentMode='scatter'; this.modeIdx=0;
    this.modeTimer=MODE_SCHEDULE[0].dur; this.frightenedActive=false; this.ghostsEaten=0;
  }

  _checkBothEliminated() {
    const bothDead = this.mode==='normal'
      ? this.p1eliminated
      : this.p1eliminated && this.p2eliminated;
    if (!bothDead) { this._frozen=false; this.audio.startSiren(false); return; }
    this.time.delayedCall(600, () => {
      this.audio.stopSiren();
      this.audio.gameOver();
      // Wait for the game over sound to play before switching scene
      this.time.delayedCall(2200, () => {
        this.scene.stop('UIScene');
        this.scene.start('GameOverScene', {
          mode:this.mode, score:this.score, score2:this.score2, level:this.level
        });
      });
    });
  }

  // ---- LEVEL COMPLETE ----

  _levelComplete() {
    if (this._frozen) return;
    this._frozen = true; this.audio.stopSiren();
    this.time.delayedCall(1500, () => {
      this.level++; this._emit('level', this.level); this._nextLevel();
    });
  }

  _nextLevel() {
    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
      this.dotsGrid[r]?.[c]?.destroy();
      this.pelletsGrid[r]?.[c]?.destroy();
      if (this.specialGrid[r]?.[c]) {
        this.tweens.killTweensOf(this.specialGrid[r][c]);
        this.specialGrid[r][c].destroy();
      }
    }
    if (this.fruit) { this.tweens.killTweensOf(this.fruit); this.fruit.destroy(); this.fruit=null; }
    if (this._mazeGfx) { this._mazeGfx.destroy(); this._mazeGfx=null; }

    this.mazeData    = new MazeGenerator().generate();
    this.dotsLeft    = countDots(this.mazeData);
    this._totalDots  = this.dotsLeft;
    this._fruitShown = [];
    this._resetGhosts();
    this.tracker.reset();
    if (this.mode==='multiplayer') this.tracker2.reset();

    if (this.player) this.player.sprite.destroy();
    this.player = new PacMan(this, this.mazeData, 0);
    if (this.mode==='multiplayer' && !this.p2eliminated) {
      if (this.player2) this.player2.sprite.destroy();
      this.player2 = new PacMan(this, this.mazeData, 1);
    }

    this._buildMaze();
    this._frozen = false; this.audio.startMusic(); this.audio.startSiren(false);
  }

  // ---- SCORING ----

  _addScore(pts, playerIndex=0) {
    if (playerIndex===0) {
      this.score += pts; this._emit('score', this.score);
      if (!this._extraGiven && this.score >= SCORE.extra_life) {
        this._extraGiven=true;
        this.lives=Math.min(this.lives+1,MAX_LIVES);
        this._emit('lives',this.lives); this.audio.extraLife(); this._emit('extraLife',null);
      }
    } else {
      this.score2 += pts; this._emit('score2', this.score2);
      if (!this._extra2Given && this.score2 >= SCORE.extra_life) {
        this._extra2Given=true;
        this.lives2=Math.min(this.lives2+1,MAX_LIVES);
        this._emit('lives2',this.lives2); this.audio.extraLife();
      }
    }
  }

  _showFloatingText(x, y, str) {
    const txt = this.add.text(x, y, str, {
      fontSize:'12px', fontFamily:'monospace',
      color:'#ffffff', stroke:'#000', strokeThickness:3
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets:txt, y:y-24, alpha:0, duration:800, onComplete:()=>txt.destroy() });
  }

  _emit(event, value) { this.events.emit(event, value); }
}
