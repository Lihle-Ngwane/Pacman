

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });
const PORT   = process.env.PORT || 3000;

// Serve all client files from /public
app.use(express.static(path.join(__dirname, 'public')));

// ---- GAME CONSTANTS ----
const TILE       = 20;
const COLS       = 28;
const ROWS       = 30;
const TUNNEL_ROW = 13;
const T_WALL     = 0;
const T_DOT      = 1;
const T_PELLET   = 2;
const T_EMPTY    = 3;
const T_DOOR     = 4;
const T_SPEED    = 5;
const T_FREEZE   = 6;
const T_REVEAL   = 7;

const GHOST_TYPES = ['blinky','pinky','inky','clyde'];
const PAC_START   = { x:13, y:23 };
const P2_START    = { x:21, y:23 };
const GHOST_START = {
  blinky:{x:13,y:11}, pinky:{x:13,y:13}, inky:{x:11,y:14}, clyde:{x:15,y:14}
};
const GHOST_EXIT_DOTS  = { blinky:0, pinky:0, inky:30, clyde:60 };
const SCATTER_TARGETS  = {
  blinky:{x:27,y:0}, pinky:{x:0,y:0}, inky:{x:27,y:29}, clyde:{x:0,y:29}
};
const SPEED_V = { pac:135, ghost:108, ghost_scatter:90, ghost_fright:60, ghost_eaten:180 };
const SCORE_V = {
  dot:10, pellet:50, speed_pu:75, freeze_pu:100, reveal_pu:75,
  ghost:[200,400,800,1600]
};
const FRIGHT_DUR    = [7,6,5,4,3,2.5,2,2,1,1];
const MODE_SCHEDULE = [
  {mode:'scatter',dur:7},{mode:'chase',dur:20},{mode:'scatter',dur:7},
  {mode:'chase',dur:20},{mode:'scatter',dur:5},{mode:'chase',dur:20},
  {mode:'scatter',dur:5},{mode:'chase',dur:Infinity}
];

// ---- MAZE GENERATOR (ported from client) ----

class MazeGenerator {
  generate() {
    let grid, attempts = 0;
    do { grid = this._build(); attempts++; }
    while (!this._validate(grid) && attempts < 10);
    return grid;
  }

  _build() {
    const grid = Array.from({length:ROWS}, () => Array(COLS).fill(T_WALL));
    this._dfs(grid);
    this._addLoops(grid, 0.28);
    this._ghostHouse(grid);
    this._tunnel(grid);
    this._borders(grid);
    this._fixSpawns(grid);
    this._prune(grid);
    this._dots(grid);
    return grid;
  }

  _dfs(grid) {
    const SC=13, SR=14;
    const visited = Array.from({length:SR},()=>Array(SC).fill(false));
    const stack   = [{c:0,r:0}];
    visited[0][0]=true; grid[1][1]=T_EMPTY;
    const DIRS=[{dc:0,dr:-1},{dc:1,dr:0},{dc:0,dr:1},{dc:-1,dr:0}];
    while(stack.length>0){
      const {c,r}=stack[stack.length-1];
      const nb=[];
      for(const {dc,dr} of DIRS){
        const nc=c+dc,nr=r+dr;
        if(nc>=0&&nc<SC&&nr>=0&&nr<SR&&!visited[nr][nc]) nb.push({c:nc,r:nr,dc,dr});
      }
      if(nb.length>0){
        const pick=nb[Math.floor(Math.random()*nb.length)];
        grid[r*2+1+pick.dr][c*2+1+pick.dc]=T_EMPTY;
        grid[pick.r*2+1][pick.c*2+1]=T_EMPTY;
        visited[pick.r][pick.c]=true;
        stack.push({c:pick.c,r:pick.r});
      } else { stack.pop(); }
    }
  }

  _addLoops(grid,ratio){
    const cands=[];
    for(let r=2;r<ROWS-2;r++) for(let c=2;c<COLS-2;c++){
      if(grid[r][c]!==T_WALL) continue;
      const e=[[0,-1],[1,0],[0,1],[-1,0]].filter(([dc,dr])=>grid[r+dr]?.[c+dc]===T_EMPTY).length;
      if(e>=2) cands.push({r,c});
    }
    this._shuffle(cands);
    cands.slice(0,Math.floor(cands.length*ratio)).forEach(({r,c})=>grid[r][c]=T_EMPTY);
  }

