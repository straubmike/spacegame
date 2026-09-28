import { Game } from "./game/Game";

function showBootError(err: unknown): void {
  const message = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
  const pre = document.createElement("pre");
  pre.textContent = `Boot failed:\n${message}`;
  pre.style.cssText =
    "position:fixed;inset:0;margin:0;padding:16px;background:#12080a;color:#ffb4b4;font:13px/1.4 ui-monospace,monospace;white-space:pre-wrap;z-index:9999;overflow:auto";
  document.body.appendChild(pre);
  console.error(err);
}

try {
  const canvas = document.getElementById("game");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("#game canvas not found");
  }

  const game = new Game(canvas);
  game.start();
  document.title = "Space Game";
} catch (err) {
  showBootError(err);
}
