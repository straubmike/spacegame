/**
 * Canvas-relative pointer for galaxy chart selection.
 */
export class Pointer {
  x = 0;
  y = 0;
  private clickQueued = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerdown", this.onDown);
  }

  dispose(): void {
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerdown", this.onDown);
  }

  /** True once per click until consumed. */
  consumeClick(): boolean {
    if (!this.clickQueued) return false;
    this.clickQueued = false;
    return true;
  }

  private onMove = (e: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.x = e.clientX - rect.left;
    this.y = e.clientY - rect.top;
  };

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const rect = this.canvas.getBoundingClientRect();
    this.x = e.clientX - rect.left;
    this.y = e.clientY - rect.top;
    this.clickQueued = true;
  };
}
