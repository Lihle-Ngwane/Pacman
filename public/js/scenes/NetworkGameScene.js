// ============================================================
// scenes/NetworkGameScene.js
// Online multiplayer — connects via Socket.io.
// Server sends compact state. Client renders + plays sounds.
// ============================================================

class NetworkGameScene extends Phaser.Scene {
  constructor() { super({ key: 'NetworkGameScene' }); }

  init() {
    this._phase       = 'connecting';
    this._socket      = null;
    this._myIndex     = null;
    this._maze        = null;
    this._mazeGfx     = null;
    this._dotsGrid    = [];
    this._p1Sprite    = null;
    this._p2Sprite    = null;
    this._ghostSprites = [];
    this._lastDirX    = 0;
    this._lastDirY    = 0;
    // Client side prediction state
    this._predX       = 0;
    this._predY       = 0;
    this._predDirX    = -1;
    this._predDirY    = 0;
    this._predMoving  = false;
    this._predicting  = false;
    this._eliminated    = false;  // this device's player is eliminated
    // Opponent interpolation state
    this._oppRenderX    = 0;
    this._oppRenderY    = 0;
    this._oppTargetX    = 0;
    this._oppTargetY    = 0;
    this._oppAlive      = true;
    this._oppEliminated = false;
    this._oppDirX       = 1;
    this._oppDirY       = 0;
    this._roomCode    = '';
    this._joinInput   = '';
    this._uiGroup     = null;
    this._audio       = null;
    this._lastLives   = [3, 3];
    this._lastScores  = [0, 0];
    this._lastFright  = false;
  }

  create() {
    const W = GAME_W, H = TOTAL_H;
    this.add.rectangle(W/2, H/2, W, H, 0x000000);

    // AudioManager for multiplayer sounds
    if (!window._pacmanAudio) window._pacmanAudio = new AudioManager();
    this._audio = window._pacmanAudio;

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

    this._uiGroup = this.add.group();
    this._showConnecting();
    this._connect();
  }

  update(time, delta) {
    if (this._phase !== 'playing') return;
    this._sendInput();
    this._animatePac(delta);
    // Own player — client side prediction
    if (!this._eliminated) this._predictMove(delta / 1000);
    // Opponent — smooth interpolation toward latest server position
    this._interpolateOpponent();
  }

  _interpolateOpponent() {
    const myIdx  = this._myIndex;
    const oppIdx = myIdx === 0 ? 1 : 0;
    const spr    = oppIdx === 0 ? this._p1Sprite : this._p2Sprite;
    if (!spr?.active) return;

    // Lerp render position toward server target — 0.25 per frame at 60fps
    // gives smooth movement without lag feeling
    const LERP = 0.25;
    this._oppRenderX += (this._oppTargetX - this._oppRenderX) * LERP;
    this._oppRenderY += (this._oppTargetY - this._oppRenderY) * LERP;

    // Snap if very close to avoid infinite tiny drift
    if (Math.abs(this._oppRenderX - this._oppTargetX) < 0.5) this._oppRenderX = this._oppTargetX;
    if (Math.abs(this._oppRenderY - this._oppTargetY) < 0.5) this._oppRenderY = this._oppTargetY;

    spr.setPosition(this._oppRenderX, this._oppRenderY + UI_H);
    spr.setAlpha(this._oppAlive ? 1 : this._oppEliminated ? 0 : 0.2);
    if (this._oppDirX !== undefined) this._rotateSprite(spr, this._oppDirX, this._oppDirY);
  }

  // ---- ANIMATION ----

  _animatePac(delta) {
    if (!this._pacFrame) this._pacFrame = 0;
    if (!this._pacTick)  this._pacTick  = 0;
    this._pacTick += delta;
    if (this._pacTick > 80) {
      this._pacTick  = 0;
      this._pacFrame = (this._pacFrame + 1) % 4;
      const keys = ['pac_open','pac_half','pac_closed','pac_half'];
      if (this._p1Sprite?.active) this._p1Sprite.setTexture(keys[this._pacFrame]);
      if (this._p2Sprite?.active) this._p2Sprite.setTexture(keys[this._pacFrame]);
    }
  }

  // ---- CONNECTION ----

  _getServerURL() {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3000';
    return window.location.origin;
  }