  _ghostHouse(grid){
    for(let r=11;r<=15;r++) for(let c=10;c<=17;c++) grid[r][c]=T_WALL;
    for(let r=13;r<=14;r++) for(let c=11;c<=16;c++) grid[r][c]=T_EMPTY;
    for(let c=11;c<=16;c++){grid[12][c]=T_WALL; grid[11][c]=T_EMPTY;}
    grid[12][13]=T_DOOR; grid[12][14]=T_DOOR;
    for(let r=9;r<=10;r++) grid[r][13]=T_EMPTY;
  }

  _tunnel(grid){
    for(let c=0;c<=9;c++)  grid[TUNNEL_ROW][c]=T_EMPTY;
    for(let c=18;c<=27;c++) grid[TUNNEL_ROW][c]=T_EMPTY;
    grid[TUNNEL_ROW][10]=T_WALL; grid[TUNNEL_ROW][17]=T_WALL;
  }

  _borders(grid){
    for(let c=0;c<COLS;c++){grid[0][c]=T_WALL;grid[28][c]=T_WALL;grid[29][c]=T_WALL;}
    for(let r=1;r<28;r++) if(r!==TUNNEL_ROW){grid[r][0]=T_WALL;grid[r][COLS-1]=T_WALL;}
  }

  _fixSpawns(grid){
    for(let r=22;r<=24;r++) for(let c=12;c<=15;c++) grid[r][c]=T_EMPTY;
    for(let r=22;r<=24;r++) for(let c=20;c<=23;c++) grid[r][c]=T_EMPTY;
    grid[11][13]=T_EMPTY;
  }

  _prune(grid){
    const reach=Array.from({length:ROWS},()=>Array(COLS).fill(false));
    const q=[{x:PAC_START.x,y:PAC_START.y}];
    reach[PAC_START.y][PAC_START.x]=true;
    while(q.length>0){
      const {x,y}=q.shift();
      for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){
        const nx=x+dx,ny=y+dy;
        if(nx<0||ny<0||nx>=COLS||ny>=ROWS||reach[ny][nx]) continue;
        if(grid[ny][nx]===T_WALL) continue;
        reach[ny][nx]=true; q.push({x:nx,y:ny});
      }
    }
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++)
      if(grid[r][c]!==T_WALL&&!reach[r][c]) grid[r][c]=T_WALL;
  }

  _dots(grid){
    const ghouse=(r,c)=>r>=11&&r<=15&&c>=10&&c<=17;
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++)
      if(grid[r][c]===T_EMPTY&&!ghouse(r,c)) grid[r][c]=T_DOT;

    const corners=[{x:1,y:3},{x:26,y:3},{x:1,y:23},{x:26,y:23}];
    for(const corner of corners){
      let best=null,bd=Infinity;
      for(let dr=-3;dr<=3;dr++) for(let dc=-3;dc<=3;dc++){
        const r=corner.y+dr,c=corner.x+dc;
        if(r<0||r>=ROWS||c<0||c>=COLS) continue;
        if(grid[r][c]===T_DOT){const d=Math.abs(dr)+Math.abs(dc);if(d<bd){bd=d;best={r,c};}}
      }
      if(best) grid[best.r][best.c]=T_PELLET;
    }

    const dots=[];
    for(let r=2;r<ROWS-2;r++) for(let c=2;c<COLS-2;c++) if(grid[r][c]===T_DOT) dots.push({r,c});
    this._shuffle(dots);
    const specials=[T_SPEED,T_SPEED,T_FREEZE,T_FREEZE,T_REVEAL,T_REVEAL];
    const step=Math.floor(dots.length/specials.length);
    specials.forEach((type,i)=>{
      const cand=dots[i*step+Math.floor(Math.random()*step)];
      if(cand) grid[cand.r][cand.c]=type;
    });
  }

  _validate(grid){
    let dots=0,pellets=0;
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      if(grid[r][c]===T_DOT) dots++;
      if(grid[r][c]===T_PELLET) pellets++;
    }
    return dots>=180&&pellets===4;
  }

  _shuffle(arr){
    for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}
    return arr;
  }
}

function countDots(grid){
  let n=0;
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const t=grid[r][c];
    if(t===T_DOT||t===T_PELLET||t===T_SPEED||t===T_FREEZE||t===T_REVEAL) n++;
  }
  return n;
}

// ---- ROOM ----

