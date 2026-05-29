
class MenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MenuScene' }); }

  create() {
    const W = GAME_W, H = TOTAL_H;
    this.add.rectangle(W/2, H/2, W, H, 0x000000);

    this.add.text(W/2, 65, 'PAC-MAN', {
      fontSize:'52px', fontFamily:'monospace', color:'#ffd700',
      stroke:'#000', strokeThickness:6
    }).setOrigin(0.5);

    const ghostNames = ['blinky','pinky','inky','clyde'];
    ghostNames.forEach((g, i) => {
      this.add.image(W/2 - 90 + i*60, 145, `g_${g}`).setScale(1.3);
    });

    this.add.text(W/2, 185, 'SELECT MODE', {
      fontSize:'11px', fontFamily:'monospace', color:'#666'
    }).setOrigin(0.5);

    // 1 PLAYER
    this._makeButton(W/2 - 80, 225, '1 PLAYER', 0x1a3a1a, 0x22c55e, () => {
      this.scene.start('GameScene', { mode: 'normal' });
    });
    this.add.text(W/2 - 80, 248, 'WASD / ARROWS', {
      fontSize:'7px', fontFamily:'monospace', color:'#555'
    }).setOrigin(0.5);

    // 2 PLAYER ONLINE
    this._makeButton(W/2 + 80, 225, '2P ONLINE', 0x1a1a3a, 0x3b82f6, () => {
      this.scene.start('NetworkGameScene');
    });
    this.add.text(W/2 + 80, 248, 'DIFFERENT DEVICES', {
      fontSize:'7px', fontFamily:'monospace', color:'#3b82f6'
    }).setOrigin(0.5);

    // Scoring table
    const rows = [
      { icon:'dot',        pts:'10 PTS'  },
      { icon:'pellet',     pts:'50 PTS'  },
      { icon:'pu_speed',   pts:'75 PTS + SPEED BOOST' },
      { icon:'pu_freeze',  pts:'100 PTS + FREEZE GHOSTS' },
      { icon:'pu_reveal',  pts:'75 PTS + REVEAL TARGETS' },
      { icon:'cherry',     pts:'100 PTS' },
      { icon:'strawberry', pts:'300 PTS' },
      { icon:'life_pack',  pts:'1000 PTS + 1UP' },
    ];
    rows.forEach((r, i) => {
      const y = 278 + i * 24;
      this.add.image(W/2 - 72, y, r.icon).setScale(0.85);
      this.add.text(W/2 - 56, y, r.pts, {
        fontSize:'10px', fontFamily:'monospace', color:'#cccccc'
      }).setOrigin(0, 0.5);
    });

    this.add.text(W/2, 488, `EXTRA LIFE AT ${SCORE.extra_life.toLocaleString()} PTS`, {
      fontSize:'10px', fontFamily:'monospace', color:'#ffd700'
    }).setOrigin(0.5);

    // Leaderboard
    this._makeButton(W/2, 525, 'LEADERBOARD', 0x2a1a0a, 0xf59e0b, () => {
      this.scene.start('LeaderboardScene');
    });

    // Animated parade
    this._pac = this.add.image(W+20, 575, 'pac_open').setScale(1.2).setFlipX(true);
    this._gh  = ghostNames.map((g,i) => this.add.image(W+50+i*30,575,`g_${g}`).setScale(1.2));
    this.tweens.add({
      targets:[this._pac,...this._gh], x:'-='+(W+200),
      duration:4000, ease:'Linear', repeat:-1,
      onRepeat:()=>{ this._pac.x=W+20; this._gh.forEach((g,i)=>{g.x=W+50+i*30;}); }
    });

    const st=this.add.text(W/2,620,'SPACE = QUICK START (1 PLAYER)',{
      fontSize:'10px',fontFamily:'monospace',color:'#333'
    }).setOrigin(0.5);
    this.tweens.add({targets:st,alpha:0.2,duration:700,yoyo:true,repeat:-1});
    this.input.keyboard.once('keydown-SPACE',()=>this.scene.start('GameScene',{mode:'normal'}));
  }

  _makeButton(x, y, label, bgColor, borderColor, onClick) {
    const bg = this.add.rectangle(x, y, 130, 28, bgColor)
      .setInteractive({useHandCursor:true}).setStrokeStyle(2, borderColor);
    this.add.text(x, y, label, {
      fontSize:'11px', fontFamily:'monospace', color:'#ffffff'
    }).setOrigin(0.5);
    bg.on('pointerover',  ()=>bg.setFillStyle(borderColor, 0.3));
    bg.on('pointerout',   ()=>bg.setFillStyle(bgColor));
    bg.on('pointerdown',  onClick);
  }
}
