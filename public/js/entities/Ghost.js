class Ghost {

  constructor(scene, type, maze) {
    this.scene = scene; this.type = type; this.maze = maze;

    const start  = GHOST_START[type];
    this.tileX   = start.x; this.tileY = start.y;
    this.x       = this._toPx(this.tileX);
    this.y       = this._toPy(this.tileY);

    this.state     = type === 'blinky' ? 'scatter' : 'house';
    this.prevState = 'scatter';

    this.dirX = 0; this.dirY = type === 'blinky' ? 0 : -1;
    this.moving = false;
    this.speed  = SPEED.ghost_normal;

    this.frightFlash = false; this.frightTimer = 0;

    this.bounceMin = 13; this.bounceMax = 14;

    this._pac    = null;
    this._ghosts = [];
    this._tracker = null;  // PlayerTracker reference, set by GameScene

    // Frozen by freeze power-up
    this.frozen = false; this.frozenTimer = 0;

    this.sprite = scene.add.image(this.x, this.y, `g_${type}`).setDepth(5);
    this._updateSprite();
  }

  // ---- STATE SETTERS ----

  setFrightened(dur) {
    if (this.state==='eaten'||this.state==='house'||this.state==='exiting') return;
    this.prevState   = this.state;
    this.state       = 'frightened';
    this.frightTimer = dur;
    this.frightFlash = false;
    this.speed       = SPEED.ghost_fright;
    this.dirX = -this.dirX; this.dirY = -this.dirY;
    if (this.dirX===0 && this.dirY===0) this.dirY = 1;
  }

  setEaten() { this.state = 'eaten'; this.speed = SPEED.ghost_eaten; }

  restoreFromFright() {
    this.state = this.prevState || 'scatter';
    this.speed = SPEED.ghost_normal; this.frightFlash = false;
  }

  setMode(mode) {
    if (['frightened','eaten','house','exiting'].includes(this.state)) return;
    if (this.state !== mode) {
      this.state = mode;
      this.dirX = -this.dirX; this.dirY = -this.dirY;
      if (this.dirX===0 && this.dirY===0) this.dirX = -1;
    }
    this.speed = SPEED.ghost_normal;
  }

  exitHouse() { if (this.state==='house') this.state = 'exiting'; }

  freeze(dur) {
    if (this.state==='eaten') return;
    this.frozen = true; this.frozenTimer = dur;
  }

  // ---- UPDATE ----

  update(dt, players, ghosts, tracker) {
    const allPlayers = Array.isArray(players) ? players : [players];
    const living = allPlayers.filter(p => p && p.alive);

    this._tracker = tracker || null;
    this._ghosts  = ghosts;

    // Freeze power-up
    if (this.frozen) {
      this.frozenTimer -= dt;
      if (this.frozenTimer <= 0) this.frozen = false;
      this._updateSprite(); return;
    }

    if (living.length === 0) { this._updateSprite(); return; }

    // Target nearest living player
    if (living.length === 1) {
      this._pac = living[0];
    } else {
      const d0 = Math.abs(this.tileX-living[0].tileX)+Math.abs(this.tileY-living[0].tileY);
      const d1 = Math.abs(this.tileX-living[1].tileX)+Math.abs(this.tileY-living[1].tileY);
      this._pac = d0 <= d1 ? living[0] : living[1];
    }

    // Frightened timer
    if (this.state === 'frightened') {
      this.frightTimer -= dt;
      this.frightFlash  = this.frightTimer <= 2.0;
      if (this.frightTimer <= 0) this.restoreFromFright();
    }

    if (this.moving) {
      const targetX = this._toPx(this.tileX+this.dirX);
      const targetY = this._toPy(this.tileY+this.dirY);
      const dist    = this.speed * dt;
      const dx = targetX-this.x, dy = targetY-this.y;
      const total = Math.abs(dx)+Math.abs(dy);

      if (dist >= total) {
        this.tileX += this.dirX; this.tileY += this.dirY;
        this._wrapTunnel();
        this.x = this._toPx(this.tileX); this.y = this._toPy(this.tileY);
        this.moving = false;
        this._onReachedTile();
      } else {
        const r = dist/total; this.x += dx*r; this.y += dy*r;
      }
    }

    if (!this.moving) this._tryStart();
    this._updateSprite();
  }

  _onReachedTile() {
    if (this.state==='eaten' && this.tileX===13 && this.tileY===13) {
      this.state = 'house'; this.speed = SPEED.ghost_normal;
      this.dirX = 0; this.dirY = 1;
      this.scene.time.delayedCall(2000, () => {
        if (this.state==='house') this.exitHouse();
      });
    }
  }

  _tryStart() {
    switch (this.state) {
      case 'house':   this._moveHouse();  return;
      case 'exiting': this._moveExit();   return;
      default:        this._moveNormal(); return;
    }
  }

  _moveHouse() {
    if (this.tileY <= this.bounceMin) this.dirY = 1;
    if (this.tileY >= this.bounceMax) this.dirY = -1;
    this.dirX = 0; this.moving = true;
  }

  _moveExit() {
    if (this.tileX !== 13) {
      this.dirX = this.tileX < 13 ? 1 : -1; this.dirY = 0; this.moving = true; return;
    }
    if (this.tileY > 11) {
      this.dirX = 0; this.dirY = -1; this.moving = true; return;
    }
    this.state = this.scene.currentMode || 'scatter';
    this.speed = SPEED.ghost_normal; this.dirX = -1; this.dirY = 0;
    this._moveNormal();
  }

  _moveNormal() {
    const target = this._getTarget();
    const dir    = this._pickDir(target);
    if (dir) { this.dirX = dir.x; this.dirY = dir.y; this.moving = true; }
  }

  _pickDir(target) {
    const DIRS = [{x:0,y:-1},{x:-1,y:0},{x:0,y:1},{x:1,y:0}];
    let bestDir = null, bestDist = Infinity;

    for (const d of DIRS) {
      if (d.x===-this.dirX && d.y===-this.dirY) continue;
      const nx = this.tileX+d.x, ny = this.tileY+d.y;
      if (!this._walkable(nx, ny)) continue;
      if (this.state === 'frightened') {
        if (!bestDir || Math.random() < 0.4) bestDir = d;
        continue;
      }
      const dist = Math.abs(nx-target.x)+Math.abs(ny-target.y);
      if (dist < bestDist) { bestDist = dist; bestDir = d; }
    }
    return bestDir;
  }

  // ---- ADAPTIVE TARGET CALCULATION ----

  _getTarget() {
    if (this.state==='scatter') return SCATTER_TARGETS[this.type];
    if (this.state==='eaten')   return { x:13, y:13 };
    if (!this._pac) return SCATTER_TARGETS[this.type];

    const px = this._pac.tileX, py = this._pac.tileY;
    const pdx = this._pac.dirX,  pdy = this._pac.dirY;
    const m   = this._tracker ? this._tracker.maturity : 0;

    switch (this.type) {

      case 'blinky': {
        // Base: Pac-Man's tile
        let tx = px, ty = py;
        // Adaptive: blend toward player's favourite quadrant
        if (m > 0.3 && this._tracker) {
          const qc = this._tracker.getFavouriteQuadrantCenter();
          tx = Math.round(tx + (qc.x - tx) * m * 0.35);
          ty = Math.round(ty + (qc.y - ty) * m * 0.35);
        }
        return { x:tx, y:ty };
      }

      case 'pinky': {
        // Base: 4 tiles ahead. Adaptive: 6 if player is predictable
        const lead = (m > 0.5 && this._tracker?.isPredictable()) ? 6 : 4;
        return { x: px+pdx*lead, y: py+pdy*lead };
      }

      case 'inky': {
        const blinky = this._ghosts.find(g => g.type==='blinky');
        if (!blinky) return { x:px, y:py };
        const tx = px+pdx*2, ty = py+pdy*2;
        return { x: tx*2-blinky.tileX, y: ty*2-blinky.tileY };
      }

      case 'clyde': {
        // Base: chase if >8, else corner. Adaptive: if player avoids pellets, shrink distance
        const safeZone = (m > 0.5 && this._tracker?.isPelletAggressive()) ? 12 : 8;
        const dist = Math.abs(this.tileX-px)+Math.abs(this.tileY-py);
        return dist > safeZone ? { x:px, y:py } : SCATTER_TARGETS.clyde;
      }

      default: return { x:px, y:py };
    }
  }

  _walkable(tx, ty) {
    if (ty===TUNNEL_ROW && (tx<0||tx>=COLS)) return true;
    if (tx<0||ty<0||tx>=COLS||ty>=ROWS) return false;
    const t = this.maze[ty][tx];
    if (t===T_WALL) return false;
    if (t===T_DOOR) return this.state==='exiting'||this.state==='eaten'||this.state==='house';
    return true;
  }

  _wrapTunnel() {
    if (this.tileY===TUNNEL_ROW) {
      if (this.tileX<0)     this.tileX=COLS-1;
      if (this.tileX>=COLS) this.tileX=0;
    }
  }

  _toPx(tx) { return tx*TILE+TILE/2; }
  _toPy(ty) { return ty*TILE+TILE/2+UI_H; }

  _updateSprite() {
    this.sprite.setPosition(this.x, this.y);

    if (this.frozen) {
      // Blue-tinted freeze effect
      this.sprite.setTexture(`g_${this.type}`).setTint(0x8888ff).setAlpha(0.8); return;
    }

    if (this.state==='eaten') {
      this.sprite.setTexture('g_eyes').setAlpha(1).clearTint(); return;
    }
    if (this.state==='frightened') {
      if (this.frightFlash) {
        const f = Math.floor(Date.now()/250)%2===0;
        this.sprite.setTexture(f?'g_fright':'g_fright2').setAlpha(1).clearTint();
      } else {
        this.sprite.setTexture('g_fright').setAlpha(1).clearTint();
      }
      return;
    }
    this.sprite.setTexture(`g_${this.type}`).setAlpha(1).clearTint();
  }
}