  _connect() {
    try {
      this._socket = io(this._getServerURL(), { transports: ['websocket','polling'] });
    } catch(e) {
      this._showError('Socket.io not loaded. Is the server running?'); return;
    }

    this._socket.on('connect', () => this._showLobby());

    this._socket.on('connect_error', () => {
      this._showError('Cannot reach server.\n\n' + this._getServerURL());
    });

    this._socket.on('roomCreated', ({ code, playerIndex }) => {
      this._myIndex = playerIndex; this._roomCode = code;
      this._showWaiting(code);
    });

    this._socket.on('roomJoined', ({ playerIndex }) => {
      this._myIndex = playerIndex; this._showWaiting('');
    });

    this._socket.on('joinError', msg => this._showLobbyError(msg));

    this._socket.on('gameStart', ({ maze, playerIndex }) => {
      if (playerIndex !== undefined) this._myIndex = playerIndex;
      this._maze = maze;
      this._showCountdown();
    });

    // Compact state — short key 's'
    this._socket.on('s', state => {
      if (this._phase !== 'playing') return;
      this._renderCompact(state);
    });

    // Dot eaten — remove sprite and play sound
    this._socket.on('dotEaten', ({ r, c }) => {
      if (this._dotsGrid[r]?.[c]) {
        this._dotsGrid[r][c].destroy();
        this._dotsGrid[r][c] = null;
      }
      this._audio?.waka();
    });

    // Pellet eaten
    this._socket.on('pelletEaten', () => this._audio?.pellet());

    // Ghost eaten
    this._socket.on('ghostEaten', ({ pts }) => {
      this._audio?.eatGhost();
    });

    // Player died
    this._socket.on('playerDied', ({ index }) => {
      this._audio?.death();
    });

    this._socket.on('gameOver', ({ scores, level, myIndex }) => {
      this._phase = 'over';
      this._audio?.gameOver();
      this._socket.disconnect();
      this.scene.stop('NetworkUIScene');
      this.time.delayedCall(1800, () => {
        this.scene.start('GameOverScene', {
          mode:'multiplayer', score:scores[0], score2:scores[1],
          level, myIndex
        });
      });
    });

    this._socket.on('opponentLeft', () => {
      this._phase = 'over';
      this._socket.disconnect();
      this.scene.stop('NetworkUIScene');
      this._clearUI();
      this._showError('Opponent disconnected.', true);
    });

    this._socket.on('playerEliminated', ({ index }) => {
      const isMe = index === this._myIndex;
      if (isMe) {
        // Show eliminated overlay — but keep watching
        this._eliminated = true;
        this._predicting  = false;
        const W = GAME_W, H = TOTAL_H;
        const overlay = this.add.rectangle(W/2, H/2, W, 60, 0x000000, 0.85)
          .setDepth(80);
        this.add.text(W/2, H/2, 'YOU HAVE BEEN ELIMINATED  —  WATCHING...', {
          fontSize:'11px', fontFamily:'monospace', color:'#ff4444'
        }).setOrigin(0.5).setDepth(81);
      } else {
        // Opponent eliminated — show notice
        const W = GAME_W;
        const notice = this.add.text(W/2, UI_H + 30, 'OPPONENT ELIMINATED', {
          fontSize:'12px', fontFamily:'monospace', color:'#00ffff'
        }).setOrigin(0.5).setDepth(81);
        this.tweens.add({ targets: notice, alpha: 0, duration: 3000,
          onComplete: () => notice.destroy() });
      }
    });

    this._socket.on('newLevel', ({ level, maze }) => {
      this._maze = maze;
      this._rebuildDots();
      this._emit('level', level);
    });
  }

  // ---- INPUT ----

  _sendInput() {
    const k = this._keys;
    let dx = 0, dy = 0;
    if      (k.left.isDown  || k.a.isDown) dx = -1;
    else if (k.right.isDown || k.d.isDown) dx =  1;
    else if (k.up.isDown    || k.w.isDown) dy = -1;
    else if (k.down.isDown  || k.s.isDown) dy =  1;

    if (dx !== this._lastDirX || dy !== this._lastDirY) {
      this._lastDirX = dx; this._lastDirY = dy;
      // Queue direction for prediction
      this._predNextDirX = dx;
      this._predNextDirY = dy;
      this._socket?.emit('playerInput', { dirX: dx, dirY: dy });
    }
  }

