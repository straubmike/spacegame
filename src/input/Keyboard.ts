export interface InputState {
  thrust: boolean;
  reverse: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  /** held fire (Space) — autofire on cooldown */
  fire: boolean;
  /** held scoop (F) — collect scanned belt ore when equipped */
  scoop: boolean;
}

/**
 * Tracks WASD (and arrow) keys as held action flags,
 * plus one-shot edge presses for UI actions.
 */
export class Keyboard {
  readonly state: InputState = {
    thrust: false,
    reverse: false,
    turnLeft: false,
    turnRight: false,
    fire: false,
    scoop: false,
  };

  private readonly pressed = new Set<string>();
  private readonly edges = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("blur", this.clear);
  }

  dispose(target: Window = window): void {
    target.removeEventListener("keydown", this.onKeyDown);
    target.removeEventListener("keyup", this.onKeyUp);
    target.removeEventListener("blur", this.clear);
  }

  /** True once per keydown until consumed. */
  consume(code: string): boolean {
    if (!this.edges.has(code)) return false;
    this.edges.delete(code);
    return true;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this.pressed.add(e.code);
    this.edges.add(e.code);
    this.sync();

    if (
      e.code === "ArrowUp" ||
      e.code === "ArrowDown" ||
      e.code === "ArrowLeft" ||
      e.code === "ArrowRight" ||
      e.code === "Space" ||
      e.code === "Tab"
    ) {
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.pressed.delete(e.code);
    this.sync();
  };

  private clear = (): void => {
    this.pressed.clear();
    this.edges.clear();
    this.sync();
  };

  private sync(): void {
    const p = this.pressed;
    this.state.thrust = p.has("KeyW") || p.has("ArrowUp");
    this.state.reverse = p.has("KeyS") || p.has("ArrowDown");
    this.state.turnLeft = p.has("KeyA") || p.has("ArrowLeft");
    this.state.turnRight = p.has("KeyD") || p.has("ArrowRight");
    this.state.fire = p.has("Space");
    this.state.scoop = p.has("KeyF");
  }
}
