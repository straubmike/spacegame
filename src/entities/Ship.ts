import { SHIP, COMBAT, DOCK, ECONOMY } from "../game/config";
import type { InputState } from "../input/Keyboard";
import { ShipLoadout } from "../ship/Loadout";
import { CargoHold } from "../ship/CargoHold";

export class Ship {
  x = 0;
  y = 0;
  /** radians; 0 = nose pointing +X (right) */
  heading = -Math.PI / 2;
  vx = 0;
  vy = 0;
  health: number = COMBAT.maxHealth;
  /** Current shield HP (0 when no shield module). */
  shield = 0;
  /** Seconds since last hull or shield damage. */
  private timeSinceDamage = Number.POSITIVE_INFINITY;
  credits: number = ECONOMY.startingCredits;
  readonly loadout = new ShipLoadout();
  readonly cargo = new CargoHold();

  prevX = 0;
  prevY = 0;
  prevHeading = this.heading;

  constructor() {
    this.syncDerivedStats({ refillShield: true });
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  get alive(): boolean {
    return this.health > 0;
  }

  get maxHull(): number {
    return COMBAT.maxHealth + (this.loadout.utility?.hullBonus ?? 0);
  }

  get maxShield(): number {
    return this.loadout.utility?.shieldMax ?? 0;
  }

  get missingHealth(): number {
    return Math.max(0, this.maxHull - this.health);
  }

  get passengerCapacity(): number {
    return this.loadout.utility?.passengerCapacity ?? 0;
  }

  /**
   * Recompute hull/shield/cargo caps from the utility slot.
   * Call after any utility equip change.
   * Hull max gains raise current HP by the same amount (no free full heal).
   */
  syncDerivedStats(
    opts: { refillShield?: boolean; previousMaxHull?: number } = {},
  ): void {
    const prevMaxHull = opts.previousMaxHull ?? this.maxHull;
    const util = this.loadout.utility;
    const nextMaxHull = COMBAT.maxHealth + (util?.hullBonus ?? 0);
    const hullGain = Math.max(0, nextMaxHull - prevMaxHull);

    if (hullGain > 0) {
      this.health += hullGain;
    }
    this.health = Math.min(this.health, nextMaxHull);

    this.cargo.setCapacity(util?.cargoCapacity ?? 0);

    if ((util?.shieldMax ?? 0) <= 0) {
      this.shield = 0;
    } else if (opts.refillShield) {
      this.shield = util!.shieldMax;
    } else {
      this.shield = Math.min(this.shield, util!.shieldMax);
    }
  }

  /** Place ship after hyperspace; clears velocity. Does not refill health/credits. */
  arriveAt(x: number, y: number, heading = -Math.PI / 2): void {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.heading = heading;
    this.prevHeading = heading;
    this.vx = 0;
    this.vy = 0;
  }

  /**
   * Repair as much hull as credits allow (1 cr per HP).
   * Successful repair also refills weapon ammo, warp charges, and shields.
   */
  repairWithCredits(): { healed: number; cost: number } {
    const missing = this.missingHealth;
    if (missing <= 0) return { healed: 0, cost: 0 };
    const affordable = Math.min(
      missing,
      Math.floor(this.credits / ECONOMY.repairCostPerHp),
    );
    if (affordable <= 0) return { healed: 0, cost: 0 };
    const cost = affordable * ECONOMY.repairCostPerHp;
    this.credits -= cost;
    this.health += affordable;
    this.loadout.refillConsumables();
    if (this.maxShield > 0) this.shield = this.maxShield;
    this.timeSinceDamage = Number.POSITIVE_INFINITY;
    return { healed: affordable, cost };
  }

  spendCredits(amount: number): boolean {
    if (this.credits < amount) return false;
    this.credits -= amount;
    return true;
  }

  addCredits(amount: number): void {
    if (amount <= 0) return;
    this.credits += amount;
  }

  /** Shields absorb first; remainder hits hull. */
  takeDamage(amount: number): void {
    if (amount <= 0) return;
    this.timeSinceDamage = 0;
    let remaining = amount;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, remaining);
      this.shield -= absorbed;
      remaining -= absorbed;
    }
    if (remaining > 0) {
      this.health = Math.max(0, this.health - remaining);
    }
  }

  /**
   * Shield recharge after a quiet period. Safe to call every frame
   * (flight, docked, menus).
   */
  tickDefense(dt: number): void {
    this.timeSinceDamage += dt;
    const util = this.loadout.utility;
    if (!util || util.shieldMax <= 0) return;
    if (this.shield >= util.shieldMax) return;
    if (this.timeSinceDamage < util.shieldRegenDelay) return;
    this.shield = Math.min(
      util.shieldMax,
      this.shield + util.shieldRegenRate * dt,
    );
  }

  update(dt: number, input: InputState): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevHeading = this.heading;

    if (!this.alive) return;

    const drive = this.loadout.drive;
    const turnRate = drive?.turnRate ?? SHIP.turnRate;
    const thrustAccel = drive?.thrustAccel ?? SHIP.thrustAccel;
    const reverseAccel = drive?.reverseAccel ?? SHIP.reverseAccel;
    const maxSpeed = drive?.maxSpeed ?? SHIP.maxSpeed;
    const drag = drive?.drag ?? SHIP.drag;

    if (input.turnLeft) this.heading -= turnRate * dt;
    if (input.turnRight) this.heading += turnRate * dt;

    const cos = Math.cos(this.heading);
    const sin = Math.sin(this.heading);

    if (input.thrust) {
      this.vx += cos * thrustAccel * dt;
      this.vy += sin * thrustAccel * dt;
    }

    if (input.reverse) {
      this.vx -= cos * reverseAccel * dt;
      this.vy -= sin * reverseAccel * dt;
    }

    const speed = this.speed;
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      this.vx *= scale;
      this.vy *= scale;
    }

    const dragFactor = Math.pow(drag, dt * 60);
    this.vx *= dragFactor;
    this.vy *= dragFactor;

    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  /**
   * Smooth autopilot toward a point. Returns true when docked/arrived.
   */
  updateAutopilot(dt: number, targetX: number, targetY: number): boolean {
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevHeading = this.heading;

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= DOCK.arriveDistance) {
      this.x = targetX;
      this.y = targetY;
      this.vx = 0;
      this.vy = 0;
      return true;
    }

    const turnRate = this.loadout.drive?.turnRate ?? SHIP.turnRate;
    const desired = Math.atan2(dy, dx);
    let delta = shortestAngle(this.heading, desired);
    const maxStep = turnRate * dt;
    if (delta > maxStep) delta = maxStep;
    if (delta < -maxStep) delta = -maxStep;
    this.heading += delta;

    const brake =
      dist < DOCK.brakeDistance ? Math.max(0.15, dist / DOCK.brakeDistance) : 1;
    const speed = DOCK.approachSpeed * brake;
    this.vx = Math.cos(this.heading) * speed;
    this.vy = Math.sin(this.heading) * speed;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    return false;
  }

  sample(alpha: number): { x: number; y: number; heading: number } {
    return {
      x: this.prevX + (this.x - this.prevX) * alpha,
      y: this.prevY + (this.y - this.prevY) * alpha,
      heading:
        this.prevHeading + shortestAngle(this.prevHeading, this.heading) * alpha,
    };
  }
}

function shortestAngle(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
