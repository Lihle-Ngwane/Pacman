
class LeaderboardScene extends Phaser.Scene {
  constructor() { super({ key: 'LeaderboardScene' }); }

  create() {
    const W = GAME_W, H = TOTAL_H;
    this.add.rectangle(W/2, H/2, W, H, 0x000000);

    this.add.text(W/2, 28, 'LEADERBOARD', {
      fontSize:'28px', fontFamily:'monospace', color:'#ffd700', stroke:'#000', strokeThickness:4
    }).setOrigin(0.5);

    const srcLabel = leaderboardService.isOnline ? 'ONLINE — ALL PLAYERS' : 'LOCAL SCORES ONLY';
    const srcColor = leaderboardService.isOnline ? '#22c55e' : '#888888';
    this.add.text(W/2, 58, srcLabel, { fontSize:'9px', fontFamily:'monospace', color: srcColor }).setOrigin(0.5);

    this._loadingTxt = this.add.text(W/2, H/2, 'LOADING...', {
      fontSize:'14px', fontFamily:'monospace', color:'#555'
    }).setOrigin(0.5);

    leaderboardService.getTop(10).then(entries => {
      this._loadingTxt.destroy();
      this._buildTable(entries, W, H);
    });

    // Visible back button
    const backBtn = this.add.rectangle(W/2, H-48, 160, 30, 0x1a1a1a)
      .setInteractive({useHandCursor:true}).setStrokeStyle(2, 0x555555);
    this.add.text(W/2, H-48, '← BACK TO MENU', {
      fontSize:'11px', fontFamily:'monospace', color:'#aaaaaa'
    }).setOrigin(0.5);
    backBtn.on('pointerover',  () => backBtn.setStrokeStyle(2, 0xffd700));
    backBtn.on('pointerout',   () => backBtn.setStrokeStyle(2, 0x555555));
    backBtn.on('pointerdown',  () => this.scene.start('MenuScene'));

    const back = this.add.text(W/2, H-20, 'ESC / ENTER = BACK', {
      fontSize:'10px', fontFamily:'monospace', color:'#444'
    }).setOrigin(0.5);
    this.tweens.add({ targets:back, alpha:0.2, duration:700, yoyo:true, repeat:-1 });

    this.input.keyboard.once('keydown-ENTER',    () => this.scene.start('MenuScene'));
    this.input.keyboard.once('keydown-BACKSPACE', () => this.scene.start('MenuScene'));
    this.input.keyboard.once('keydown-ESC',       () => this.scene.start('MenuScene'));
  }

  _buildTable(entries, W, H) {
    const divGfx = this.add.graphics();
    divGfx.lineStyle(1, 0x333333);

    const hY = 82;
    [['RANK',28],['NAME',72],['SCORE',170],['LVL',278],['MODE',318],['DATE',370]].forEach(([lbl,x]) => {
      this.add.text(x, hY, lbl, { fontSize:'8px', fontFamily:'monospace', color:'#555' });
    });
    divGfx.lineBetween(20, hY+14, W-20, hY+14);

    if (entries.length === 0) {
      this.add.text(W/2, H/2-40, 'NO SCORES YET\nPLAY A GAME FIRST!', {
        fontSize:'14px', fontFamily:'monospace', color:'#555', align:'center'
      }).setOrigin(0.5);
      return;
    }

    const medalColors = ['#ffd700','#c0c0c0','#cd7f32'];
    const modeColors  = { normal:'#22c55e', multiplayer:'#3b82f6' };
    const bgColors    = [0x2a2200, 0x1a1a1a, 0x1a0e00];

    entries.slice(0, 10).forEach((e, i) => {
      const y   = 106 + i * 46;
      const col = i < 3 ? medalColors[i] : '#cccccc';
      if (i < 3) this.add.rectangle(W/2, y+14, W-20, 40, bgColors[i], 0.7);

      const rankStr = i===0?'1st':i===1?'2nd':i===2?'3rd':`${i+1}th`;
      this.add.text(28,    y+8, rankStr,                  { fontSize:'12px', fontFamily:'monospace', color:col });
      this.add.text(72,    y+8, e.name||'AAA',            { fontSize:'14px', fontFamily:'monospace', color:col });
      this.add.text(170,   y+8, Number(e.score).toLocaleString(), { fontSize:'13px', fontFamily:'monospace', color:'#fff' });
      this.add.text(278,   y+8, String(e.level||1),       { fontSize:'12px', fontFamily:'monospace', color:'#aaa' });
      const mc = modeColors[e.mode]||'#888';
      this.add.text(318,   y+14, e.mode==='multiplayer'?'2P':'1P',
        { fontSize:'9px', fontFamily:'monospace', color:mc }).setOrigin(0, 0.5);
      this.add.text(370,   y+8, e.date||e.created_at?.slice(0,10)||'', { fontSize:'8px', fontFamily:'monospace', color:'#555' });

      if (i < entries.length-1) { divGfx.lineStyle(1,0x222222); divGfx.lineBetween(20,y+42,W-20,y+42); }
    });

    // Clear button
    const clr = this.add.text(W-16, H-38, 'CLEAR LOCAL', {
      fontSize:'9px', fontFamily:'monospace', color:'#333'
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor:true });
    clr.on('pointerover',  () => clr.setColor('#ff4444'));
    clr.on('pointerout',   () => clr.setColor('#333'));
    clr.on('pointerdown',  () => { leaderboardService.clearLocal(); this.scene.restart(); });
  }
}
