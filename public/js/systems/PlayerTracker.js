// ============================================================
// systems/PlayerTracker.js
// Watches how the player moves and builds a behavioral profile.
// Ghost.js reads this profile to adapt targeting.
//
// WHAT IT TRACKS:
//   quadrantTime[0-3]  — how many seconds spent in each quadrant
//   pelletRushCount    — how many times player ate a pellet within
//                        2s of a ghost getting close (aggressive)
//   escapeDir          — most common escape direction after danger
//   dangerZones        — tiles where player died or was nearly caught
//
// WHAT GHOSTS DO WITH IT:
//   Blinky: after 20s biases target toward player's favourite quadrant
//   Pinky:  increases lead distance if player is predictable (straight mover)
//   Clyde:  shrinks his "safe distance" if player tends to ignore him
// ============================================================

class PlayerTracker {

  constructor() {
    this.reset();
  }

  reset() {
    // Quadrant time: TL=0, TR=1, BL=2, BR=3
    this.quadrantTime = [0, 0, 0, 0];
    this.totalTime    = 0;

    // Pellet aggression: how often player rushes toward ghosts after pellet
    this.pelletRushCount  = 0;
    this.pelletEatCount   = 0;

    // Straightness: average consecutive tiles in same direction
    this._lastDir    = { x:0, y:0 };
    this._streakLen  = 0;
    this.avgStreak   = 0;
    this._streakSamples = 0;

    // Near-death tiles (player got within 1 tile of ghost here)
    this.dangerTiles = [];   // [{x,y}]

    // Most used escape direction after near-death
    this.escapeDirCount = { up:0, down:0, left:0, right:0 };
  }

  // Called every frame from GameScene
  tick(dt, player, ghosts) {
    if (!player || !player.alive) return;
    this.totalTime += dt;

    // Quadrant
    const qx = player.tileX < COLS/2 ? 0 : 1;
    const qy = player.tileY < ROWS/2 ? 0 : 1;
    const q  = qy * 2 + qx; // 0=TL,1=TR,2=BL,3=BR
    this.quadrantTime[q] += dt;

    // Straightness
    if (player.dirX !== this._lastDir.x || player.dirY !== this._lastDir.y) {
      this._streakSamples++;
      this.avgStreak = (this.avgStreak * (this._streakSamples-1) + this._streakLen) / this._streakSamples;
      this._streakLen = 1;
      this._lastDir = { x: player.dirX, y: player.dirY };
    } else {
      this._streakLen++;
    }

    // Near-death detection
    for (const g of ghosts) {
      if (g.state === 'frightened' || g.state === 'eaten' || g.state === 'house') continue;
      const dist = Math.abs(g.tileX - player.tileX) + Math.abs(g.tileY - player.tileY);
      if (dist <= 2) {
        this._recordDangerTile(player.tileX, player.tileY);
        // Escape direction = current player direction
        if      (player.dirY < 0) this.escapeDirCount.up++;
        else if (player.dirY > 0) this.escapeDirCount.down++;
        else if (player.dirX < 0) this.escapeDirCount.left++;
        else                       this.escapeDirCount.right++;
      }
    }
  }

  onPelletEaten(player, ghosts) {
    this.pelletEatCount++;
    // Check if any ghost was close — player is being aggressive
    const anyClose = ghosts.some(g => {
      if (g.state === 'house' || g.state === 'eaten') return false;
      return Math.abs(g.tileX-player.tileX) + Math.abs(g.tileY-player.tileY) <= 4;
    });
    if (anyClose) this.pelletRushCount++;
  }

  _recordDangerTile(x, y) {
    if (!this.dangerTiles.find(t => t.x===x && t.y===y)) {
      this.dangerTiles.push({x,y});
      if (this.dangerTiles.length > 20) this.dangerTiles.shift();
    }
  }

  // ---- COMPUTED PROPERTIES FOR GHOSTS ----

  // Returns 0-3 quadrant player spends most time in
  getFavouriteQuadrant() {
    let max = 0, q = 0;
    this.quadrantTime.forEach((t,i) => { if (t > max) { max = t; q = i; } });
    return q;
  }

  // Returns centre tile of favourite quadrant
  getFavouriteQuadrantCenter() {
    const q = this.getFavouriteQuadrant();
    return {
      x: q % 2 === 0 ? 7  : 21,
      y: q < 2       ? 7  : 22
    };
  }

  // Is player predictable? (tends to go in straight lines)
  isPredictable() { return this.avgStreak > 8; }

  // Is player aggressive about pellets?
  isPelletAggressive() {
    if (this.pelletEatCount === 0) return false;
    return (this.pelletRushCount / this.pelletEatCount) > 0.5;
  }

  // Influence ratio 0-1 based on how much data we have
  get maturity() { return Math.min(this.totalTime / 30, 1); }
}