const rooms = {};

function generateCode(){
  let code;
  do { code=String(Math.floor(1000+Math.random()*9000)); } while(rooms[code]);
  return code;
}

class Room {
  constructor(code){
    this.code    = code;
    this.sockets = [null,null];
    this.state   = 'waiting';

    this.maze        = null;
    this.scores      = [0,0];
    this.lives       = [3,3];
    this.level       = 1;
    this.dotsLeft    = 0;
    this.dotsEaten   = 0;
    this._totalDots  = 0;

    this.players  = [];
    this.ghosts   = [];

    this.currentMode      = 'scatter';
    this.modeIdx          = 0;
    this.modeTimer        = MODE_SCHEDULE[0].dur;
    this.frightenedActive = false;
    this.ghostsEaten      = 0;

    this._last     = Date.now();
    this._interval = null;
  }

  addPlayer(sid){ const i=this.sockets[0]===null?0:1; this.sockets[i]=sid; return i; }
  isFull(){ return this.sockets[0]!==null&&this.sockets[1]!==null; }

  start(){
    this.state       = 'playing';
    // DO NOT regenerate maze here — clients already received this.maze in gameStart event
    // Regenerating creates a different maze on server vs client causing wall-pass bug
    this.dotsLeft    = countDots(this.maze);
    this._totalDots  = this.dotsLeft;
    this._initPlayers();
    this._initGhosts();
    this._last    = Date.now();
    this._interval = setInterval(()=>this._tick(), 20);
  }

  input(idx, dx, dy){
    if(this.players[idx]){ this.players[idx].ndx=dx; this.players[idx].ndy=dy; }
  }

  stop(){
    if(this._interval){ clearInterval(this._interval); this._interval=null; }
    this.state='over';
  }

  _tick(){
    const now=Date.now();
    const dt=Math.min((now-this._last)/1000,0.05);
    this._last=now;
    if(this.state!=='playing') return;

    this._movePlayers(dt);
    this._moveGhosts(dt);
    this._checkCollision();
    this._tickMode(dt);

    // Only serialize and send what each client needs — keep payload small
    const base=this._serialize();
    this.sockets.forEach((sid,i)=>{
      if(sid) io.to(sid).emit('s',{...base,mi:i}); // short key 's' saves bytes
    });
  }

  _movePlayers(dt){
    for(const p of this.players){
      if(!p.alive || p.eliminated) continue;
      if(p.moving){
        const tx=p.tileX*TILE+TILE/2, ty=p.tileY*TILE+TILE/2;
        const dist=p.speed*dt;
        const dx=tx-p.x, dy=ty-p.y, total=Math.abs(dx)+Math.abs(dy);
        if(dist>=total){
          p.x=tx; p.y=ty; p.moving=false;
          if(p.tileY===TUNNEL_ROW){ if(p.tileX<0)p.tileX=COLS-1; if(p.tileX>=COLS)p.tileX=0; }
          this._pacAtTile(p);
        } else { const r=dist/total; p.x+=dx*r; p.y+=dy*r; }
      }
      if(!p.moving) this._tryMove(p);
    }
  }

  _tryMove(p){
    if(this._walkable(p.tileX+p.ndx, p.tileY+p.ndy, false)){
      p.dx=p.ndx; p.dy=p.ndy; p.tileX+=p.dx; p.tileY+=p.dy; p.moving=true; return;
    }
    if(this._walkable(p.tileX+p.dx, p.tileY+p.dy, false)){
      p.tileX+=p.dx; p.tileY+=p.dy; p.moving=true;
    }
  }

  _pacAtTile(p){
    const {tileX:tx,tileY:ty}=p;
    if(ty<0||ty>=ROWS||tx<0||tx>=COLS) return;
    const t=this.maze[ty][tx];
    if(t===T_WALL||t===T_DOOR||t===T_EMPTY) return;

    this.maze[ty][tx]=T_EMPTY;
    this.dotsLeft--; this.dotsEaten++;

    // Tell both clients to remove this dot sprite
    this.sockets.forEach(sid=>{ if(sid) io.to(sid).emit('dotEaten',{r:ty,c:tx}); });

    const pts = t===T_DOT?SCORE_V.dot
      : t===T_PELLET?SCORE_V.pellet
      : t===T_SPEED?SCORE_V.speed_pu
      : t===T_FREEZE?SCORE_V.freeze_pu
      : SCORE_V.reveal_pu;

    this.scores[p.index]+=pts;

    if(t===T_PELLET) {
      this._frighten();
      this.sockets.forEach(sid=>{ if(sid) io.to(sid).emit('pelletEaten'); });
    }
    if(t===T_FREEZE) this.ghosts.forEach(g=>{ if(g.state!=='eaten'){g.frozen=true;g.frozenTimer=4;} });

    this._releaseGhosts();
    if(this.dotsLeft<=0) this._nextLevel();
  }

