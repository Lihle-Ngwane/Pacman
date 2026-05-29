

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
    // Animate pac-man mouth every frame
    this._animatePac(delta);
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
      this._socket?.emit('playerInput', { dirX: dx, dirY: dy });
    }
  }

  // ---- RENDER COMPACT STATE ----

  _renderCompact(state) {
    const { p, g, sc, lv, fr, mi } = state;
    const GHOST_TYPE_NAMES = ['blinky','pinky','inky','clyde'];

    // Players
    if (p[0] && this._p1Sprite?.active) {
      this._p1Sprite.setPosition(p[0][0], p[0][1] + UI_H)
        .setAlpha(p[0][4] ? 1 : 0.2);
      this._rotateSprite(this._p1Sprite, p[0][2], p[0][3]);
    }
    if (p[1] && this._p2Sprite?.active) {
      this._p2Sprite.setPosition(p[1][0], p[1][1] + UI_H)
        .setAlpha(p[1][4] ? 1 : 0.2);
      this._rotateSprite(this._p2Sprite, p[1][2], p[1][3]);
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
    if (this._mazeGfx) this._mazeGfx.destroy();
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
    this._p1Sprite = this.add.image(
      PAC_START.x*TILE+TILE/2, PAC_START.y*TILE+TILE/2+UI_H, 'pac_open'
    ).setDepth(6).setAngle(180);

    this._p2Sprite = this.add.image(
      P2_START.x*TILE+TILE/2, P2_START.y*TILE+TILE/2+UI_H, 'pac_open'
    ).setDepth(6).setTint(0x00ffff);

    // "You are" label
    const myColor = this._myIndex===0?'#ffd700':'#00ffff';
    const myLabel = this._myIndex===0?'YOU ARE P1  ●  WASD':'YOU ARE P2  ●  WASD / ARROWS';
    this.add.text(GAME_W/2, UI_H/2, myLabel, {
      fontSize:'8px', fontFamily:'monospace', color:myColor
    }).setOrigin(0.5).setDepth(50);

    // Ghost sprites — 4 ghosts in server order
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
