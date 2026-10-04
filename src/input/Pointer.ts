/**
 * Canvas-relative pointer for galaxy chart selection.
 */
export class Pointer {
  x = 0;
  y = 0;
  /** Weapon slot 2 — held, not a shared fire button. */
  leftHeld = false;
  /** Weapon slot 3 — held. No current hull has this hardpoint. */
  rightHeld = false;
  private clickQueued = false;
  private wheelDelta = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("contextmenu", this.onContextMenu);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
    window.addEventListener("blur", this.releaseHeld);
  }

  dispose(): void {
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    this.canvas.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onUp);
    window.removeEventListener("blur", this.releaseHeld);
  }

  /** Drop held mouse buttons (title / blur) so a click cannot stick a weapon on. */
  releaseHeld = (): void => {
    this.leftHeld = false;
    this.rightHeld = false;
  };

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

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private onDown = (e: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.x = e.clientX - rect.left;
    this.y = e.clientY - rect.top;
    if (e.button === 0) {
      this.leftHeld = true;
      this.clickQueued = true;
    } else if (e.button === 2) {
      this.rightHeld = true;
      e.preventDefault();
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (e.button === 0) this.leftHeld = false;
    else if (e.button === 2) this.rightHeld = false;
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
