// ============================================================
// scenes/EndScenes.js — saves to Supabase via LeaderboardService
// ============================================================

class GameOverScene extends Phaser.Scene {
  constructor() { super({ key: 'GameOverScene' }); }

  init(data) {
    this.mode = data.mode||'normal'; this.finalScore=data.score||0;
    this.finalScore2=data.score2||0; this.level=data.level||1;
    this.myIndex = data.myIndex !== undefined ? data.myIndex : null;
    this._currentInput=''; this._namePhase=1;
  }

  create() {
    const W=GAME_W, H=TOTAL_H;
    this.add.rectangle(W/2,H/2,W,H,0x000000,0.95);
    this.mode==='multiplayer' ? this._buildMP(W,H) : this._buildNormal(W,H);
  }

  _buildNormal(W,H) {
    this.add.text(W/2,70,'GAME OVER',{fontSize:'44px',fontFamily:'monospace',color:'#ff0000',stroke:'#000',strokeThickness:6}).setOrigin(0.5);
    this.add.text(W/2,135,`SCORE:  ${this.finalScore.toLocaleString()}`,{fontSize:'22px',fontFamily:'monospace',color:'#ffd700'}).setOrigin(0.5);
    this.add.text(W/2,165,`LEVEL REACHED:  ${this.level}`,{fontSize:'13px',fontFamily:'monospace',color:'#aaa'}).setOrigin(0.5);
    GHOST_TYPES.forEach((t,i)=>{
      const ico=this.add.image(W/2-45+i*30,215,`g_${t}`).setScale(1.2);
      this.tweens.add({targets:ico,y:'+=8',duration:400+i*80,yoyo:true,repeat:-1});
    });
    this._savedTxt=this.add.text(W/2,345,'',{fontSize:'11px',fontFamily:'monospace',color:'#22c55e'}).setOrigin(0.5);
    const saved=getSavedUsername();
    if(saved) {
      this.add.text(W/2,262,`PLAYING AS:`,{fontSize:'9px',fontFamily:'monospace',color:'#888'}).setOrigin(0.5);
      this.add.text(W/2,286,saved,{fontSize:'26px',fontFamily:'monospace',color:'#ffd700'}).setOrigin(0.5);
      this.add.text(W/2,316,'PRESS C TO USE A DIFFERENT NAME',{fontSize:'8px',fontFamily:'monospace',color:'#444'}).setOrigin(0.5);
      this._saveNormalAs(saved);
      this.input.keyboard.once('keydown-C',()=>{
        this.add.rectangle(W/2,300,W-10,100,0x000000).setOrigin(0.5);
        this._nameTxt=this.add.text(W/2,288,'_',{fontSize:'22px',fontFamily:'monospace',color:'#ffd700'}).setOrigin(0.5);
        this.add.text(W/2,315,'TYPE NAME  |  ENTER = SAVE',{fontSize:'8px',fontFamily:'monospace',color:'#555'}).setOrigin(0.5);
        this._namePhase=1;
        this._setupKB(()=>this._saveNormal());
      });
    } else {
      this.add.text(W/2,258,'ENTER YOUR NAME:',{fontSize:'9px',fontFamily:'monospace',color:'#888'}).setOrigin(0.5);
      this._nameTxt=this.add.text(W/2,282,'_',{fontSize:'22px',fontFamily:'monospace',color:'#ffd700'}).setOrigin(0.5);
      this.add.text(W/2,312,'TYPE  |  BACKSPACE = DELETE  |  ENTER = SAVE',{fontSize:'8px',fontFamily:'monospace',color:'#555'}).setOrigin(0.5);
      this._setupKB(()=>this._saveNormal());
    }
  }

  async _saveNormalAs(name) {
    await leaderboardService.save(name,this.finalScore,this.level,'normal');
    const online=leaderboardService.isOnline;
    if(this._savedTxt?.active)
      this._savedTxt.setText(online?'SAVED ONLINE!':'SAVED LOCALLY');
    this._showOptions();
  }

  async _saveNormal() {
    const name=this._currentInput||getSavedUsername()||'AAA';
    if(this._nameTxt?.active) this._nameTxt.setText(name);
    await leaderboardService.save(name,this.finalScore,this.level,'normal');
    const online=leaderboardService.isOnline;
    if(this._savedTxt?.active)
      this._savedTxt.setText(online?'SAVED ONLINE!':'SAVED LOCALLY');
    this._showOptions();
  }