  // ---- CLIENT SIDE PREDICTION ----
  // Move our own player locally every frame without waiting for server.
  // Server state corrects us if we drift more than half a tile.

  _predictMove(dt) {
    if (!this._maze || !this._predicting) return;
    const mySpr = this._myIndex === 0 ? this._p1Sprite : this._p2Sprite;
    if (!mySpr?.active) return;

    const speed = 135; // match server pac speed

    // Try queued direction first
    const ndx = this._predNextDirX || 0;
    const ndy = this._predNextDirY || 0;

    if (!this._predMoving) {
      if (ndx !== 0 || ndy !== 0) {
        const nx = this._predTileX + ndx;
        const ny = this._predTileY + ndy;
        if (this._mazeWalkable(nx, ny)) {
          this._predDirX = ndx; this._predDirY = ndy;
          this._predMoving = true;
        }
      }
      if (!this._predMoving) {
        const cx = this._predTileX + this._predDirX;
        const cy = this._predTileY + this._predDirY;
        if (this._mazeWalkable(cx, cy)) this._predMoving = true;
      }
    }

    if (this._predMoving) {
      const targetX = this._predTileX * TILE + TILE / 2;
      const targetY = this._predTileY * TILE + TILE / 2;
      const dist    = speed * dt;
      const dx = targetX - this._predX;
      const dy = targetY - this._predY;
      const total = Math.abs(dx) + Math.abs(dy);

      if (dist >= total) {
        this._predTileX += this._predDirX;
        this._predTileY += this._predDirY;
        // Tunnel wrap
        if (this._predTileY === TUNNEL_ROW) {
          if (this._predTileX < 0)     this._predTileX = COLS - 1;
          if (this._predTileX >= COLS) this._predTileX = 0;
        }
        this._predX = this._predTileX * TILE + TILE / 2;
        this._predY = this._predTileY * TILE + TILE / 2;
        this._predMoving = false;
      } else {
        const r = dist / total;
        this._predX += dx * r;
        this._predY += dy * r;
      }
    }

    // Render predicted position
    mySpr.setPosition(this._predX, this._predY + UI_H);
    this._rotateSprite(mySpr, this._predDirX, this._predDirY);
  }

  _mazeWalkable(tx, ty) {
    if (!this._maze) return false;
    if (ty === TUNNEL_ROW && (tx < 0 || tx >= COLS)) return true;
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return false;
    const t = this._maze[ty][tx];
    return t !== T_WALL && t !== T_DOOR;
  }

  // ---- RENDER COMPACT STATE ----

