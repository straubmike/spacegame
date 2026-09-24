import {
  COMBAT,
  PIRATE_TIERS,
  SHIP,
  type PirateTierId,
} from "../game/config";
import { spawnProjectile, type Projectile } from "./Projectile";

export type PirateMode = "idle" | "aggro" | "retreat";

/**
 * Hostile hull in a local encounter.
 * Fee / hail timing is owned by Game as one pack event — ships only fight
 * when the encounter stance is hostile (or after being attacked).
 */
export class Pirate {
  health: number;
  vx = 0;
  vy = 0;
  mode: PirateMode = "idle";
  fireCooldown = 0;
  /** Set when retreat finishes — Game removes on warp. */
  warpedAway = false;

  readonly tier: PirateTierId;
  /** Shared pack tribute (same value on every wingmate). */
  readonly fee: number;

  constructor(
    public x: number,
    public y: number,
    public heading: number,
    tier: PirateTierId = "raider",
    fee = 10,
  ) {
    this.tier = tier;
    this.fee = fee;
    this.health = PIRATE_TIERS[tier].maxHealth;
  }

  get alive(): boolean {
    return this.health > 0 && !this.warpedAway;
  }

  get maxHealth(): number {
    return PIRATE_TIERS[this.tier].maxHealth;
  }

  get size(): number {
    return PIRATE_TIERS[this.tier].size;
  }

  get radius(): number {
    return PIRATE_TIERS[this.tier].radius;
  }

  takeDamage(amount: number): void {
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 1 && this.health > 0) {
      this.mode = "retreat";
      return;
    }
    if (this.mode !== "retreat") {
      this.mode = "aggro";
    }
  }

  /** Stand down after pack tribute (or while the fee window is open). */
  setPeaceful(): void {
    if (this.mode === "retreat") return;
    this.mode = "idle";
  }

  goAggro(): void {
    if (!this.alive || this.mode === "retreat") return;
    this.mode = "aggro";
  }

  /**
   * Movement + combat. `hostile` is the pack encounter stance from Game.
   */
  update(
    dt: number,
    playerX: number,
    playerY: number,
    outShots: Projectile[],
    hostile: boolean,
  ): void {
    if (!this.alive) return;

    const stats = PIRATE_TIERS[this.tier];
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.hypot(dx, dy);
    const towardPlayer = Math.atan2(dy, dx);

    if (this.health <= 1) {
      this.mode = "retreat";
    } else if (this.mode === "retreat") {
      // stay fleeing
    } else if (hostile || this.mode === "aggro") {
      this.mode = "aggro";
    } else {
      this.mode = "idle";
    }

    if (this.mode === "idle") {
      this.applyDrag(dt);
      this.integrate(dt);
      return;
    }

    if (this.mode === "retreat") {
      const away = towardPlayer + Math.PI;
      this.turnToward(away, dt);
      this.thrust(dt);
      this.integrate(dt);
      if (dist >= COMBAT.pirateRetreatRange) {
        this.warpedAway = true;
      }
      return;
    }

    // aggro
    this.turnToward(towardPlayer, dt);

    if (dist > COMBAT.pirateEngageRange) {
      this.thrust(dt);
    } else {
      this.applyDrag(dt);
    }

    this.integrate(dt);

    const angleErr = Math.abs(shortestAngle(this.heading, towardPlayer));
    if (
      this.fireCooldown <= 0 &&
      angleErr <= COMBAT.pirateFireCone &&
      dist <= COMBAT.pirateThreatRange
    ) {
      outShots.push(
        spawnProjectile(
          this.x,
          this.y,
          this.heading,
          stats.size,
          true,
          stats.damage,
        ),
      );
      this.fireCooldown = COMBAT.pirateFireCooldown * stats.fireCooldownMul;
    }
  }

  private turnToward(desired: number, dt: number): void {
    let delta = shortestAngle(this.heading, desired);
    const maxStep =
      COMBAT.pirateTurnRate * PIRATE_TIERS[this.tier].turnRateMul * dt;
    if (delta > maxStep) delta = maxStep;
    if (delta < -maxStep) delta = -maxStep;
    this.heading += delta;
  }

  private thrust(dt: number): void {
    const accel = SHIP.thrustAccel * PIRATE_TIERS[this.tier].speedFactor;
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
    const max = SHIP.maxSpeed * PIRATE_TIERS[this.tier].speedFactor;
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
