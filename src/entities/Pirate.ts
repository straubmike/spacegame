import {
  COMBAT,
  PIRATE_TIERS,
  SHIP,
  type PirateTierId,
} from "../game/config";
import { spawnProjectile, type Projectile } from "./Projectile";

export type PirateMode = "idle" | "comms" | "aggro" | "retreat";

/**
 * Hostile ship: demands a fee (comms) before attacking.
 * Paid pirates stay peaceful unless attacked.
 * Hull tier drives HP, speed, fire rate, and shot damage.
 */
export class Pirate {
  health: number;
  vx = 0;
  vy = 0;
  mode: PirateMode = "idle";
  fireCooldown = 0;
  /** Set when retreat finishes — Game removes on warp. */
  warpedAway = false;

  /** Player has already been asked once this encounter. */
  feeDemanded = false;
  /** Player paid; leave them alone unless attacked. */
  feePaid = false;
  /** Seconds remaining while waiting for payment. */
  commsTimer = 0;

  readonly tier: PirateTierId;
  /** Group tribute for this encounter (shared by wingmates). */
  readonly fee: number;

  constructor(
    public x: number,
    public y: number,
    public heading: number,
    tier: PirateTierId = "raider",
    feePaid = false,
    fee = 10,
  ) {
    this.tier = tier;
    this.fee = fee;
    const stats = PIRATE_TIERS[tier];
    this.health = stats.maxHealth;
    this.feePaid = feePaid;
    if (feePaid) this.feeDemanded = true;
  }

  get alive(): boolean {
    return this.health > 0 && !this.warpedAway;
  }

  get acceptingPayment(): boolean {
    return this.alive && this.mode === "comms" && !this.feePaid;
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
      this.commsTimer = 0;
      return;
    }
    // Defend even after tribute — payment is not a free shooting gallery
    if (this.mode !== "retreat") {
      this.mode = "aggro";
      this.commsTimer = 0;
    }
  }

  /** Accept tribute; returns to idle and ignores the player until attacked. */
  acceptPayment(): void {
    this.feePaid = true;
    this.feeDemanded = true;
    this.commsTimer = 0;
    this.mode = "idle";
  }

  /**
   * Join the shared pack fee-event (comms window).
   * Wingmates must share this state so they do not free-fire during dialogue.
   */
  beginFeeEvent(timer: number = COMBAT.pirateCommsTimeout): void {
    if (!this.alive || this.feePaid) return;
    if (this.mode === "retreat" || this.mode === "aggro") return;
    this.feeDemanded = true;
    this.mode = "comms";
    this.commsTimer = timer;
  }

  /** Keep this ship on the shared fee-event timer while the pack is hailing. */
  syncFeeEvent(timer: number): void {
    if (!this.alive || this.feePaid) return;
    if (this.mode === "retreat" || this.mode === "aggro") return;
    this.feeDemanded = true;
    this.mode = "comms";
    this.commsTimer = timer;
  }

  /** Force aggro (e.g. wingmate was attacked / fee event timed out). */
  goAggro(): void {
    if (!this.alive || this.mode === "retreat") return;
    this.mode = "aggro";
    this.commsTimer = 0;
  }

  /**
   * Update AI + movement. Returns true the frame a fee demand begins.
   */
  update(
    dt: number,
    playerX: number,
    playerY: number,
    outShots: Projectile[],
  ): boolean {
    if (!this.alive) return false;

    const stats = PIRATE_TIERS[this.tier];
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.hypot(dx, dy);
    const inRange = dist <= COMBAT.pirateThreatRange;
    const towardPlayer = Math.atan2(dy, dx);
    let justDemanded = false;

    if (this.health <= 1) {
      this.mode = "retreat";
    } else if (this.mode === "retreat") {
      // stay in retreat
    } else if (this.mode === "aggro") {
      // stay aggro (including after a paid pirate was attacked)
    } else if (this.feePaid) {
      // Paid and not attacked — ignore the player
      this.mode = "idle";
    } else if (this.mode === "comms") {
      this.commsTimer = Math.max(0, this.commsTimer - dt);
      if (this.commsTimer <= 0) {
        if (inRange) {
          this.mode = "aggro";
        } else {
          this.mode = "idle";
        }
      }
    } else if (inRange) {
      if (!this.feeDemanded) {
        this.feeDemanded = true;
        this.mode = "comms";
        this.commsTimer = COMBAT.pirateCommsTimeout;
        justDemanded = true;
      } else {
        this.mode = "aggro";
      }
    }

    if (this.mode === "idle" || this.mode === "comms") {
      this.applyDrag(dt);
      this.integrate(dt);
      return justDemanded;
    }

    if (this.mode === "retreat") {
      const away = towardPlayer + Math.PI;
      this.turnToward(away, dt);
      this.thrust(dt);
      this.integrate(dt);
      if (dist >= COMBAT.pirateRetreatRange) {
        this.warpedAway = true;
      }
      return justDemanded;
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

    return justDemanded;
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
