// ============================================================
// entities/PacMan.js
// Added: active power-up state (speed boost from T_SPEED tile).
// playerIndex: 0=P1 yellow, 1=P2 cyan
// ============================================================

class PacMan {

  constructor(scene, maze, playerIndex = 0) {
    this.scene       = scene;
    this.maze        = maze;
    this.playerIndex = playerIndex;

    const start = playerIndex === 0 ? PAC_START : P2_START;
    this.tileX  = start.x; this.tileY  = start.y;
    this.x      = this._toPx(this.tileX);
    this.y      = this._toPy(this.tileY);

    this.dirX = playerIndex === 0 ? -1 : 1;
    this.dirY = 0;
    this.nextDirX = this.dirX; this.nextDirY = 0;

    this.moving  = false;
    this.alive   = true;
    this.speed   = SPEED.pac_normal;

    // Active power-up
    this.activePU    = null;  // 'speed' | null
    this.puTimer     = 0;

    this.frame = 0; this.frameTick = 0; this.FRAME_DUR = 0.08;

    this.sprite = scene.add.image(this.x, this.y, 'pac_open').setDepth(6);
    if (playerIndex === 1) this.sprite.setTint(0x00ffff);
  }

  reset() {
    const start = this.playerIndex === 0 ? PAC_START : P2_START;
    this.tileX  = start.x; this.tileY  = start.y;
    this.x      = this._toPx(this.tileX);
    this.y      = this._toPy(this.tileY);
    this.dirX   = this.playerIndex === 0 ? -1 : 1; this.dirY = 0;
    this.nextDirX = this.dirX; this.nextDirY = 0;
    this.moving  = false; this.alive = true;
    this.speed   = SPEED.pac_normal;
    this.activePU = null; this.puTimer = 0;
    this.sprite.setPosition(this.x, this.y).setAlpha(1).setScale(1)
      .setAngle(this.playerIndex === 0 ? 180 : 0);
    if (this.playerIndex === 1) this.sprite.setTint(0x00ffff);
    else this.sprite.clearTint();
  }

  requestDir(dx, dy) { this.nextDirX = dx; this.nextDirY = dy; }

  // Activate a special power-up for this player
  activatePowerUp(type) {
    if (type === T_SPEED) {
      this.activePU = 'speed';
      this.puTimer  = PU_DURATION.speed;
      this.speed    = SPEED.pac_fast;
    }
  }

  update(dt) {
    if (!this.alive) return;

    // Power-up timer
    if (this.activePU) {
      this.puTimer -= dt;
      if (this.puTimer <= 0) {
        this.activePU = null;
        this.speed = SPEED.pac_normal;
      }
    }

    if (this.moving) {
      const targetX = this._toPx(this.tileX + this.dirX);
      const targetY = this._toPy(this.tileY + this.dirY);
      const dist    = this.speed * dt;
      const dx = targetX - this.x, dy = targetY - this.y;
      const total = Math.abs(dx) + Math.abs(dy);

      if (dist >= total) {
        this.tileX += this.dirX; this.tileY += this.dirY;
        this._wrapTunnel();
        this.x = this._toPx(this.tileX); this.y = this._toPy(this.tileY);
        this.moving = false;
        this.scene.onPacReachedTile(this.tileX, this.tileY, this.playerIndex);
      } else {
        const r = dist / total;
        this.x += dx * r; this.y += dy * r;
      }
    }

    if (!this.moving) this._tryStart();

    this.frameTick += dt;
    if (this.frameTick >= this.FRAME_DUR) {
      this.frameTick = 0;
      this.frame = (this.frame + 1) % 4;
    }
    this._updateSprite();
  }

  _tryStart() {
    if (this._walkable(this.tileX+this.nextDirX, this.tileY+this.nextDirY)) {
      this.dirX = this.nextDirX; this.dirY = this.nextDirY; this.moving = true; return;
    }
    if (this._walkable(this.tileX+this.dirX, this.tileY+this.dirY)) this.moving = true;
  }

  _walkable(tx, ty) {
    if (ty === TUNNEL_ROW && (tx < 0 || tx >= COLS)) return true;
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return false;
    const t = this.maze[ty][tx];
    return t !== T_WALL && t !== T_DOOR;
  }

  _wrapTunnel() {
    if (this.tileY === TUNNEL_ROW) {
      if (this.tileX < 0)     this.tileX = COLS-1;
      if (this.tileX >= COLS) this.tileX = 0;
    }
  }

  _toPx(tx) { return tx*TILE+TILE/2; }
  _toPy(ty) { return ty*TILE+TILE/2+UI_H; }

  _updateSprite() {
    const keys = ['pac_open','pac_half','pac_closed','pac_half'];
    this.sprite.setTexture(keys[this.frame]).setPosition(this.x, this.y);
    if      (this.dirX ===  1) this.sprite.setAngle(0);
    else if (this.dirX === -1) this.sprite.setAngle(180);
    else if (this.dirY ===  1) this.sprite.setAngle(90);
    else if (this.dirY === -1) this.sprite.setAngle(270);
    if (this.playerIndex === 1) this.sprite.setTint(0x00ffff);

    // Visual feedback for speed boost
    if (this.activePU === 'speed') {
      const flash = Math.floor(Date.now()/100) % 2 === 0;
      this.sprite.setAlpha(flash ? 1 : 0.6);
    } else {
      this.sprite.setAlpha(1);
    }
  }
}
