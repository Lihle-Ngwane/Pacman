

class PreloadScene extends Phaser.Scene {
  constructor() { super({ key: 'PreloadScene' }); }

  create() {
    this._makePacFrames();
    this._makeGhosts();
    this._makeDots();
    this._makePowerUps();   // NEW — speed, freeze, reveal
    this._makeFruits();
    this._makeUI();
    this.scene.start('MenuScene');
  }

  _makePacFrames() {
    const S = TILE, R = S/2 - 1;
    this._drawPac('pac_open',   S, R, 30);
    this._drawPac('pac_half',   S, R, 15);
    this._drawPacClosed('pac_closed', S, R);
  }

  _drawPac(key, S, R, mouthDeg) {
    const g = this._g();
    g.fillStyle(0xffd700);
    g.beginPath();
    g.moveTo(S/2, S/2);
    g.arc(S/2, S/2, R, Phaser.Math.DegToRad(mouthDeg), Phaser.Math.DegToRad(360-mouthDeg), false);
    g.closePath(); g.fillPath();
    g.generateTexture(key, S, S); g.destroy();
  }

  _drawPacClosed(key, S, R) {
    const g = this._g();
    g.fillStyle(0xffd700); g.fillCircle(S/2, S/2, R);
    g.generateTexture(key, S, S); g.destroy();
  }

  _makeGhosts() {
    const cols = { blinky:0xff0000, pinky:0xffb8ff, inky:0x00ffff, clyde:0xffb847 };
    for (const [type, col] of Object.entries(cols)) this._drawGhost(`g_${type}`, col, false, false);
    this._drawGhost('g_fright',  0x2121de, true,  false);
    this._drawGhost('g_fright2', 0xffffff, true,  true);
    this._drawEyes('g_eyes');
  }

  _drawGhost(key, bodyCol, frightened, flash) {
    const S = TILE, g = this._g();
    g.fillStyle(bodyCol);
    g.fillCircle(S/2, S/2, S/2-1);
    g.fillRect(1, S/2, S-2, S/2-4);
    g.fillCircle(S/6, S-3, S/6); g.fillCircle(S/2, S-3, S/6); g.fillCircle(5*S/6, S-3, S/6);
    if (!frightened) {
      g.fillStyle(0xffffff); g.fillEllipse(6,9,7,8); g.fillEllipse(14,9,7,8);
      g.fillStyle(0x0000bb); g.fillEllipse(7,10,4,5); g.fillEllipse(15,10,4,5);
    } else if (!flash) {
      const fc = 0xffaaaa;
      g.fillStyle(fc);
      [4,12].forEach(x => { g.fillRect(x,7,2,2); g.fillRect(x+4,9,2,2); });
      [4,12].forEach(x => { g.fillRect(x,14,2,2); g.fillRect(x+4,12,2,2); });
    } else {
      g.fillStyle(0x2121de);
      [4,12].forEach(x => { g.fillRect(x,7,2,2); g.fillRect(x+4,9,2,2); });
      [4,12].forEach(x => { g.fillRect(x,14,2,2); g.fillRect(x+4,12,2,2); });
    }
    g.generateTexture(key, S, S); g.destroy();
  }

  _drawEyes(key) {
    const S = TILE, g = this._g();
    g.fillStyle(0xffffff); g.fillEllipse(6,9,7,8); g.fillEllipse(14,9,7,8);
    g.fillStyle(0x0000bb); g.fillEllipse(7,10,4,5); g.fillEllipse(15,10,4,5);
    g.generateTexture(key, S, S); g.destroy();
  }

  _makeDots() {
    const S = TILE;
    const dg = this._g(); dg.fillStyle(0xffb8ff); dg.fillCircle(S/2,S/2,2);
    dg.generateTexture('dot', S, S); dg.destroy();

    const pg = this._g(); pg.fillStyle(0xffb8ff); pg.fillCircle(S/2,S/2,6);
    pg.generateTexture('pellet', S, S); pg.destroy();
  }

  _makePowerUps() {
    const S = TILE;

    // Speed boost — lightning bolt shape (orange)
    const sg = this._g();
    sg.fillStyle(0xff8800);
    sg.fillTriangle(12,2, 6,11, 10,11);
    sg.fillTriangle(10,9, 14,9, 8,18);
    sg.generateTexture('pu_speed', S, S); sg.destroy();

    // Freeze — snowflake shape (cyan)
    const fg = this._g();
    fg.fillStyle(0x00ddff);
    fg.fillRect(9,2,2,16);   // vertical
    fg.fillRect(2,9,16,2);   // horizontal
    fg.fillRect(4,4,2,2); fg.fillRect(14,4,2,2);   // diag arms
    fg.fillRect(4,14,2,2); fg.fillRect(14,14,2,2);
    fg.generateTexture('pu_freeze', S, S); fg.destroy();

    // Reveal — eye shape (yellow/white)
    const rg = this._g();
    rg.fillStyle(0xffd700);
    rg.fillEllipse(S/2,S/2,16,10);
    rg.fillStyle(0x000000);
    rg.fillCircle(S/2,S/2,3);
    rg.fillStyle(0xffffff);
    rg.fillCircle(S/2-1,S/2-1,1);
    rg.generateTexture('pu_reveal', S, S); rg.destroy();
  }

  _makeFruits() {
    const S = TILE;
    const cg = this._g();
    cg.fillStyle(0x00aa00); cg.fillRect(8,1,2,5); cg.fillRect(12,1,2,5);
    cg.fillStyle(0xcc0000); cg.fillCircle(7,12,6); cg.fillStyle(0xdd2222); cg.fillCircle(14,12,6);
    cg.generateTexture('cherry', S, S); cg.destroy();

    const sg = this._g();
    sg.fillStyle(0xdd1111); sg.fillCircle(S/2,12,7);
    sg.fillStyle(0x00aa00); sg.fillCircle(S/2-3,5,3); sg.fillCircle(S/2+3,5,3); sg.fillCircle(S/2,4,3);
    sg.fillStyle(0xffcc00); sg.fillCircle(7,10,1); sg.fillCircle(13,10,1); sg.fillCircle(10,14,1);
    sg.generateTexture('strawberry', S, S); sg.destroy();

    const lg = this._g();
    lg.fillStyle(0x00cc44); lg.fillRect(7,2,6,16); lg.fillRect(2,7,16,6);
    lg.fillStyle(0xffffff); lg.fillRect(8,3,4,14); lg.fillRect(3,8,14,4);
    lg.generateTexture('life_pack', S, S); lg.destroy();
  }

  _makeUI() {
    const S = TILE-2, g = this._g();
    g.fillStyle(0xffd700);
    g.beginPath(); g.moveTo(S/2,S/2);
    g.arc(S/2,S/2,S/2-1,Phaser.Math.DegToRad(30),Phaser.Math.DegToRad(330),false);
    g.closePath(); g.fillPath();
    g.generateTexture('life_icon', S, S); g.destroy();
  }

  _g() { return this.make.graphics({ x:0, y:0, add:false }); }
}
