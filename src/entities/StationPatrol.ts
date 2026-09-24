import { COMBAT, PATROL, SHIP } from "../game/config";
import { spawnProjectile, type Projectile } from "./Projectile";
import type { Pirate } from "./Pirate";

type PatrolStance = "idle" | "wander" | "hunt";

/**
 * Station-affiliated patrol hull.
 * Mostly idle like pirates (stable, clickable). Between hunts it sometimes
 * flies a single leg to a random destination — often farther out to meet
 * incoming pirates, sometimes nearer the station so it doesn't permanently
 * stray. No diamond/orbit loops.
 */
export class StationPatrol {
  health: number;
  vx = 0;
  vy = 0;
  heading: number;
  fireCooldown = 0;

  private stance: PatrolStance = "idle";
  /** Countdown while idle before starting a wander leg. */
  private stanceTimer: number;
  private wanderTarget: { x: number; y: number } | null = null;

  constructor(
    public x: number,
    public y: number,
    heading: number,
    /** Host station landmark id (local view). */
    public readonly stationId: number,
    public readonly stationName: string,
    /** Stable station key for reputation / fines. */
    public readonly stationKey: string,
    public readonly homeX: number,
    public readonly homeY: number,
  ) {
    this.heading = heading;
    this.health = PATROL.maxHealth;
    this.stanceTimer =
      PATROL.idleHoldMin +
      Math.random() * (PATROL.idleHoldMax - PATROL.idleHoldMin);
  }

  get alive(): boolean {
    return this.health > 0;
  }

  get size(): number {
    return PATROL.size;
  }

  get radius(): number {
    return PATROL.radius;
  }

  get maxHealth(): number {
    return PATROL.maxHealth;
  }

  takeDamage(amount: number): void {
    this.health = Math.max(0, this.health - amount);
  }

  /**
   * Hunt nearest pirate when in range; otherwise idle or one-leg wander.
   * Shots are non-hostile (hurt pirates like player fire; never the player).
   */
  update(
    dt: number,
    pirates: readonly Pirate[],
    outShots: Projectile[],
  ): void {
    if (!this.alive) return;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    const target = this.nearestPirate(pirates);
    if (target) {
      this.stance = "hunt";
      this.wanderTarget = null;
      this.chaseAndFire(dt, target.x, target.y, outShots);
      return;
    }

    if (this.stance === "hunt") {
      this.enterIdle();
    }

    if (this.stance === "wander" && this.wanderTarget) {
      this.cruiseToward(dt, this.wanderTarget);
      return;
    }

    // Idle: pirate-like sit still, then maybe pick a random wander leg.
    this.stanceTimer = Math.max(0, this.stanceTimer - dt);
    if (this.stanceTimer <= 0) {
      this.enterWander();
      if (this.wanderTarget) {
        this.cruiseToward(dt, this.wanderTarget);
        return;
      }
    }

    this.applyDrag(dt);
    this.integrate(dt);
  }

  private enterIdle(): void {
    this.stance = "idle";
    this.wanderTarget = null;
    this.stanceTimer =
      PATROL.idleHoldMin +
      Math.random() * (PATROL.idleHoldMax - PATROL.idleHoldMin);
    this.vx = 0;
    this.vy = 0;
  }

  /** One random destination — near or far — then back to idle on arrival. */
  private enterWander(): void {
    this.stance = "wander";
    this.wanderTarget = this.pickWanderPoint();
  }

  private pickWanderPoint(): { x: number; y: number } {
    const near = Math.random() < PATROL.wanderNearChance;
    const min = near ? PATROL.wanderNearMin : PATROL.wanderFarMin;
    const max = near ? PATROL.wanderNearMax : PATROL.wanderFarMax;
    const dist = min + Math.random() * (max - min);
    const angle = Math.random() * Math.PI * 2;
    return {
      x: this.homeX + Math.cos(angle) * dist,
      y: this.homeY + Math.sin(angle) * dist,
    };
  }

  private nearestPirate(pirates: readonly Pirate[]): Pirate | null {
    let best: Pirate | null = null;
    let bestDist: number = PATROL.huntRange;
    for (const p of pirates) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - this.x, p.y - this.y);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  private chaseAndFire(
    dt: number,
    tx: number,
    ty: number,
    outShots: Projectile[],
  ): void {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    const toward = Math.atan2(dy, dx);
    this.turnToward(toward, dt);

    if (dist > PATROL.engageRange) {
      this.thrust(dt);
    } else {
      this.applyDrag(dt);
    }
    this.integrate(dt);

    const angleErr = Math.abs(shortestAngle(this.heading, toward));
    if (
      this.fireCooldown <= 0 &&
      angleErr <= COMBAT.pirateFireCone &&
      dist <= PATROL.huntRange
    ) {
      outShots.push(
        spawnProjectile(
          this.x,
          this.y,
          this.heading,
          PATROL.size,
          false,
          PATROL.damage,
        ),
      );
      this.fireCooldown = PATROL.fireCooldown;
    }
  }

  /** Slow straight leg to one arbitrary destination — then idle. */
  private cruiseToward(dt: number, wp: { x: number; y: number }): void {
    const dx = wp.x - this.x;
    const dy = wp.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= PATROL.waypointArrive) {
      this.enterIdle();
      this.applyDrag(dt);
      this.integrate(dt);
      return;
    }

    const desired = Math.atan2(dy, dx);
    this.turnToward(desired, dt);

    const angleErr = Math.abs(shortestAngle(this.heading, desired));
    if (angleErr < 0.45) {
      const speed = PATROL.wanderSpeed;
      this.vx = Math.cos(this.heading) * speed;
      this.vy = Math.sin(this.heading) * speed;
    } else {
      this.applyDrag(dt);
    }
    this.integrate(dt);
  }

  private turnToward(desired: number, dt: number): void {
    let delta = shortestAngle(this.heading, desired);
    const maxStep = COMBAT.pirateTurnRate * PATROL.turnRateMul * dt;
    if (delta > maxStep) delta = maxStep;
    if (delta < -maxStep) delta = -maxStep;
    this.heading += delta;
  }

  private thrust(dt: number): void {
    const accel = SHIP.thrustAccel * PATROL.speedFactor;
    this.vx += Math.cos(this.heading) * accel * dt;
    this.vy += Math.sin(this.heading) * accel * dt;
    this.clampSpeed();
  }

  private applyDrag(dt: number): void {
    const dragFactor = Math.pow(SHIP.drag, dt * 60);
    this.vx *= dragFactor;
    this.vy *= dragFactor;
  }

  private clampSpeed(): void {
    const max = SHIP.maxSpeed * PATROL.speedFactor;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > max) {
      const s = max / speed;
      this.vx *= s;
      this.vy *= s;
    }
  }

  private integrate(dt: number): void {
    this.clampSpeed();
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}

function shortestAngle(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
