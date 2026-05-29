const config = {
  type:            Phaser.AUTO,
  width:           GAME_W,
  height:          TOTAL_H,
  backgroundColor: '#000000',
  scene: [
    PreloadScene,
    MenuScene,
    GameScene,
    UIScene,
    NetworkGameScene,
    NetworkUIScene,
    GameOverScene,
    LeaderboardScene
  ],
  parent: 'game-container'
};
window.addEventListener('load', () => { new Phaser.Game(config); });