  _buildMP(W,H) {
    let winnerTxt='DRAW!', winnerCol='#ffffff';
    if (this.finalScore>this.finalScore2) { winnerTxt='P1 WINS!'; winnerCol='#ffd700'; }
    else if (this.finalScore2>this.finalScore) { winnerTxt='P2 WINS!'; winnerCol='#00ffff'; }
    this.add.text(W/2,55,winnerTxt,{fontSize:'40px',fontFamily:'monospace',color:winnerCol,stroke:'#000',strokeThickness:6}).setOrigin(0.5);
    this.add.text(W/2-80,110,'P1',{fontSize:'12px',fontFamily:'monospace',color:'#ffd700'}).setOrigin(0.5);
    this.add.text(W/2+80,110,'P2',{fontSize:'12px',fontFamily:'monospace',color:'#00ffff'}).setOrigin(0.5);
    this.add.text(W/2-80,132,this.finalScore.toLocaleString(),{fontSize:'18px',fontFamily:'monospace',color:'#ffd700'}).setOrigin(0.5);
    this.add.text(W/2,132,'VS',{fontSize:'12px',fontFamily:'monospace',color:'#888'}).setOrigin(0.5);
    this.add.text(W/2+80,132,this.finalScore2.toLocaleString(),{fontSize:'18px',fontFamily:'monospace',color:'#00ffff'}).setOrigin(0.5);
    this.add.text(W/2,158,`LEVEL REACHED: ${this.level}`,{fontSize:'11px',fontFamily:'monospace',color:'#aaa'}).setOrigin(0.5);

    // If myIndex is set this is a network game — each device only enters their own name
    const isNetwork = this.myIndex !== null && this.myIndex !== undefined;
    const myScore   = this.myIndex === 0 ? this.finalScore : this.finalScore2;
    const myLabel   = this.myIndex === 0 ? 'P1' : 'P2';
    const myColor   = this.myIndex === 0 ? '#ffd700' : '#00ffff';
    const myDefault = this.myIndex === 0 ? 'P1' : 'P2';

    if (isNetwork) {
      const preFill=getSavedUsername();
      if(preFill) {
        this.add.text(W/2,195,`SAVING AS  (${myLabel}):`,{fontSize:'10px',fontFamily:'monospace',color:myColor}).setOrigin(0.5);
        this.add.text(W/2,220,preFill,{fontSize:'24px',fontFamily:'monospace',color:myColor}).setOrigin(0.5);
        this.add.text(W/2,248,'PRESS C TO USE A DIFFERENT NAME',{fontSize:'8px',fontFamily:'monospace',color:'#444'}).setOrigin(0.5);
        this._savedTxt=this.add.text(W/2,270,'',{fontSize:'10px',fontFamily:'monospace',color:'#22c55e'}).setOrigin(0.5);
        this._namePhase=1;
        leaderboardService.save(preFill,myScore,this.level,'multiplayer').then(()=>{
          if(this._savedTxt?.active) this._savedTxt.setText('"'+preFill+'" saved!');
          this._namePhase=3; this._showOptions();
        });
        this.input.keyboard.once('keydown-C',()=>{
          this.add.rectangle(W/2,235,W-10,80,0x000000).setOrigin(0.5);
          this._nameTxt=this.add.text(W/2,222,'_',{fontSize:'20px',fontFamily:'monospace',color:myColor}).setOrigin(0.5);
          this._namePhase=1;
          this._setupKB(async()=>{
            const name=this._currentInput||preFill;
            await leaderboardService.save(name,myScore,this.level,'multiplayer');
            if(this._savedTxt?.active) this._savedTxt.setText('"'+name+'" saved!');
            this._namePhase=3; this._showOptions();
          });
        });
      } else {
        this.add.text(W/2,195,`ENTER YOUR NAME  (${myLabel}):`,{fontSize:'11px',fontFamily:'monospace',color:myColor}).setOrigin(0.5);
        this._nameTxt=this.add.text(W/2,222,'_',{fontSize:'22px',fontFamily:'monospace',color:myColor}).setOrigin(0.5);
        this.add.text(W/2,252,'TYPE  |  BACKSPACE = DELETE  |  ENTER = SAVE',{fontSize:'8px',fontFamily:'monospace',color:'#555'}).setOrigin(0.5);
        this._savedTxt=this.add.text(W/2,278,'',{fontSize:'10px',fontFamily:'monospace',color:'#22c55e'}).setOrigin(0.5);
        this._namePhase=1;
        this._setupKB(async () => {
          const name=this._currentInput||myDefault;
          await leaderboardService.save(name,myScore,this.level,'multiplayer');
          if(this._savedTxt?.active) this._savedTxt.setText('"'+name+'" saved!');
          if(this._nameTxt?.active) this._nameTxt.setText(name);
          this._namePhase=3; this._showOptions();
        });
      }
    } else {
      // Same device local play — ask for both names sequentially
      this._phaseLabel=this.add.text(W/2,195,'P1 — ENTER YOUR NAME:',{fontSize:'10px',fontFamily:'monospace',color:'#ffd700'}).setOrigin(0.5);
      this._nameTxt=this.add.text(W/2,218,'_',{fontSize:'20px',fontFamily:'monospace',color:'#ffffff'}).setOrigin(0.5);
      this.add.text(W/2,244,'TYPE  |  BACKSPACE = DELETE  |  ENTER = CONFIRM',{fontSize:'8px',fontFamily:'monospace',color:'#555'}).setOrigin(0.5);
      this._savedTxt=this.add.text(W/2,268,'',{fontSize:'10px',fontFamily:'monospace',color:'#22c55e'}).setOrigin(0.5);
      this._namePhase=1;
      this._setupKB(()=>this._advanceMP());
    }
  }