  _moveGhosts(dt){
    for(const g of this.ghosts){
      if(g.frozen){ g.frozenTimer-=dt; if(g.frozenTimer<=0)g.frozen=false; continue; }
      if(g.state==='frightened'){
        g.frightTimer-=dt;
        if(g.frightTimer<=0){ g.state=g.prev||'scatter'; g.speed=SPEED_V.ghost; }
      }
      if(g.moving){
        const tx=(g.tileX+g.dirX)*TILE+TILE/2, ty=(g.tileY+g.dirY)*TILE+TILE/2;
        const dist=g.speed*dt, dx=tx-g.x, dy=ty-g.y, total=Math.abs(dx)+Math.abs(dy);
        if(dist>=total){
          g.x=tx; g.y=ty; g.tileX+=g.dirX; g.tileY+=g.dirY;
          if(g.tileY===TUNNEL_ROW){ if(g.tileX<0)g.tileX=COLS-1; if(g.tileX>=COLS)g.tileX=0; }
          g.moving=false;
          if(g.state==='eaten'&&g.tileX===13&&g.tileY===13){
            g.state='house'; g.speed=SPEED_V.ghost; g.dirX=0; g.dirY=1;
            setTimeout(()=>{ if(g.state==='house')g.state='exiting'; },2000);
          }
        } else { const r=dist/total; g.x+=dx*r; g.y+=dy*r; }
      }
      if(!g.moving) this._ghostDecide(g);
    }
  }

  _ghostDecide(g){
    switch(g.state){
      case 'house':
        if(g.tileY<=13)g.dirY=1; if(g.tileY>=14)g.dirY=-1;
        g.dirX=0; g.moving=true; return;
      case 'exiting':
        if(g.tileX!==13){g.dirX=g.tileX<13?1:-1;g.dirY=0;g.moving=true;return;}
        if(g.tileY>11){g.dirX=0;g.dirY=-1;g.moving=true;return;}
        g.state=this.currentMode||'scatter'; g.speed=SPEED_V.ghost; g.dirX=-1; g.dirY=0;
    }
    const pac=this._nearest(g);
    const target=this._target(g,pac);
    const dir=this._pickDir(g,target);
    if(dir){g.dirX=dir.x;g.dirY=dir.y;g.moving=true;}
  }

  _target(g,pac){
    if(g.state==='scatter') return SCATTER_TARGETS[g.type];
    if(g.state==='eaten')   return {x:13,y:13};
    if(!pac) return SCATTER_TARGETS[g.type];
    const px=pac.tileX,py=pac.tileY,pdx=pac.dx,pdy=pac.dy;
    switch(g.type){
      case 'blinky': return {x:px,y:py};
      case 'pinky':  return {x:px+pdx*4,y:py+pdy*4};
      case 'inky': {
        const bl=this.ghosts.find(h=>h.type==='blinky');
        if(!bl) return {x:px,y:py};
        return {x:(px+pdx*2)*2-bl.tileX,y:(py+pdy*2)*2-bl.tileY};
      }
      case 'clyde': {
        const d=Math.abs(g.tileX-px)+Math.abs(g.tileY-py);
        return d>8?{x:px,y:py}:SCATTER_TARGETS.clyde;
      }
      default: return {x:px,y:py};
    }
  }

  _pickDir(g,target){
    const DIRS=[{x:0,y:-1},{x:-1,y:0},{x:0,y:1},{x:1,y:0}];
    let best=null,bd=Infinity;
    for(const d of DIRS){
      if(d.x===-g.dirX&&d.y===-g.dirY) continue;
      const nx=g.tileX+d.x,ny=g.tileY+d.y;
      if(!this._walkable(nx,ny,true)) continue;
      if(g.state==='frightened'){if(!best||Math.random()<0.4)best=d;continue;}
      const dist=Math.abs(nx-target.x)+Math.abs(ny-target.y);
      if(dist<bd){bd=dist;best=d;}
    }
    return best;
  }

