import { Game } from "./game/Game";

const canvas = document.getElementById("game");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("#game canvas not found");
}

const game = new Game(canvas);
game.start();
