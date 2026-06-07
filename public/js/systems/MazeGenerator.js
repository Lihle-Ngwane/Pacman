

class MazeGenerator {

  generate() {
    let grid, attempts = 0;
    do {
      grid = this._buildGrid();
      attempts++;
    } while (!this._validate(grid) && attempts < 10);
    return grid;
  }

  // ---- CORE BUILD ----

  _buildGrid() {
    const grid = Array.from({length: ROWS}, () => Array(COLS).fill(T_WALL));

    this._dfsCarve(grid);
    this._addLoops(grid, 0.28);
    this._fixGhostHouse(grid);
    this._fixTunnel(grid);
    this._fixBorders(grid);
    this._fixSpawns(grid);
    this._pruneIsolated(grid);
    this._placeDots(grid);

    return grid;
  }

  // ---- DFS CARVE ----

  _dfsCarve(grid) {
    // Supergrid: 13 cols × 14 rows
    // Supercell (sc,sr) → tile (sc*2+1, sr*2+1)
    const SC = 13, SR = 14;
    const visited = Array.from({length: SR}, () => Array(SC).fill(false));
    const stack   = [{ c:0, r:0 }];
    visited[0][0] = true;
    grid[1][1]    = T_EMPTY;

    const DIRS = [{dc:0,dr:-1},{dc:1,dr:0},{dc:0,dr:1},{dc:-1,dr:0}];

    while (stack.length > 0) {
      const { c, r } = stack[stack.length - 1];

      const neighbors = [];
      for (const { dc, dr } of DIRS) {
        const nc = c + dc, nr = r + dr;
        if (nc >= 0 && nc < SC && nr >= 0 && nr < SR && !visited[nr][nc]) {
          neighbors.push({ c:nc, r:nr, dc, dr });
        }
      }

      if (neighbors.length > 0) {
        const pick = neighbors[Math.floor(Math.random() * neighbors.length)];
        // Wall tile between current and pick
        grid[r*2+1 + pick.dr][c*2+1 + pick.dc] = T_EMPTY;
        // Pick's cell tile
        grid[pick.r*2+1][pick.c*2+1] = T_EMPTY;
        visited[pick.r][pick.c] = true;
        stack.push({ c: pick.c, r: pick.r });
      } else {
        stack.pop();
      }
    }
  }

  // ---- ADD LOOPS ----

  _addLoops(grid, ratio) {
    const candidates = [];
    for (let r = 2; r < ROWS - 2; r++) {
      for (let c = 2; c < COLS - 2; c++) {
        if (grid[r][c] !== T_WALL) continue;
        // Count empty neighbours
        const empties = [[0,-1],[1,0],[0,1],[-1,0]]
          .filter(([dc,dr]) => grid[r+dr]?.[c+dc] === T_EMPTY).length;
        if (empties >= 2) candidates.push({ r, c });
      }
    }
    this._shuffle(candidates);
    const n = Math.floor(candidates.length * ratio);
    for (let i = 0; i < n; i++) {
      grid[candidates[i].r][candidates[i].c] = T_EMPTY;
    }
  }

  // ---- GHOST HOUSE OVERLAY ----

  _fixGhostHouse(grid) {
    // Outer walls
    for (let r = 11; r <= 15; r++)
      for (let c = 10; c <= 17; c++)
        grid[r][c] = T_WALL;

    // Interior (rows 13-14, cols 11-16)
    for (let r = 13; r <= 14; r++)
      for (let c = 11; c <= 16; c++)
        grid[r][c] = T_EMPTY;

    // Row 12: top wall of house with door
    for (let c = 11; c <= 16; c++) grid[12][c] = T_WALL;
    grid[12][13] = T_DOOR;
    grid[12][14] = T_DOOR;

    // Row 15: bottom wall (solid)
    for (let c = 11; c <= 16; c++) grid[15][c] = T_WALL;

    // Corridor above house (row 11 inside cols 11-16 = empty)
    for (let c = 11; c <= 16; c++) grid[11][c] = T_EMPTY;

    // Connect corridor to maze: ensure rows 9-10 have a path at col 13
    for (let r = 9; r <= 10; r++) grid[r][13] = T_EMPTY;
  }

  // ---- TUNNEL ----