  _checkCollision(){
    for(const g of this.ghosts){
      if(g.state==='eaten'||g.state==='house'||g.state==='exiting') continue;
      for(const p of this.players){
        if(!p.alive) continue;
        if(Math.hypot(g.x-p.x,g.y-p.y)<TILE*0.75){
          if(g.state==='frightened'){
            const pts=SCORE_V.ghost[Math.min(this.ghostsEaten,3)];
            g.state='eaten'; g.speed=SPEED_V.ghost_eaten;
            this.scores[p.index]+=pts;
            this.ghostsEaten++;
            this.sockets.forEach(sid=>{ if(sid) io.to(sid).emit('ghostEaten',{pts}); });
          } else { this._kill(p); }
        }
      }
    }
  }

  _kill(p){
    p.alive=false;
    p.eliminated=false; // will be set true if lives reach 0
    this.lives[p.index]--;
    this.sockets.forEach(sid=>{ if(sid) io.to(sid).emit('playerDied',{index:p.index}); });

    if(this.lives[p.index]<=0){
      // This player is fully eliminated
      p.eliminated=true;
      this.sockets.forEach(sid=>{
        if(sid) io.to(sid).emit('playerEliminated',{index:p.index});
      });

      // Check if ALL players are eliminated
      const allGone=this.players.every(pl=>pl.eliminated);
      if(allGone){
        this.stop();
        this.sockets.forEach((sid,i)=>{
          if(sid) io.to(sid).emit('gameOver',{
            scores:this.scores, level:this.level, myIndex:i
          });
        });
      }
      // If only one eliminated, other player continues — no respawn for this player
      return;
    }

    // Still has lives — respawn after 2 seconds
    setTimeout(()=>{
      if(this.state!=='playing') return;
      if(p.eliminated) return; // safety check
      p.alive=true;
      const st=p.index===0?PAC_START:P2_START;
      p.tileX=st.x; p.tileY=st.y;
      p.x=p.tileX*TILE+TILE/2; p.y=p.tileY*TILE+TILE/2;
      p.dx=-1; p.dy=0; p.ndx=-1; p.ndy=0; p.moving=false;
    },2000);
  }

  _frighten(){
    const dur=FRIGHT_DUR[Math.min(this.level-1,FRIGHT_DUR.length-1)];
    this.frightenedActive=true; this.ghostsEaten=0;
    this.ghosts.forEach(g=>{
      if(['eaten','house','exiting'].includes(g.state)) return;
      g.prev=g.state; g.state='frightened';
      g.frightTimer=dur; g.speed=SPEED_V.ghost_fright;
    });
    setTimeout(()=>{ this.frightenedActive=false; },dur*1000);
  }

  _tickMode(dt){
    if(this.frightenedActive||this.modeTimer===Infinity) return;
    this.modeTimer-=dt;
    if(this.modeTimer<=0){
      this.modeIdx++;
      if(this.modeIdx>=MODE_SCHEDULE.length){this.modeTimer=Infinity;return;}
      const e=MODE_SCHEDULE[this.modeIdx];
      this.currentMode=e.mode; this.modeTimer=e.dur;
      this.ghosts.forEach(g=>{
        if(['frightened','eaten','house','exiting'].includes(g.state)) return;
        if(g.state!==e.mode){g.state=e.mode;g.dirX=-g.dirX;g.dirY=-g.dirY;if(!g.dirX&&!g.dirY)g.dirX=-1;}
        g.speed=SPEED_V.ghost;
      });
    }
  }

  _releaseGhosts(){
    this.ghosts.forEach(g=>{
      if(g.state==='house'&&this.dotsEaten>=GHOST_EXIT_DOTS[g.type]) g.state='exiting';
    });
  }

  _nextLevel(){
    this.level++;
    this.maze=new MazeGenerator().generate();
    this.dotsLeft=countDots(this.maze); this._totalDots=this.dotsLeft; this.dotsEaten=0;
    this._initPlayers(); this._initGhosts();
    this.sockets.forEach(sid=>{
      if(sid) io.to(sid).emit('newLevel',{level:this.level,maze:this.maze});
    });
  }