  async _advanceMP() {
    if (this._namePhase===1) {
      const name=this._currentInput||'P1';
      await leaderboardService.save(name,this.finalScore,this.level,'multiplayer');
      this._savedTxt.setText(`P1 "${name}" saved!`);
      this._namePhase=2; this._currentInput='';
      this._nameTxt.setText('_').setColor('#00ffff');
      this._phaseLabel?.setText('P2 — ENTER YOUR NAME:').setColor('#00ffff');
    } else if (this._namePhase===2) {
      const name=this._currentInput||'P2';
      await leaderboardService.save(name,this.finalScore2,this.level,'multiplayer');
      this._savedTxt.setText(`P2 "${name}" saved!`);
      this._namePhase=3; this._showOptions();
    }
  }

  _setupKB(onConfirm) {
    this._currentInput=''; this._onConfirm=onConfirm;
    this.input.keyboard.on('keydown', ev => {
      if (this._namePhase===3) return;
      if (ev.key==='Backspace') this._currentInput=this._currentInput.slice(0,-1);
      else if (ev.key==='Enter') { if (this._onConfirm) this._onConfirm(); return; }
      else if (ev.key.length===1 && /[a-zA-Z0-9 _]/.test(ev.key) && this._currentInput.length<8)
        this._currentInput+=ev.key.toUpperCase();
      if (this._nameTxt?.active) this._nameTxt.setText(this._currentInput+'_');
    });
  }

  _showOptions() {
    this._namePhase=3;
    const W=GAME_W, H=TOTAL_H;

    const rt=this.add.text(W/2,H-145,'SPACE = PLAY AGAIN',{fontSize:'14px',fontFamily:'monospace',color:'#ffd700'}).setOrigin(0.5);
    this.tweens.add({targets:rt,alpha:0.2,duration:500,yoyo:true,repeat:-1});
    this.add.text(W/2,H-115,'L = LEADERBOARD',{fontSize:'11px',fontFamily:'monospace',color:'#f59e0b'}).setOrigin(0.5);

    // Visible menu button
    const mb = this.add.rectangle(W/2, H-75, 160, 30, 0x1a1a1a)
      .setInteractive({useHandCursor:true}).setStrokeStyle(2, 0x555555);
    this.add.text(W/2, H-75, '← MAIN MENU', {
      fontSize:'11px', fontFamily:'monospace', color:'#aaaaaa'
    }).setOrigin(0.5);
    mb.on('pointerover',  () => mb.setStrokeStyle(2, 0xffd700));
    mb.on('pointerout',   () => mb.setStrokeStyle(2, 0x555555));
    mb.on('pointerdown',  () => this.scene.start('MenuScene'));

    this.input.keyboard.once('keydown-SPACE', ()=>this.scene.start('GameScene',{mode:this.mode}));
    this.input.keyboard.once('keydown-ENTER', ()=>this.scene.start('MenuScene'));
    this.input.keyboard.once('keydown-L',     ()=>this.scene.start('LeaderboardScene'));
  }
}
