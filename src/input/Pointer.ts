/**
 * Canvas-relative pointer.
 *
 * Chorded mouse buttons (left held, then right, or the reverse) do not get
 * a second pointerdown / pointerup. The Pointer Events spec delivers that
 * change as a pointermove whose `buttons` mask gained or lost a bit.
 * Reading only `pointerdown`'s `button` drops the second button.
 *
 * A press that starts while a menu is open is spent on that menu. Weapons
 * ignore it until the button is actually released, so closing the chart,
 * the system panel, or launching from a dock does not fire.
 */
export class Pointer {
  x = 0;
  y = 0;
  /** Physical left button, including a press that UI already used. */
  leftHeld = false;
  /** Physical right button. */
  rightHeld = false;
  private clickQueued = false;
  private wheelDelta = 0;
  /** Press began over UI; weapons skip it until that button releases. */
  private leftUiLatch = false;
  private rightUiLatch = false;
  private activePointerId: number | null = null;
  private uiOpen: () => boolean = () => false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("contextmenu", this.onSuppressClick);
    canvas.addEventListener("auxclick", this.onSuppressClick);
    canvas.addEventListener("dragstart", this.onSuppressClick);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    // Chord updates and releases still arrive if the cursor leaves the canvas.
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
    window.addEventListener("blur", this.releaseHeld);
  }

  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("contextmenu", this.onSuppressClick);
    this.canvas.removeEventListener("auxclick", this.onSuppressClick);
    this.canvas.removeEventListener("dragstart", this.onSuppressClick);
    this.canvas.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onUp);
    window.removeEventListener("blur", this.releaseHeld);
  }

  /** Game reports menus, the chart, the dock screen, and other modal UI. */
  setUiOpen(isOpen: () => boolean): void {
    this.uiOpen = isOpen;
  }

  /** Slot 2. False for the click that opened or dismissed a menu. */
  get fireLeft(): boolean {
    return this.leftHeld && !this.leftUiLatch;
  }

  /** Slot 3. False for a press that started on UI. */
  get fireRight(): boolean {
    return this.rightHeld && !this.rightUiLatch;
  }

  /** Drop held mouse buttons (title / blur) so a click cannot stick a weapon on. */
  releaseHeld = (): void => {
    this.leftHeld = false;
    this.rightHeld = false;
    this.leftUiLatch = false;
    this.rightUiLatch = false;
    this.activePointerId = null;
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

  private onSuppressClick = (e: Event): void => {
    e.preventDefault();
  };

  private onDown = (e: PointerEvent): void => {
    // Cancelling pointerdown blocks compatibility mouse click / contextmenu
    // from turning a two-button hold into a middle-click or a forced release.
    e.preventDefault();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture is best-effort; button state still comes from `buttons`.
    }
    this.track(e);
    this.syncButtons(e);
  };

  private onMove = (e: PointerEvent): void => {
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) {
      return;
    }
    this.track(e);
    // A second button while one is already down is reported here, not as pointerdown.
    this.syncButtons(e);
  };

  private onUp = (e: PointerEvent): void => {
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) {
      return;
    }
    if (e.type === "pointercancel") {
      this.releaseHeld();
      return;
    }
    this.syncButtons(e);
  };

  private track(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.x = e.clientX - rect.left;
    this.y = e.clientY - rect.top;
  }

  /**
   * `buttons` is the mask after the event: bit 1 left, bit 2 right.
   * `button` on a chord names which bit changed, and is not a full picture.
   */
  private syncButtons(e: PointerEvent): void {
    const nextLeft = (e.buttons & 1) !== 0;
    const nextRight = (e.buttons & 2) !== 0;
    if ((nextLeft || nextRight) && this.activePointerId === null) {
      this.activePointerId = e.pointerId;
    }

    if (!this.leftHeld && nextLeft) {
      this.clickQueued = true;
      if (this.uiOpen()) this.leftUiLatch = true;
    }
    if (!this.rightHeld && nextRight && this.uiOpen()) {
      this.rightUiLatch = true;
    }

    this.leftHeld = nextLeft;
    this.rightHeld = nextRight;
    if (!nextLeft) this.leftUiLatch = false;
    if (!nextRight) this.rightUiLatch = false;
    if (!nextLeft && !nextRight) this.activePointerId = null;
  }

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
