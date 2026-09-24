import { LOOP } from "./config";

export type UpdateFn = (dt: number) => void;
export type RenderFn = (alpha: number) => void;

/**
 * requestAnimationFrame driver with a fixed simulation timestep
 * and an interpolation alpha for smooth rendering.
 */
export class Loop {
  private running = false;
  private rafId = 0;
  private lastMs = 0;
  private accumulator = 0;

  constructor(
    private readonly update: UpdateFn,
    private readonly render: RenderFn,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastMs = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (nowMs: number): void => {
    if (!this.running) return;

    let frameSec = (nowMs - this.lastMs) / 1000;
    this.lastMs = nowMs;

    // Clamp huge frame gaps (tab blur, etc.)
    if (frameSec > 0.25) frameSec = 0.25;

    this.accumulator += frameSec;

    let steps = 0;
    while (this.accumulator >= LOOP.fixedDt && steps < LOOP.maxSteps) {
      this.update(LOOP.fixedDt);
      this.accumulator -= LOOP.fixedDt;
      steps += 1;
    }

    if (steps === LOOP.maxSteps) {
      this.accumulator = 0;
    }

    const alpha = this.accumulator / LOOP.fixedDt;
    this.render(alpha);

    this.rafId = requestAnimationFrame(this.tick);
  };
}
