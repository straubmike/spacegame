/**
 * Canvas-relative pointer for galaxy chart selection.
 */
export class Pointer {
  x = 0;
  y = 0;
  private clickQueued = false;
  private wheelDelta = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  dispose(): void {
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("wheel", this.onWheel);
  }

  /** True once per click until consumed. */
  consumeClick(): boolean {
    if (!this.clickQueued) return false;
    this.clickQueued = false;
    return true;
  }

  /** Accumulated wheel deltaY (pixels) since last consume; 0 if none. */
  consumeWheel(): number {
    const d = this.wheelDelta;
    this.wheelDelta = 0;
    return d;
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

  private onWheel = (e: WheelEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.x = e.clientX - rect.left;
    this.y = e.clientY - rect.top;
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16; // lines → px
    else if (e.deltaMode === 2) dy *= rect.height; // pages → px
    this.wheelDelta += dy;
    e.preventDefault();
  };
}
