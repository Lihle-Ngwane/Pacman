
const TILE       = 20;
const COLS       = 28;
const ROWS       = 30;
const GAME_W     = COLS * TILE;   // 560
const GAME_H     = ROWS * TILE;   // 600
const UI_H       = 60;
const TOTAL_H    = GAME_H + UI_H; // 660
const TUNNEL_ROW = 13;

// Tile types
const T_WALL   = 0;
const T_DOT    = 1;
const T_PELLET = 2;  // classic power pellet — frightens ghosts
const T_EMPTY  = 3;
const T_DOOR   = 4;  // ghost door
const T_SPEED  = 5;  // speed boost — pac-man faster for 6s
const T_FREEZE = 6;  // freeze — all ghosts stop for 4s
const T_REVEAL = 7;  // reveal — show ghost targets for 5s

const GHOST_TYPES = ['blinky','pinky','inky','clyde'];

const GHOST_COLORS = {
  blinky: 0xff0000, pinky: 0xffb8ff,
  inky:   0x00ffff, clyde: 0xffb847
};

const SCATTER_TARGETS = {
  blinky: { x:27, y: 0 }, pinky: { x: 0, y: 0 },
  inky:   { x:27, y:29 }, clyde: { x: 0, y:29 }
};

const GHOST_START = {
  blinky: { x:13, y:11 },
  pinky:  { x:13, y:13 },
  inky:   { x:11, y:14 },
  clyde:  { x:15, y:14 }
};

const GHOST_EXIT_DOTS = {
  blinky: 0, pinky: 0, inky: 30, clyde: 60
};

// Fixed spawn tiles — generator always clears these
const PAC_START = { x:13, y:23 };
const P2_START  = { x:14, y:23 };
const MAX_LIVES = 6;

const SPEED = {
  pac_normal:   135,
  pac_fast:     190,  // speed boost power-up
  pac_fright:   150,
  ghost_normal: 108,
  ghost_scatter: 90,
  ghost_fright:  60,
  ghost_eaten:  180
};

const SCORE = {
  dot:        10,
  pellet:     50,
  speed_pu:   75,
  freeze_pu: 100,
  reveal_pu:  75,
  ghost:    [200, 400, 800, 1600],
  cherry:    100,
  strawberry:300,
  life_pack: 1000,
  extra_life:10000
};

// Power-up durations (seconds)
const PU_DURATION = {
  fright: [7,6,5,4,3,2.5,2,2,1,1], // per level
  speed:  6,
  freeze: 4,
  reveal: 5
};

const MODE_SCHEDULE = [
  { mode:'scatter', dur:7  },
  { mode:'chase',   dur:20 },
  { mode:'scatter', dur:7  },
  { mode:'chase',   dur:20 },
  { mode:'scatter', dur:5  },
  { mode:'chase',   dur:20 },
  { mode:'scatter', dur:5  },
  { mode:'chase',   dur:Infinity }
];

const FRUIT_THRESHOLDS = [
  { at:0.70, type:'cherry'     },
  { at:0.40, type:'strawberry' },
  { at:0.20, type:'life_pack'  }
];

const FRUIT_TILE = { x:13, y:11 };

// ---- SUPABASE ONLINE LEADERBOARD CONFIG ----
// 1. Go to supabase.com and create a free account + new project
// 2. In SQL Editor run the SQL in LeaderboardService.js comments
// 3. Paste your project URL and anon key below
// 4. Leave as empty strings to fall back to localStorage only
const SUPABASE_URL = '';   // e.g. 'https://xyzxyz.supabase.co'
const SUPABASE_KEY = '';   // your anon/public key

const LB_KEY = 'pacman_scores_v2';
