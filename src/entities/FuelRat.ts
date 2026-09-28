import { FUEL, SHIP } from "../game/config";

export type FuelRatPhase = "approach" | "comms" | "refuel" | "depart" | "gone";

/**
 * Friendly rescuer — light green hull, greets on arrival, tops up fuel
 * enough to reach the nearest station, then warps out.
 */
export class FuelRat {
  vx = 0;
  vy = 0;
  phase: FuelRatPhase = "approach";
  /** Seconds spent in current phase. */
  timer = 0;
  warpedAway = false;
  /** Set by Game when refuel fires (comms text already pushed). */
  didRefuel = false;

  readonly fill = FUEL.ratFill;
  readonly stroke = FUEL.ratStroke;
  readonly size = FUEL.ratSize;

  constructor(
    public x: number,
    public y: number,
    public heading: number,
  ) {}

  get alive(): boolean {
    return !this.warpedAway;
  }

  get radius(): number {
    return this.size * 0.55;
  }

  update(dt: number, playerX: number, playerY: number): void {
    if (!this.alive) return;
    this.timer += dt;

    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.hypot(dx, dy);
    const toward = Math.atan2(dy, dx);

    if (this.phase === "approach") {
      this.turnToward(toward, dt);
      this.thrust(dt, SHIP.thrustAccel * 0.7);
      this.integrate(dt);
      if (dist < FUEL.ratCommsRange || this.timer > 8) {
        this.phase = "comms";
        this.timer = 0;
        this.vx *= 0.3;
        this.vy *= 0.3;
      }
      return;
    }

    if (this.phase === "comms") {
      this.applyDrag(dt);
      this.integrate(dt);
      if (this.timer >= FUEL.ratCommsSeconds) {
        this.phase = "refuel";
        this.timer = 0;
      }
      return;
    }

    if (this.phase === "refuel") {
      this.applyDrag(dt);
      this.integrate(dt);
      if (this.timer >= 0.4) {
        this.phase = "depart";
        this.timer = 0;
      }
      return;
    }

    if (this.phase === "depart") {
      const away = toward + Math.PI;
      this.turnToward(away, dt);
      this.thrust(dt, SHIP.thrustAccel * 1.1);
      this.integrate(dt);
      if (dist >= FUEL.ratDepartRange || this.timer > 6) {
        this.warpedAway = true;
        this.phase = "gone";
      }
    }
  }

  private turnToward(desired: number, dt: number): void {
    let delta = desired - this.heading;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const max = SHIP.turnRate * 0.85 * dt;
    if (delta > max) delta = max;
    if (delta < -max) delta = -max;
    this.heading += delta;
  }

  private thrust(dt: number, accel: number): void {
    this.vx += Math.cos(this.heading) * accel * dt;
    this.vy += Math.sin(this.heading) * accel * dt;
    const speed = Math.hypot(this.vx, this.vy);
    const cap = SHIP.maxSpeed * 0.85;
    if (speed > cap) {
      this.vx = (this.vx / speed) * cap;
      this.vy = (this.vy / speed) * cap;
    }
  }

  private applyDrag(dt: number): void {
    const drag = Math.pow(SHIP.drag, dt * 60);
    this.vx *= drag;
    this.vy *= drag;
  }

  private integrate(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}
