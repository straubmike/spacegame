import { COMBAT, FUEL, SHIP } from "../game/config";

export type StrandedPilotPhase = "drift" | "depart" | "gone";

/**
 * Friendly stranded ship for Fuel Rat “Answer distress” missions.
 * Left-click to donate fuel; after help they scoot off then hyperspace
 * (same escape pathing feel as pirate retreat).
 */
export class StrandedPilot {
  vx = 0;
  vy = 0;
  /** Drift gently until helped; then flee + warp. */
  heading: number;
  phase: StrandedPilotPhase = "drift";
  /** Set when retreat finishes — Game clears the entity. */
  warpedAway = false;

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
    return this.phase !== "gone" && !this.warpedAway;
  }

  /** Still interactive / mission-active (not mid-escape). */
  get canHelp(): boolean {
    return this.phase === "drift" && !this.warpedAway;
  }

  get radius(): number {
    return this.size * 0.55;
  }

  /** Player donated fuel — begin pirate-style scoot then hyperspace. */
  beginDepart(): void {
    if (this.phase !== "drift") return;
    this.phase = "depart";
  }

  update(dt: number, playerX?: number, playerY?: number): void {
    if (!this.alive) return;

    if (this.phase === "drift") {
      // Soft drift so they don't look frozen.
      this.vx *= Math.pow(SHIP.drag, dt * 60);
      this.vy *= Math.pow(SHIP.drag, dt * 60);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      return;
    }

    if (this.phase === "depart") {
      const px = playerX ?? this.x;
      const py = playerY ?? this.y;
      const dx = px - this.x;
      const dy = py - this.y;
      const dist = Math.hypot(dx, dy);
      const towardPlayer = Math.atan2(dy, dx);
      const away = towardPlayer + Math.PI;
      this.turnToward(away, dt);
      this.thrust(dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      // Match pirate escape distance so the scoot reads the same.
      if (dist >= COMBAT.pirateRetreatRange) {
        this.warpedAway = true;
        this.phase = "gone";
      }
    }
  }

  private turnToward(desired: number, dt: number): void {
    let delta = desired - this.heading;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const max = SHIP.turnRate * 0.9 * dt;
    if (delta > max) delta = max;
    if (delta < -max) delta = -max;
    this.heading += delta;
  }

  private thrust(dt: number): void {
    const accel = SHIP.thrustAccel * 1.05;
    this.vx += Math.cos(this.heading) * accel * dt;
    this.vy += Math.sin(this.heading) * accel * dt;
    const speed = Math.hypot(this.vx, this.vy);
    const cap = SHIP.maxSpeed * 0.95;
    if (speed > cap) {
      this.vx = (this.vx / speed) * cap;
      this.vy = (this.vy / speed) * cap;
    }
  }
}