  _nearest(g){
    const living=this.players.filter(p=>p.alive);
    if(!living.length) return null;
    return living.reduce((b,p)=>{
      const d=Math.abs(g.tileX-p.tileX)+Math.abs(g.tileY-p.tileY);
      const bd=Math.abs(g.tileX-b.tileX)+Math.abs(g.tileY-b.tileY);
      return d<bd?p:b;
    });
  }

  _walkable(tx,ty,isGhost){
    if(ty===TUNNEL_ROW&&(tx<0||tx>=COLS)) return true;
    if(tx<0||ty<0||tx>=COLS||ty>=ROWS) return false;
    const t=this.maze[ty][tx];
    if(t===T_WALL) return false;
    if(t===T_DOOR) return isGhost;
    return true;
  }

  _serialize(){
    return {
      p: this.players.map(p=>[
        Math.round(p.x), Math.round(p.y), p.dx, p.dy,
        p.alive?1:0, p.eliminated?1:0
      ]),
      g: this.ghosts.map(g=>[
        Math.round(g.x), Math.round(g.y),
        g.state==='eaten'?2:g.state==='frightened'?1:0,
        g.frozen?1:0,
        GHOST_TYPES.indexOf(g.type)
      ]),
      sc: this.scores,
      lv: this.lives,
      fr: this.frightenedActive?1:0
    };
  }

  _initPlayers(){
    const starts=[PAC_START,P2_START];
    this.players=starts.map((s,i)=>({
      index:i, tileX:s.x, tileY:s.y,
      x:s.x*TILE+TILE/2, y:s.y*TILE+TILE/2,
      dx:i===0?-1:1, dy:0, ndx:i===0?-1:1, ndy:0,
      moving:false, alive:true, eliminated:false, speed:SPEED_V.pac
    }));
  }

  _initGhosts(){
    this.ghosts=GHOST_TYPES.map(type=>{
      const s=GHOST_START[type];
      return {
        type, tileX:s.x, tileY:s.y,
        x:s.x*TILE+TILE/2, y:s.y*TILE+TILE/2,
        dirX:0, dirY:type==='blinky'?0:-1,
        state:type==='blinky'?'scatter':'house',
        prev:'scatter', moving:false,
        speed:SPEED_V.ghost,
        frightTimer:0, frozen:false, frozenTimer:0
      };
    });
  }
}

// ---- SOCKET.IO ----

io.on('connection', socket => {
  console.log(`[+] ${socket.id}`);
  let pRoom=null, pIdx=null;

  socket.on('createRoom', () => {
    const code=generateCode();
    const room=new Room(code);
    rooms[code]=room;
    pRoom=code; pIdx=room.addPlayer(socket.id);
    socket.join(code);
    socket.emit('roomCreated',{code,playerIndex:pIdx});
    console.log(`[R] Created room ${code}`);
  });

  socket.on('joinRoom', ({code}) => {
    const room=rooms[code];
    if(!room)          { socket.emit('joinError','Room not found'); return; }
    if(room.isFull())  { socket.emit('joinError','Room is full');   return; }
    if(room.state!=='waiting'){ socket.emit('joinError','Game already started'); return; }

    pRoom=code; pIdx=room.addPlayer(socket.id);
    socket.join(code);
    socket.emit('roomJoined',{playerIndex:pIdx});

    // Generate maze and send to both players
    const maze=new MazeGenerator().generate();
    room.maze=maze;
    // Send gameStart to each socket individually with THEIR OWN correct index.
    // Sending io.to(code) with a single playerIndex would overwrite player 0's
    // index with player 1's, making both clients think they are the same player.
    room.sockets.forEach((sid, i) => {
      if(sid) io.to(sid).emit('gameStart',{maze,playerIndex:i});
    });

    // Start game after countdown
    setTimeout(()=>{ if(rooms[code]) rooms[code].start(); },3200);
    console.log(`[R] Room ${code} full — starting`);
  });

  socket.on('playerInput',({dirX,dirY})=>{
    if(pRoom&&rooms[pRoom]&&pIdx!==null) rooms[pRoom].input(pIdx,dirX,dirY);
  });

  socket.on('disconnect',()=>{
    console.log(`[-] ${socket.id}`);
    if(pRoom&&rooms[pRoom]){
      rooms[pRoom].stop();
      io.to(pRoom).emit('opponentLeft');
      delete rooms[pRoom];
    }
  });
});

server.listen(PORT,()=>{
  console.log(`\nPac-Man server running on port ${PORT}`);
  console.log(`Open: http://localhost:${PORT}\n`);
});