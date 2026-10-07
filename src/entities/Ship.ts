import { SHIP, COMBAT, DOCK, ECONOMY, HEAT, WEAPONS } from "../game/config";
import type { InputState } from "../input/Keyboard";
import {
  applyDefenseHit,
  tickShieldRegen,
  type DefenseLayer,
} from "../ship/defense";
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
  /** Core hull HP. Plating and shields are separate banks. */
  health: number = COMBAT.maxHealth;
  /** Current plating bank (0 when no plating module). */
  plating = 0;
  /** Current shield bank (0 when no shield module, or while broken). */
  shield = 0;
  /** Seconds before a broken shield may start recharging. */
  shieldBreakRemaining = 0;
  /** Current hyperspace / supercruise fuel. */
  fuel = 0;
  /** Current drive heat. Cannot rise past `heatSinkCapacity`. */
  heat = 0;
  /**
   * Equipped drive's heat sink. 0 means this drive has no sink.
   * Kept in step with the drive so the HUD can read it directly.
   */
  heatSinkCapacity = 0;
  /** Seconds since the last heat gain. Vent waits out the drive's delay. */
  private sinceHeatGain = 0;
  /** Seconds since a hit that dealt shield, plating, or core damage. */
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
    this.resetForNewRun();
  }

  /** Factory starter hull, full tanks, and starting credits. */
  resetForNewRun(): void {
    this.credits = ECONOMY.startingCredits;
    this.heat = 0;
    this.heatSinkCapacity = 0;
    this.fleet.resetToStarter();
    this.vx = 0;
    this.vy = 0;
    this.timeSinceDamage = Number.POSITIVE_INFINITY;
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

  /** Core hull only — plating is `maxPlating`, not bonus HP. */
  get maxHull(): number {
    return this.hull.baseHull;
  }

  get maxPlating(): number {
    return this.loadout.utilities().reduce((sum, u) => sum + u.hullBonus, 0);
  }

  get maxShield(): number {
    return this.loadout.utilities().reduce((sum, u) => sum + u.shieldMax, 0);
  }

  /** Missing core + plating + shield, for the complimentary dock repair. */
  get missingHealth(): number {
    return (
      Math.max(0, this.maxHull - this.health) +
      Math.max(0, this.maxPlating - this.plating) +
      Math.max(0, this.maxShield - this.shield)
    );
  }

  get passengerCapacity(): number {
    return this.loadout
      .utilities()
      .reduce((sum, u) => sum + u.passengerCapacity, 0);
  }

  /**
   * Equipped drive's max jump (chart ly). Fuel cannot extend past this.
   * No drive → 0.
   */
  jumpRange(): number {
    return this.loadout.drive?.maxJumpRange ?? 0;
  }

  /**
   * True when heat is still under the sink.
   * A full sink, or a drive with no sink, will not start an energy weapon.
   * A pulse or beam may still start when that shot will fill or pass the sink.
   */
  hasHeatRoom(): boolean {
    return this.heatSinkCapacity > 0 && this.heat < this.heatSinkCapacity - 1e-4;
  }

  /**
   * Hyperspace and an intra-system jump both need room for the whole
   * jump heat before they start. Landing exactly on capacity is allowed.
   * An already-full sink cannot make either jump.
   */
  jumpHeatFits(): boolean {
    return this.heat + HEAT.jump <= this.heatSinkCapacity;
  }

  /** Add heat, clamped to the sink. Resets the vent delay. */
  addHeat(amount: number): void {
    if (!(amount > 0)) return;
    const sink = this.heatSinkCapacity;
    if (sink <= 0) return;
    this.heat = Math.min(sink, this.heat + amount);
    this.sinceHeatGain = 0;
  }

  /**
   * After `ventDelay` with no new heat, shed `ventRate` per second.
   * The frame that crosses the delay only sheds the time past it.
   * A skipped call leaves both the wait and the shed where they were.
   */
  tickHeat(dt: number): void {
    const sink = this.heatSinkCapacity;
    if (this.heat > sink) this.heat = Math.max(0, sink);
    if (this.heat <= 0 || dt <= 0) return;
    this.sinceHeatGain += dt;
    const drive = this.loadout.drive;
    if (!drive || drive.ventRate <= 0) return;
    const past = this.sinceHeatGain - drive.ventDelay;
    if (past <= 0) return;
    const shedDt = past >= dt ? dt : past;
    this.heat = Math.max(0, this.heat - drive.ventRate * shedDt);
  }

  /** Drive + hull + utility tank size. */
  get maxFuel(): number {
    return (
      this.loadout.driveFuelCapacity() +
      this.hull.fuelCapacityBonus +
      this.loadout.utilityFuelCapacity()
    );
  }

  get missingFuel(): number {
    return Math.max(0, this.maxFuel - this.fuel);
  }

  /** Spend fuel for a jump / supercruise; returns false if insufficient. */
  consumeFuel(amount: number): boolean {
    if (amount <= 0) return true;
    if (this.fuel < amount) return false;
    this.fuel -= amount;
    return true;
  }

  /** Top off the tank (station refuel / fuel rat / scoop). */
  addFuel(amount: number): number {
    if (amount <= 0) return 0;
    const before = this.fuel;
    this.fuel = Math.min(this.maxFuel, this.fuel + amount);
    return this.fuel - before;
  }

  /** Ensure fuel is at least `needed` (capped by tank). */
  ensureFuelAtLeast(needed: number): number {
    const target = Math.min(this.maxFuel, Math.max(0, needed));
    const gained = Math.max(0, target - this.fuel);
    this.fuel = Math.max(this.fuel, target);
    return gained;
  }

  /**
   * Write current flight state into the fleet's active snapshot
   * (call before buying/swapping). Flight ship and active snapshot share
   * the same loadout/cargo objects while that hull is boarded — parked
   * hulls keep their own.
   */
  stashActiveToFleet(): void {
    const snap = this.fleet.active;
    // Never point another owned hull at the flight loadout/cargo.
    for (const other of this.fleet.owned) {
      if (other.instanceId === snap.instanceId) continue;
      if (other.loadout === this.loadout || other.cargo === this.cargo) {
        // Recover: parked hull accidentally shared — give it a private copy.
        if (other.loadout === this.loadout) other.loadout = this.loadout.clone();
        if (other.cargo === this.cargo) other.cargo = this.cargo.clone();
      }
    }
    snap.hullId = this.hullId;
    snap.loadout = this.loadout;
    snap.cargo = this.cargo;
    snap.health = this.health;
    snap.plating = this.plating;
    snap.shield = this.shield;
    snap.shieldBreakRemaining = this.shieldBreakRemaining;
    snap.fuel = this.fuel;
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
   * New hulls always start from factory default loadout + empty cargo — never
   * copy the active ship's modules or freight.
   * `charge` is the credits actually taken (Imperial hangar discount included).
   * Omit it to pay the catalog list price.
   */
  buyHull(
    hull: HullDef,
    boardAfter = true,
    charge?: number,
  ): "ok" | "owned" | "credits" | "unknown" {
    if (hull.price <= 0) return "unknown";
    const price = charge ?? hull.price;
    if (this.fleet.ownsHullType(hull.id)) return "owned";
    if (this.credits < price) return "credits";
    this.stashActiveToFleet();
    const bought = this.fleet.buy(hull);
    if (!bought) return "owned";
    this.credits -= price;
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
    this.fuel = snap.fuel;
    this.heat = 0;
    this.sinceHeatGain = 0;
    this.syncDerivedStats({
      refillShield: opts.refillShield,
      previousMaxFuel: opts.fullHealth ? 0 : undefined,
      refillFuel: opts.fullHealth,
    });
    if (opts.fullHealth) {
      this.health = this.maxHull;
      this.plating = this.maxPlating;
      this.fuel = this.maxFuel;
      this.shieldBreakRemaining = 0;
    } else {
      this.health = Math.min(snap.health, this.maxHull);
      this.plating = Math.min(snap.plating, this.maxPlating);
      this.fuel = Math.min(snap.fuel, this.maxFuel);
      this.shieldBreakRemaining = snap.shieldBreakRemaining;
      if (!opts.refillShield) {
        this.shield = Math.min(snap.shield, this.maxShield);
      }
    }
  }

  /**
   * Recompute plating/shield/cargo/fuel caps from hull + utility slots.
   * Call after any utility equip change or hull swap.
   * Core HP is the hull's base and is only clamped here.
   * A larger plating bank raises current plating by the gain (not a full refill
   * unless the caller also refills shields on a fresh install).
   * Fuel tank gains raise current fuel the same way (Expanded Fuel Tank).
   */
  syncDerivedStats(
    opts: {
      refillShield?: boolean;
      previousMaxPlating?: number;
      previousMaxFuel?: number;
      refillFuel?: boolean;
    } = {},
  ): void {
    this.health = Math.min(this.health, this.maxHull);

    const prevPlating = opts.previousMaxPlating ?? this.maxPlating;
    const nextPlating = this.maxPlating;
    const platingGain = Math.max(0, nextPlating - prevPlating);
    if (platingGain > 0) this.plating += platingGain;
    this.plating = Math.min(this.plating, nextPlating);

    const prevMaxFuel = opts.previousMaxFuel ?? this.maxFuel;
    // Recompute after loadout already changed — maxFuel reads new modules.
    const nextMaxFuel =
      this.loadout.driveFuelCapacity() +
      this.hull.fuelCapacityBonus +
      this.loadout.utilityFuelCapacity();
    const fuelGain = Math.max(0, nextMaxFuel - prevMaxFuel);
    if (opts.refillFuel) {
      this.fuel = nextMaxFuel;
    } else if (fuelGain > 0) {
      this.fuel += fuelGain;
    }
    this.fuel = Math.min(this.fuel, nextMaxFuel);

    const utilCargo = this.loadout
      .utilities()
      .reduce((sum, u) => sum + u.cargoCapacity, 0);
    this.cargo.setCapacity(this.hull.baseCargo + utilCargo);

    const shieldMax = this.maxShield;
    if (shieldMax <= 0) {
      this.shield = 0;
      this.shieldBreakRemaining = 0;
    } else if (opts.refillShield) {
      this.shield = shieldMax;
      this.shieldBreakRemaining = 0;
    } else {
      this.shield = Math.min(this.shield, shieldMax);
    }

    this.heatSinkCapacity = this.loadout.drive?.heatSink ?? 0;
    if (this.heat > this.heatSinkCapacity) {
      this.heat = Math.max(0, this.heatSinkCapacity);
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
   * Free station courtesy on dock — restore core, plating, and shields, top off
   * the tank, and refill every weapon magazine. Ammo refills even when the
   * hull and tank are already full. A repair also clears shield-break downtime.
   */
  applyComplimentaryDockService(): { healed: number; refueled: boolean } {
    const healed = this.missingHealth;
    const refueled = this.missingFuel > 0;
    this.loadout.refillConsumables();
    if (healed > 0 || this.shieldBreakRemaining > 0) {
      this.health = this.maxHull;
      this.plating = this.maxPlating;
      this.shield = this.maxShield;
      this.shieldBreakRemaining = 0;
      this.timeSinceDamage = Number.POSITIVE_INFINITY;
    }
    if (refueled) {
      this.fuel = this.maxFuel;
    }
    return { healed, refueled };
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

  /**
   * Shields first (scaled by `shieldMultiplier`, excess wiped on a break),
   * then plating (`platingMultiplier`, leftover spills), then core at 100%.
   * Kinetics omit the plating fraction and take full plating damage.
   * Returns the bank that took the hit. Beams bend only on `"plating"`.
   */
  takeDamage(
    amount: number,
    shieldMultiplier: number = WEAPONS.npcShieldMultiplier,
    platingMultiplier: number = 1,
  ): DefenseLayer {
    const state = this.defenseBanks();
    const layer = applyDefenseHit(
      state,
      amount,
      shieldMultiplier,
      platingMultiplier,
      this.shieldBreakDowntime(),
    );
    this.writeDefenseBanks(state);
    return layer;
  }

  /**
   * Shortest break wait among equipped shield banks.
   * No shield module means there is nothing to wait out.
   */
  shieldBreakDowntime(): number {
    let best = Number.POSITIVE_INFINITY;
    for (const util of this.loadout.utilities()) {
      if (util.shieldMax <= 0) continue;
      if (util.shieldBreakDowntime < best) best = util.shieldBreakDowntime;
    }
    return Number.isFinite(best) ? best : 0;
  }

  /**
   * Shield recharge. A break waits out downtime before regen starts.
   * Chipped shields still wait out the module quiet-period delay.
   * Safe to call every frame (flight, docked, menus).
   */
  tickDefense(dt: number): void {
    const utils = this.loadout.utilities().filter((u) => u.shieldMax > 0);
    const delay =
      utils.length > 0
        ? Math.min(...utils.map((u) => u.shieldRegenDelay))
        : 0;
    const rate = utils.reduce((sum, u) => sum + u.shieldRegenRate, 0);
    const state = this.defenseBanks();
    tickShieldRegen(state, dt, this.maxShield, delay, rate);
    this.writeDefenseBanks(state);
  }

  private defenseBanks() {
    return {
      shield: this.shield,
      plating: this.plating,
      core: this.health,
      timeSinceDamage: this.timeSinceDamage,
      shieldBreakRemaining: this.shieldBreakRemaining,
    };
  }

  private writeDefenseBanks(state: {
    shield: number;
    plating: number;
    core: number;
    timeSinceDamage: number;
    shieldBreakRemaining: number;
  }): void {
    this.shield = state.shield;
    this.plating = state.plating;
    this.health = state.core;
    this.timeSinceDamage = state.timeSinceDamage;
    this.shieldBreakRemaining = state.shieldBreakRemaining;
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