  _renderCompact(state) {
    const { p, g, sc, lv, fr, mi } = state;
    const GHOST_TYPE_NAMES = ['blinky','pinky','inky','clyde'];

    // Players — use server position for opponent, prediction handles our own player
    const myIdx  = this._myIndex;
    const oppIdx = myIdx === 0 ? 1 : 0;

    // Own player — initialise prediction from server on first packet or after respawn
    if (p[myIdx]) {
      const pd = p[myIdx];
      const eliminated = pd[5] === 1;
      if (eliminated && !this._eliminated) {
        this._eliminated = true;
        this._predicting = false;
      }
      if (!this._predicting && pd[4] === 1 && !eliminated) {
        // Start prediction from server position
        this._predX      = pd[0];
        this._predY      = pd[1];
        this._predTileX  = Math.round((pd[0] - TILE/2) / TILE);
        this._predTileY  = Math.round((pd[1] - TILE/2) / TILE);
        this._predDirX   = pd[2] !== undefined ? pd[2] : -1;
        this._predDirY   = pd[3] !== undefined ? pd[3] : 0;
        this._predNextDirX = pd[2] !== undefined ? pd[2] : -1;
        this._predNextDirY = pd[3] !== undefined ? pd[3] : 0;
        this._predMoving = false;
        this._predicting = true;
      }
      // Soft correction — if server says we are more than 12px away, snap
      if (this._predicting && pd[4] === 1) {
        const drift = Math.hypot(this._predX - pd[0], this._predY - pd[1]);
        if (drift > 12) {
          this._predX     = pd[0];
          this._predY     = pd[1];
          this._predTileX = Math.round((pd[0] - TILE/2) / TILE);
          this._predTileY = Math.round((pd[1] - TILE/2) / TILE);
          this._predMoving = false;
        }
      }
      // Show own player at predicted position (handled in update/_predictMove)
      // Just set alpha based on alive state
      const ownSpr = myIdx === 0 ? this._p1Sprite : this._p2Sprite;
      if (ownSpr?.active) {
        ownSpr.setAlpha(pd[4] ? 1 : 0.15);
        if (eliminated) ownSpr.setAlpha(0);
      }
    }

    // Opponent — store server position as target, interpolation runs in update
    if (p[oppIdx]) {
      const pd = p[oppIdx];
      this._oppTargetX   = pd[0];
      this._oppTargetY   = pd[1];
      this._oppAlive     = pd[4];
      this._oppEliminated = pd[5] === 1;
      this._oppDirX      = pd[2];
      this._oppDirY      = pd[3];
    }

    // Ghosts
    g.forEach((gd, i) => {
      const spr = this._ghostSprites[i];
      if (!spr?.active) return;
      spr.setPosition(gd[0], gd[1] + UI_H);
      const gState = gd[2]; // 0=normal,1=fright,2=eaten
      const frozen  = gd[3];
      const typeIdx = gd[4];
      if (frozen) {
        spr.setTexture(`g_${GHOST_TYPE_NAMES[typeIdx]}`).setTint(0x8888ff).setAlpha(0.8);
      } else if (gState === 2) {
        spr.setTexture('g_eyes').clearTint().setAlpha(1);
      } else if (gState === 1) {
        const flash = Math.floor(Date.now()/250)%2===0;
        spr.setTexture(flash?'g_fright':'g_fright2').clearTint().setAlpha(1);
      } else {
        spr.setTexture(`g_${GHOST_TYPE_NAMES[typeIdx]}`).clearTint().setAlpha(1);
      }
    });

    // Scores — only emit if changed
    if (sc[0] !== this._lastScores[0]) { this._emit('score',  sc[0]); this._lastScores[0] = sc[0]; }
    if (sc[1] !== this._lastScores[1]) { this._emit('score2', sc[1]); this._lastScores[1] = sc[1]; }

    // Lives — emit every tick so UIScene always stays in sync
    this._emit('lives',  lv[0]);
    this._emit('lives2', lv[1]);

    // Frightened siren
    if (fr !== this._lastFright) {
      this._lastFright = fr;
      // No siren in network mode — EDM music only
    }
  }

  _rotateSprite(spr, dx, dy) {
    if      (dx ===  1) spr.setAngle(0);
    else if (dx === -1) spr.setAngle(180);
    else if (dy ===  1) spr.setAngle(90);
    else if (dy === -1) spr.setAngle(270);
  }

  // ---- MAZE ----

