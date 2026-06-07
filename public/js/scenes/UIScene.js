

class UIScene extends Phaser.Scene {
  constructor() { super({ key: 'UIScene' }); }

  static get EVENTS() {
    return ['score','score2','lives','lives2','level','flash',
            'extraLife','p1eliminated','p2eliminated','powerUp'];
  }

  create(data) {
    const W = GAME_W;
    const gs = this.scene.get('GameScene');
    this._mode = (data && data.mode) || gs.mode || 'normal';

    UIScene.EVENTS.forEach(ev => gs.events.removeAllListeners(ev));

    this.add.rectangle(W/2, UI_H/2, W, UI_H, 0x000000);

    if (this._mode === 'multiplayer') this._buildMultiplayerHUD(W);
    else this._buildNormalHUD(W);

    this.flashRect = this.add.rectangle(W/2, UI_H/2+GAME_H/2, W, TOTAL_H, 0xffffff, 0).setDepth(99);
    this._hi = 10000;
    this._registerListeners(gs);

    this.events.once('shutdown', () => {
      const gs2 = this.scene.get('GameScene');
      if (gs2) UIScene.EVENTS.forEach(ev => gs2.events.removeAllListeners(ev));
    });
  }

  _buildNormalHUD(W) {
    this.add.text(8, 8, 'SCORE', { fontSize:'9px', fontFamily:'monospace', color:'#ff0000' });
    this.scoreVal = this.add.text(8, 20, '0', { fontSize:'16px', fontFamily:'monospace', color:'#ffffff' });

    this.add.text(W/2, 8, 'HIGH SCORE', { fontSize:'9px', fontFamily:'monospace', color:'#ff0000' }).setOrigin(0.5, 0);
    this.hiVal = this.add.text(W/2, 20, '10000', { fontSize:'16px', fontFamily:'monospace', color:'#ffffff' }).setOrigin(0.5, 0);

    this.add.text(W-60, 8, 'LEVEL', { fontSize:'9px', fontFamily:'monospace', color:'#ff0000' }).setOrigin(0.5, 0);
    this.levelVal = this.add.text(W-60, 20, '1', { fontSize:'16px', fontFamily:'monospace', color:'#ffd700' }).setOrigin(0.5, 0);

    this._p1Icons = this._makeLifeIcons(8, 44, 1, MAX_LIVES);
    this._setLiveIcons(this._p1Icons, 3);

    // Power-up indicator
    this.puTxt = this.add.text(W/2, 44, '', {
      fontSize:'10px', fontFamily:'monospace', color:'#ffd700'
    }).setOrigin(0.5, 0.5);
  }

  _buildMultiplayerHUD(W) {
    this.add.text(8, 4, 'P1', { fontSize:'8px', fontFamily:'monospace', color:'#ffd700' });
    this.scoreVal = this.add.text(8, 14, '0', { fontSize:'13px', fontFamily:'monospace', color:'#ffd700' });

    this.add.text(W/2, 4, 'LEVEL', { fontSize:'8px', fontFamily:'monospace', color:'#aaa' }).setOrigin(0.5, 0);
    this.levelVal = this.add.text(W/2, 16, '1', { fontSize:'13px', fontFamily:'monospace', color:'#fff' }).setOrigin(0.5, 0);

    this.add.text(W-8, 4, 'P2', { fontSize:'8px', fontFamily:'monospace', color:'#00ffff' }).setOrigin(1, 0);
    this.scoreVal2 = this.add.text(W-8, 14, '0', { fontSize:'13px', fontFamily:'monospace', color:'#00ffff' }).setOrigin(1, 0);

    this._p1Icons = this._makeLifeIcons(8, 44, 1, MAX_LIVES);
    this._setLiveIcons(this._p1Icons, 3);

    this._p2Icons = this._makeLifeIcons(W-8, 44, -1, MAX_LIVES, 0x00ffff);
    this._setLiveIcons(this._p2Icons, 3);

    this.p1ElimTxt = this.add.text(90, 30, 'ELIMINATED', { fontSize:'8px', fontFamily:'monospace', color:'#ff4444' }).setOrigin(0.5).setAlpha(0);
    this.p2ElimTxt = this.add.text(W-90, 30, 'ELIMINATED', { fontSize:'8px', fontFamily:'monospace', color:'#ff4444' }).setOrigin(0.5).setAlpha(0);

    this.puTxt = this.add.text(W/2, 44, '', { fontSize:'9px', fontFamily:'monospace', color:'#ffd700' }).setOrigin(0.5, 0.5);
  }

  _makeLifeIcons(startX, y, dir, count, tint) {
    const icons = [];
    for (let i = 0; i < count; i++) {
      const ico = this.add.image(startX + dir*i*18, y, 'life_icon').setOrigin(dir > 0 ? 0 : 1, 0.5).setAlpha(0);
      if (tint) ico.setTint(tint);
      icons.push(ico);
    }
    return icons;
  }

  _setLiveIcons(icons, n) {
    if (!icons) return;
    icons.forEach((ico, i) => { if (ico?.active) ico.setAlpha(i < n ? 1 : 0); });
  }

  _registerListeners(gs) {
    gs.events.on('score', s => {
      if (this.scoreVal?.active) this.scoreVal.setText(String(s));
      if (s > this._hi && this.hiVal?.active) { this._hi = s; this.hiVal.setText(String(s)); }
    });
    gs.events.on('score2', s => { if (this.scoreVal2?.active) this.scoreVal2.setText(String(s)); });
    gs.events.on('lives',  n => this._setLiveIcons(this._p1Icons, n));
    gs.events.on('lives2', n => this._setLiveIcons(this._p2Icons, n));
    gs.events.on('level',  n => { if (this.levelVal?.active) this.levelVal.setText(String(n)); });

    gs.events.on('powerUp', ({ type, player }) => {
      if (!this.puTxt?.active) return;
      const labels = { speed:'SPEED BOOST!', freeze:'FREEZE!', reveal:'REVEAL!' };
      const colors = { speed:'#ff8800', freeze:'#00ddff', reveal:'#ffd700' };
      const who    = this._mode==='multiplayer' ? (player===0 ? 'P1 ' : 'P2 ') : '';
      this.puTxt.setText(who + (labels[type]||'')).setColor(colors[type]||'#ffffff');
      this.tweens.killTweensOf(this.puTxt);
      this.tweens.add({ targets:this.puTxt, alpha:0, duration:2000, delay:1500,
        onComplete: () => { if (this.puTxt?.active) this.puTxt.setText('').setAlpha(1); }
      });
    });

    gs.events.on('extraLife', () => {
      if (!this.flashRect?.active) return;
      this.flashRect.setAlpha(0.3);
      this.tweens.add({ targets:this.flashRect, alpha:0, duration:400 });
    });
    gs.events.on('p1eliminated', () => {
      this._setLiveIcons(this._p1Icons, 0);
      if (this.p1ElimTxt?.active) this.tweens.add({ targets:this.p1ElimTxt, alpha:1, duration:300 });
    });
    gs.events.on('p2eliminated', () => {
      this._setLiveIcons(this._p2Icons, 0);
      if (this.p2ElimTxt?.active) this.tweens.add({ targets:this.p2ElimTxt, alpha:1, duration:300 });
    });
  }
}
