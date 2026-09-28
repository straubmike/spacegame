import { FUEL, SHIP } from "../game/config";

/**
 * Friendly stranded ship for Fuel Rat “Answer distress” missions.
 * Left-click to donate fuel; Game handles the transfer + mission complete.
 */
export class StrandedPilot {
  vx = 0;
  vy = 0;
  /** Drift gently; no approach AI. */
  heading: number;
  helped = false;

  readonly fill = "#d4c48a";
  readonly stroke = "#a89050";
  readonly size = FUEL.ratSize;

  constructor(
    public x: number,
    public y: number,
    heading = 0,
  ) {
    this.heading = heading;
  }

  get alive(): boolean {
    return !this.helped;
  }

  get radius(): number {
    return this.size * 0.55;
  }

  update(dt: number): void {
    if (!this.alive) return;
    // Soft drift so they don't look frozen.
    this.vx *= Math.pow(SHIP.drag, dt * 60);
    this.vy *= Math.pow(SHIP.drag, dt * 60);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}