  _buildMaze() {
    // Destroy old maze graphics to prevent stacking
    if (this._mazeGfx) { this._mazeGfx.destroy(); this._mazeGfx = null; }
    // Destroy any leftover dot sprites
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (this._dotsGrid[r]?.[c]) {
          this.tweens.killTweensOf(this._dotsGrid[r][c]);
          this._dotsGrid[r][c].destroy();
          this._dotsGrid[r][c] = null;
        }
    this._mazeGfx = this.add.graphics().setDepth(0);
    const gfx = this._mazeGfx, maze = this._maze;

    gfx.fillStyle(0x000000); gfx.fillRect(0, UI_H, GAME_W, GAME_H);
    gfx.fillStyle(0x1919a6); gfx.lineStyle(1, 0x3333ff, 1);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = maze[r][c];
        const px = c*TILE, py = r*TILE+UI_H;
        if (t === T_WALL) {
          gfx.fillRect(px+1,py+1,TILE-2,TILE-2);
          gfx.strokeRect(px,py,TILE,TILE);
        }
        if (t === T_DOOR) {
          gfx.lineStyle(3,0xffb8ff,1);
          gfx.lineBetween(px,py+TILE/2,px+TILE,py+TILE/2);
          gfx.lineStyle(1,0x3333ff,1);
        }
      }
    }
    this._buildDotSprites();
  }

  _buildDotSprites() {
    this._dotsGrid = Array.from({length:ROWS},()=>Array(COLS).fill(null));
    const puKey = {[T_SPEED]:'pu_speed',[T_FREEZE]:'pu_freeze',[T_REVEAL]:'pu_reveal'};

    for (let r=0;r<ROWS;r++) {
      for (let c=0;c<COLS;c++) {
        const t=this._maze[r][c];
        const px=c*TILE+TILE/2, py=r*TILE+TILE/2+UI_H;
        if (t===T_DOT) {
          this._dotsGrid[r][c]=this.add.image(px,py,'dot').setDepth(1);
        } else if (t===T_PELLET) {
          const img=this.add.image(px,py,'pellet').setDepth(1);
          this._dotsGrid[r][c]=img;
          this.tweens.add({targets:img,alpha:0.1,duration:400,yoyo:true,repeat:-1});
        } else if (puKey[t]) {
          const img=this.add.image(px,py,puKey[t]).setDepth(2);
          this._dotsGrid[r][c]=img;
          this.tweens.add({targets:img,scale:1.2,duration:600,yoyo:true,repeat:-1});
        }
      }
    }
  }

  _rebuildDots() {
    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
      if (this._dotsGrid[r]?.[c]) {
        this.tweens.killTweensOf(this._dotsGrid[r][c]);
        this._dotsGrid[r][c].destroy();
      }
    }
    this._buildDotSprites();
  }

  _buildEntitySprites() {
    // Destroy any existing sprites first to prevent ghosting
    if (this._p1Sprite) { this._p1Sprite.destroy(); this._p1Sprite = null; }
    if (this._p2Sprite) { this._p2Sprite.destroy(); this._p2Sprite = null; }
    this._ghostSprites.forEach(s => { if (s) s.destroy(); });
    this._ghostSprites = [];

    this._p1Sprite = this.add.image(
      PAC_START.x*TILE+TILE/2, PAC_START.y*TILE+TILE/2+UI_H, 'pac_open'
    ).setDepth(6).setAngle(180);

    this._p2Sprite = this.add.image(
      P2_START.x*TILE+TILE/2, P2_START.y*TILE+TILE/2+UI_H, 'pac_open'
    ).setDepth(6).setTint(0x00ffff);

    // Initialise prediction from known start position immediately so the
    // own sprite never sits frozen waiting for the first server packet
    const myStart = this._myIndex === 0 ? PAC_START : P2_START;
    const myStartDirX = this._myIndex === 0 ? -1 : 1;
    this._predX        = myStart.x * TILE + TILE / 2;
    this._predY        = myStart.y * TILE + TILE / 2;
    this._predTileX    = myStart.x;
    this._predTileY    = myStart.y;
    this._predDirX     = myStartDirX;
    this._predDirY     = 0;
    this._predNextDirX = myStartDirX;
    this._predNextDirY = 0;
    this._predMoving   = false;
    this._predicting   = true;

    // Initialise opponent interpolation targets at opponent start position
    const oppStart = this._myIndex === 0 ? P2_START : PAC_START;
    this._oppRenderX = oppStart.x * TILE + TILE / 2;
    this._oppRenderY = oppStart.y * TILE + TILE / 2;
    this._oppTargetX = this._oppRenderX;
    this._oppTargetY = this._oppRenderY;

    // "You are" label
    const myColor = this._myIndex===0?'#ffd700':'#00ffff';
    const myLabel = this._myIndex===0?'YOU ARE P1  ●  WASD':'YOU ARE P2  ●  WASD / ARROWS';
    this.add.text(GAME_W/2, UI_H/2, myLabel, {
      fontSize:'8px', fontFamily:'monospace', color:myColor
    }).setOrigin(0.5).setDepth(50);

    // Ghost sprites
    this._ghostSprites = GHOST_TYPES.map(type => {
      const s = GHOST_START[type];
      return this.add.image(
        s.x*TILE+TILE/2, s.y*TILE+TILE/2+UI_H, `g_${type}`
      ).setDepth(5);
    });
  }

  // ---- UI PHASES ----

  _clearUI() {
    this._uiGroup.getChildren().forEach(c=>c.destroy());
    this._uiGroup.clear();
  }

  _add(obj) { this._uiGroup.add(obj); return obj; }

  _showConnecting() {
    const W=GAME_W,H=TOTAL_H; this._clearUI();
    const t=this._add(this.add.text(W/2,H/2,'CONNECTING...', {
      fontSize:'16px',fontFamily:'monospace',color:'#888'
    }).setOrigin(0.5));
    this.tweens.add({targets:t,alpha:0.2,duration:600,yoyo:true,repeat:-1});
  }

  _showLobby() {
    const W=GAME_W,H=TOTAL_H;
    this._phase='lobby'; this._clearUI();

    this._add(this.add.text(W/2,70,'2 PLAYER ONLINE',{
      fontSize:'26px',fontFamily:'monospace',color:'#3b82f6'
    }).setOrigin(0.5));

    this._add(this.add.text(W/2,105,'CONNECTED  ●',{
      fontSize:'10px',fontFamily:'monospace',color:'#22c55e'
    }).setOrigin(0.5));

    // Create room
    this._add(this.add.text(W/2,170,'HOST A NEW GAME',{
      fontSize:'10px',fontFamily:'monospace',color:'#777'
    }).setOrigin(0.5));
    const cb=this._add(this.add.rectangle(W/2,200,190,34,0x1a3a1a)
      .setInteractive({useHandCursor:true}).setStrokeStyle(2,0x22c55e));
    this._add(this.add.text(W/2,200,'CREATE ROOM',{
      fontSize:'13px',fontFamily:'monospace',color:'#ffffff'
    }).setOrigin(0.5));
    cb.on('pointerover',()=>cb.setFillStyle(0x22c55e,0.3));
    cb.on('pointerout', ()=>cb.setFillStyle(0x1a3a1a));
    cb.on('pointerdown',()=>{ if(this._socket?.connected) this._socket.emit('createRoom'); });

    this._add(this.add.text(W/2,258,'— OR JOIN WITH CODE —',{
      fontSize:'9px',fontFamily:'monospace',color:'#444'
    }).setOrigin(0.5));

    // Code display
    this._joinDisplayTxt=this._add(this.add.text(W/2,310,'_ _ _ _',{
      fontSize:'36px',fontFamily:'monospace',color:'#ffd700'
    }).setOrigin(0.5));

    this._add(this.add.text(W/2,348,'TYPE 4 DIGITS THEN PRESS ENTER',{
      fontSize:'8px',fontFamily:'monospace',color:'#555'
    }).setOrigin(0.5));

    this._errorTxt=this._add(this.add.text(W/2,373,'',{
      fontSize:'11px',fontFamily:'monospace',color:'#ff4444'
    }).setOrigin(0.5));

    const jb=this._add(this.add.rectangle(W/2,410,190,34,0x1a1a3a)
      .setInteractive({useHandCursor:true}).setStrokeStyle(2,0x3b82f6));
    this._add(this.add.text(W/2,410,'JOIN ROOM',{
      fontSize:'13px',fontFamily:'monospace',color:'#ffffff'
    }).setOrigin(0.5));
    jb.on('pointerover',()=>jb.setFillStyle(0x3b82f6,0.3));
    jb.on('pointerout', ()=>jb.setFillStyle(0x1a1a3a));
    jb.on('pointerdown',()=>this._tryJoin());

    // Back button
    const back=this._add(this.add.rectangle(W/2,480,160,28,0x111111)
      .setInteractive({useHandCursor:true}).setStrokeStyle(1,0x444444));
    this._add(this.add.text(W/2,480,'← BACK TO MENU',{
      fontSize:'10px',fontFamily:'monospace',color:'#888'
    }).setOrigin(0.5));
    back.on('pointerdown',()=>{
      this.input.keyboard.off('keydown',this._onLobbyKey,this);
      this._socket?.disconnect();
      this.scene.start('MenuScene');
    });

    this.input.keyboard.on('keydown',this._onLobbyKey,this);
    this.input.keyboard.once('keydown-ESC',()=>{
      this.input.keyboard.off('keydown',this._onLobbyKey,this);
      this._socket?.disconnect();
      this.scene.start('MenuScene');
    });
  }

  _showLobbyError(msg) {
    if (this._errorTxt?.active) this._errorTxt.setText(msg);
    this._joinInput='';
    if (this._joinDisplayTxt?.active) this._joinDisplayTxt.setText('_ _ _ _');
  }

  _onLobbyKey(event) {
    if (this._phase!=='lobby') return;
    const k=event.key;
    if (k==='Enter')     { this._tryJoin(); return; }
    if (k==='Backspace') { this._joinInput=this._joinInput.slice(0,-1); }
    else if (/[0-9]/.test(k)&&this._joinInput.length<4) { this._joinInput+=k; }
    if (this._joinDisplayTxt?.active) {
      const padded=(this._joinInput+'    ').slice(0,4).split('').join(' ');
      this._joinDisplayTxt.setText(padded);
    }
  }

  _tryJoin() {
    if (this._joinInput.length!==4) {
      if(this._errorTxt?.active) this._errorTxt.setText('Enter all 4 digits'); return;
    }
    this.input.keyboard.off('keydown',this._onLobbyKey,this);
    this._socket.emit('joinRoom',{code:this._joinInput});
    this._socket.once('joinError',msg=>{ this._joinInput=''; this._showLobby(); this._showLobbyError(msg); });
  }

  _showWaiting(code) {
    const W=GAME_W,H=TOTAL_H;
    this._phase='waiting'; this._clearUI();
    this.input.keyboard.off('keydown',this._onLobbyKey,this);

    if (code) {
      this._add(this.add.text(W/2,H/2-100,'ROOM CREATED!',{
        fontSize:'20px',fontFamily:'monospace',color:'#22c55e'
      }).setOrigin(0.5));
      this._add(this.add.text(W/2,H/2-60,'SHARE THIS CODE WITH YOUR OPPONENT:',{
        fontSize:'9px',fontFamily:'monospace',color:'#888'
      }).setOrigin(0.5));
      this._add(this.add.text(W/2,H/2,code,{
        fontSize:'64px',fontFamily:'monospace',color:'#ffd700',
        stroke:'#000',strokeThickness:4
      }).setOrigin(0.5));
      const pulse=this._add(this.add.text(W/2,H/2+70,'WAITING FOR OPPONENT...',{
        fontSize:'12px',fontFamily:'monospace',color:'#888'
      }).setOrigin(0.5));
      this.tweens.add({targets:pulse,alpha:0.2,duration:700,yoyo:true,repeat:-1});
    } else {
      this._add(this.add.text(W/2,H/2,'JOINED!\nWAITING FOR GAME TO START...',{
        fontSize:'16px',fontFamily:'monospace',color:'#22c55e',align:'center'
      }).setOrigin(0.5));
    }
  }

  _showCountdown() {
    const W=GAME_W,H=TOTAL_H;
    this._phase='countdown'; this._clearUI();
    this.input.keyboard.off('keydown',this._onLobbyKey,this);

    // Reset state BEFORE building sprites so _buildEntitySprites sets correct values
    this._eliminated   = false;
    this._predicting   = false;
    this._predNextDirX = 0;
    this._predNextDirY = 0;

    this._buildMaze();
    this._buildEntitySprites();

    // Launch HUD
    this.scene.launch('NetworkUIScene');
    this.scene.bringToTop('NetworkUIScene');

    // Give UIScene a moment to register listeners then send initial values
    this.time.delayedCall(100, () => {
      this._emit('lives',  3);
      this._emit('lives2', 3);
      this._emit('score',  0);
      this._emit('score2', 0);
      this._emit('level',  1);
    });

    this._audio?.startMusic();

    const countTxt=this.add.text(W/2,H/2,'3',{
      fontSize:'80px',fontFamily:'monospace',color:'#ffd700',
      stroke:'#000',strokeThickness:6
    }).setOrigin(0.5).setDepth(90);

    let n=3;
    this.time.addEvent({ delay:1000, repeat:2, callback:()=>{
      n--;
      if(n>0) countTxt.setText(String(n));
      else {
        countTxt.setText('GO!');
        this.time.delayedCall(600,()=>{ countTxt.destroy(); this._phase='playing'; });
      }
    }});
  }

  _showError(msg,showBack=false) {
    const W=GAME_W,H=TOTAL_H; this._clearUI();
    this._add(this.add.text(W/2,H/2-40,msg,{
      fontSize:'13px',fontFamily:'monospace',color:'#ff4444',align:'center'
    }).setOrigin(0.5));
    if (showBack) {
      const back=this._add(this.add.rectangle(W/2,H/2+40,160,30,0x111111)
        .setInteractive({useHandCursor:true}).setStrokeStyle(1,0x555555));
      this._add(this.add.text(W/2,H/2+40,'← BACK',{
        fontSize:'11px',fontFamily:'monospace',color:'#888'
      }).setOrigin(0.5));
      back.on('pointerdown',()=>{ this._socket?.disconnect(); this.scene.start('MenuScene'); });
    }
  }

  _emit(event,value) { this.events.emit(event,value); }
}