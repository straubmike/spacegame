export class Camera {
  x = 0;
  y = 0;

  follow(targetX: number, targetY: number): void {
    this.x = targetX;
    this.y = targetY;
  }

  /** World → screen (canvas pixel coords). */
  worldToScreen(
    wx: number,
    wy: number,
    canvasWidth: number,
    canvasHeight: number,
  ): { x: number; y: number } {
    return {
      x: wx - this.x + canvasWidth / 2,
      y: wy - this.y + canvasHeight / 2,
    };
  }

  /** Screen → world. */
  screenToWorld(
    sx: number,
    sy: number,
    canvasWidth: number,
    canvasHeight: number,
  ): { x: number; y: number } {
    return {
      x: sx - canvasWidth / 2 + this.x,
      y: sy - canvasHeight / 2 + this.y,
    };
  }
}
