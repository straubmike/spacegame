import { SHIP, COMBAT, DOCK, ECONOMY } from "../game/config";
import type { InputState } from "../input/Keyboard";
import { ShipLoadout } from "../ship/Loadout";
import { CargoHold } from "../ship/CargoHold";
import { Fleet, type OwnedShipSnapshot } from "../ship/Fleet";
import {
  STARTER_HULL_ID,
  hullById,
  type HullDef,
} from "../ship/hulls";

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
  loadout = new ShipLoadout();
  cargo = new CargoHold();
  /** Session fleet — owned hulls; this Ship is the active flight body. */
  readonly fleet = new Fleet();
  hullId: string = STARTER_HULL_ID;

  prevX = 0;
  prevY = 0;
  prevHeading = this.heading;

  constructor() {
    this.applyOwnedShip(this.fleet.active, { refillShield: true, fullHealth: true });
  }

  get hull(): HullDef {
    return hullById(this.hullId) ?? hullById(STARTER_HULL_ID)!;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  get alive(): boolean {
    return this.health > 0;
  }

  get maxHull(): number {
    const bonus = this.loadout
      .utilities()
      .reduce((sum, u) => sum + u.hullBonus, 0);
    return this.hull.baseHull + bonus;
  }

  get maxShield(): number {
    return this.loadout.utilities().reduce((sum, u) => sum + u.shieldMax, 0);
  }

  get missingHealth(): number {
    return Math.max(0, this.maxHull - this.health);
  }

  get passengerCapacity(): number {
    return this.loadout
      .utilities()
      .reduce((sum, u) => sum + u.passengerCapacity, 0);
  }

  /** Drive jump range plus hull explorer bonus. */
  jumpRange(): number {
    return this.loadout.jumpRange() + this.hull.jumpRangeBonus;
  }

  /**
   * Write current flight state into the fleet's active snapshot
   * (call before buying/swapping).
   */
  stashActiveToFleet(): void {
    const snap = this.fleet.active;
    snap.hullId = this.hullId;
    snap.loadout = this.loadout;
    snap.cargo = this.cargo;
    snap.health = this.health;
    snap.shield = this.shield;
  }

  /**
   * Make an owned instance the flight ship. Stashes the current active first.
   */
  boardOwned(instanceId: string): boolean {
    if (instanceId === this.fleet.activeInstanceId) return true;
    const next = this.fleet.get(instanceId);
    if (!next) return false;
    this.stashActiveToFleet();
    this.fleet.setActive(instanceId);
    this.applyOwnedShip(next, { refillShield: false, fullHealth: false });
    return true;
  }

  /**
   * Purchase hull (if affordable and not already owned) and optionally board it.
   */
  buyHull(hull: HullDef, boardAfter = true): "ok" | "owned" | "credits" | "unknown" {
    if (hull.price <= 0) return "unknown";
    if (this.fleet.ownsHullType(hull.id)) return "owned";
    if (this.credits < hull.price) return "credits";
    this.stashActiveToFleet();
    const bought = this.fleet.buy(hull);
    if (!bought) return "owned";
    this.credits -= hull.price;
    if (boardAfter) {
      this.fleet.setActive(bought.instanceId);
      this.applyOwnedShip(bought, { refillShield: true, fullHealth: true });
    }
    return "ok";
  }

  private applyOwnedShip(
    snap: OwnedShipSnapshot,
    opts: { refillShield: boolean; fullHealth: boolean },
  ): void {
    this.hullId = snap.hullId;
    this.loadout = snap.loadout;
    this.cargo = snap.cargo;
    this.syncDerivedStats({
      refillShield: opts.refillShield,
      previousMaxHull: opts.fullHealth ? 0 : undefined,
    });
    if (opts.fullHealth) {
      this.health = this.maxHull;
    } else {
      this.health = Math.min(snap.health, this.maxHull);
      if (!opts.refillShield) {
        this.shield = Math.min(snap.shield, this.maxShield);
      }
    }
  }

  /**
   * Recompute hull/shield/cargo caps from hull + utility slots.
   * Call after any utility equip change or hull swap.
   * Hull max gains raise current HP by the same amount (no free full heal).
   */
  syncDerivedStats(
    opts: { refillShield?: boolean; previousMaxHull?: number } = {},
  ): void {
    const prevMaxHull = opts.previousMaxHull ?? this.maxHull;
    const nextMaxHull = this.maxHull;
    const hullGain = Math.max(0, nextMaxHull - prevMaxHull);

    if (hullGain > 0) {
      this.health += hullGain;
    }
    this.health = Math.min(this.health, nextMaxHull);

    const utilCargo = this.loadout
      .utilities()
      .reduce((sum, u) => sum + u.cargoCapacity, 0);
    this.cargo.setCapacity(this.hull.baseCargo + utilCargo);

    const shieldMax = this.maxShield;
    if (shieldMax <= 0) {
      this.shield = 0;
    } else if (opts.refillShield) {
      this.shield = shieldMax;
    } else {
      this.shield = Math.min(this.shield, shieldMax);
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
    const utils = this.loadout.utilities();
    const shieldMax = this.maxShield;
    if (shieldMax <= 0) return;
    if (this.shield >= shieldMax) return;
    const delay = Math.min(
      ...utils.filter((u) => u.shieldMax > 0).map((u) => u.shieldRegenDelay),
      Number.POSITIVE_INFINITY,
    );
    const rate = utils
      .filter((u) => u.shieldMax > 0)
      .reduce((sum, u) => sum + u.shieldRegenRate, 0);
    if (!Number.isFinite(delay) || rate <= 0) return;
    if (this.timeSinceDamage < delay) return;
    this.shield = Math.min(shieldMax, this.shield + rate * dt);
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