  _fixTunnel(grid) {
    for (let c = 0; c <= 9;  c++) grid[TUNNEL_ROW][c] = T_EMPTY;
    for (let c = 18; c <= 27; c++) grid[TUNNEL_ROW][c] = T_EMPTY;
    // Ghost house walls interrupt tunnel at cols 10 and 17
    grid[TUNNEL_ROW][10] = T_WALL;
    grid[TUNNEL_ROW][17] = T_WALL;
    // Rows adjacent to tunnel must have walls at col 0 and 27 (border)
    // handled by _fixBorders
  }

  // ---- BORDERS ----

  _fixBorders(grid) {
    for (let c = 0; c < COLS; c++) {
      grid[0][c]  = T_WALL;
      grid[28][c] = T_WALL;
      grid[29][c] = T_WALL;
    }
    for (let r = 1; r < 28; r++) {
      if (r !== TUNNEL_ROW) {
        grid[r][0]      = T_WALL;
        grid[r][COLS-1] = T_WALL;
      }
    }
  }

  // ---- SPAWN TILES ----

  _fixSpawns(grid) {
    // Pac-Man — rows 22-24, cols 12-15 guaranteed open
    for (let r = 22; r <= 24; r++)
      for (let c = 12; c <= 15; c++)
        grid[r][c] = T_EMPTY;

    // Ensure Blinky start (row 11 col 13) is clear
    grid[11][13] = T_EMPTY;
  }

  // ---- CONNECTIVITY ----

  _pruneIsolated(grid) {
    const reachable = Array.from({length: ROWS}, () => Array(COLS).fill(false));
    const queue = [{ x: PAC_START.x, y: PAC_START.y }];
    reachable[PAC_START.y][PAC_START.x] = true;

    while (queue.length > 0) {
      const { x, y } = queue.shift();
      for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
        const nx = x+dx, ny = y+dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        if (reachable[ny][nx]) continue;
        const t = grid[ny][nx];
        if (t === T_WALL) continue;
        // Ghost door is passable for connectivity check
        reachable[ny][nx] = true;
        queue.push({ x:nx, y:ny });
      }
    }

    // Any non-wall tile not reachable → make it a wall (dead pocket)
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (grid[r][c] !== T_WALL && !reachable[r][c])
          grid[r][c] = T_WALL;
  }

  // ---- DOT PLACEMENT ----

  _placeDots(grid) {
    const ghostArea = (r, c) => r >= 11 && r <= 15 && c >= 10 && c <= 17;

    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (grid[r][c] === T_EMPTY && !ghostArea(r, c))
          grid[r][c] = T_DOT;

    // 4 power pellets near corners
    const corners = [{x:1,y:3},{x:26,y:3},{x:1,y:23},{x:26,y:23}];
    for (const corner of corners) {
      let best = null, bestDist = Infinity;
      for (let dr = -3; dr <= 3; dr++) {
        for (let dc = -3; dc <= 3; dc++) {
          const r = corner.y+dr, c = corner.x+dc;
          if (r<0||r>=ROWS||c<0||c>=COLS) continue;
          if (grid[r][c] === T_DOT) {
            const d = Math.abs(dr)+Math.abs(dc);
            if (d < bestDist) { bestDist = d; best = {r,c}; }
          }
        }
      }
      if (best) grid[best.r][best.c] = T_PELLET;
    }

    // Special power-up tiles — 2 of each kind
    const dots = [];
    for (let r = 2; r < ROWS-2; r++)
      for (let c = 2; c < COLS-2; c++)
        if (grid[r][c] === T_DOT) dots.push({r,c});

    this._shuffle(dots);
    const specials = [T_SPEED,T_SPEED,T_FREEZE,T_FREEZE,T_REVEAL,T_REVEAL];
    const step = Math.floor(dots.length / specials.length);
    specials.forEach((type, i) => {
      const candidate = dots[i * step + Math.floor(Math.random() * step)];
      if (candidate) grid[candidate.r][candidate.c] = type;
    });
  }

  // ---- VALIDATION ----

  _validate(grid) {
    // Must have at least 180 dots, must have 4 pellets
    let dots = 0, pellets = 0;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] === T_DOT)    dots++;
        if (grid[r][c] === T_PELLET) pellets++;
      }
    return dots >= 180 && pellets === 4;
  }

  // ---- HELPERS ----

  _shuffle(arr) {
    for (let i = arr.length-1; i > 0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]] = [arr[j],arr[i]];
    }
    return arr;
  }
}

// Count all collectible tiles (dots + all power-up types)
function countDots(grid) {
  let n = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      if (t === T_DOT || t === T_PELLET || t === T_SPEED || t === T_FREEZE || t === T_REVEAL) n++;
    }
  return n;
}
