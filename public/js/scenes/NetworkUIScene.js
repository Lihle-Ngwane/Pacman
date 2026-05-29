// ============================================================
// scenes/NetworkUIScene.js
// HUD for online multiplayer — mirrors UIScene but listens to
// NetworkGameScene events instead of GameScene events.
// ============================================================

class NetworkUIScene extends Phaser.Scene {
  constructor() { super({ key: 'NetworkUIScene' }); }

  static get EVENTS() {
    return ['score','score2','lives','lives2','level'];
  }

  create() {
    const W  = GAME_W;
    const gs = this.scene.get('NetworkGameScene');

    NetworkUIScene.EVENTS.forEach(ev => gs.events.removeAllListeners(ev));

    this.add.rectangle(W/2, UI_H/2, W, UI_H, 0x000000);

    // P1 left
    this.add.text(8, 4, 'P1', { fontSize:'8px', fontFamily:'monospace', color:'#ffd700' });
    this.scoreVal = this.add.text(8, 14, '0', { fontSize:'13px', fontFamily:'monospace', color:'#ffd700' });

    // Center level
    this.add.text(W/2, 4, 'LEVEL', { fontSize:'8px', fontFamily:'monospace', color:'#aaa' }).setOrigin(0.5, 0);
    this.levelVal = this.add.text(W/2, 16, '1', { fontSize:'13px', fontFamily:'monospace', color:'#fff' }).setOrigin(0.5, 0);

    // P2 right
    this.add.text(W-8, 4, 'P2', { fontSize:'8px', fontFamily:'monospace', color:'#00ffff' }).setOrigin(1, 0);
    this.scoreVal2 = this.add.text(W-8, 14, '0', { fontSize:'13px', fontFamily:'monospace', color:'#00ffff' }).setOrigin(1, 0);

    // Lives
    this._p1Icons = this._makeIcons(8, 44, 1, null);
    this._p2Icons = this._makeIcons(W-8, 44, -1, 0x00ffff);
    this._setIcons(this._p1Icons, 3);
    this._setIcons(this._p2Icons, 3);

    // Listeners
    gs.events.on('score',  s => { if (this.scoreVal?.active) this.scoreVal.setText(String(s)); });
    gs.events.on('score2', s => { if (this.scoreVal2?.active) this.scoreVal2.setText(String(s)); });
    gs.events.on('lives',  n => this._setIcons(this._p1Icons, n));
    gs.events.on('lives2', n => this._setIcons(this._p2Icons, n));
    gs.events.on('level',  n => { if (this.levelVal?.active) this.levelVal.setText(String(n)); });

    this.events.once('shutdown', () => {
      const ngs = this.scene.get('NetworkGameScene');
      if (ngs) NetworkUIScene.EVENTS.forEach(ev => ngs.events.removeAllListeners(ev));
    });
  }

  _makeIcons(startX, y, dir, tint) {
    const icons = [];
    for (let i = 0; i < MAX_LIVES; i++) {
      const ico = this.add.image(startX + dir*i*18, y, 'life_icon')
        .setOrigin(dir > 0 ? 0 : 1, 0.5).setAlpha(0);
      if (tint) ico.setTint(tint);
      icons.push(ico);
    }
    return icons;
  }

  _setIcons(icons, n) {
    icons?.forEach((ico, i) => { if (ico?.active) ico.setAlpha(i < n ? 1 : 0); });
  }
}
