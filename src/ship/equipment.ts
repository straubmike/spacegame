import { COMBAT, GALAXY, SHIP } from "../game/config";

/** Equip categories — one module per slot. */
export type SlotKind = "weapon" | "drive" | "utility";

interface ModuleBase {
  id: string;
  name: string;
  blurb: string;
  /** Station list price (credits). */
  price: number;
}

export interface WeaponModule extends ModuleBase {
  kind: "weapon";
  /**
   * Internal shot spacing in seconds — derived into rate of fire for UI.
   * Do not surface as a separate player-facing “cooldown” stat.
   */
  fireCooldown: number;
  /** null = infinite magazine (energy weapons). */
  ammoMax: number | null;
  damage: number;
}

export interface DriveModule extends ModuleBase {
  kind: "drive";
  turnRate: number;
  thrustAccel: number;
  reverseAccel: number;
  maxSpeed: number;
  drag: number;
  jumpRange: number;
  /** null = unlimited jumps between repairs. */
  warpChargesMax: number | null;
}

export interface UtilityModule extends ModuleBase {
  kind: "utility";
  /** Max shield HP absorbed before hull damage. */
  shieldMax: number;
  /** Seconds without damage before shield regen starts. */
  shieldRegenDelay: number;
  /** Shield HP restored per second while regenerating. */
  shieldRegenRate: number;
  /** Extra hull HP above the ship base. */
  hullBonus: number;
  /** Cargo hold size in cargo units (CU). */
  cargoCapacity: number;
  /** Passenger berths (not CU — people, not freight). */
  passengerCapacity: number;
}

export type EquipModule = WeaponModule | DriveModule | UtilityModule;

export interface ShipSlot {
  id: string;
  kind: SlotKind;
  label: string;
  equipped: EquipModule | null;
}

/** Full module catalog (starter gear + station stock). */
export const MODULES = {
  energyPulse: {
    kind: "weapon",
    id: "energy_pulse",
    name: "Energy Pulse",
    blurb: "Lightweight pulse cannon. Draws from the reactor — no magazine.",
    price: 40,
    fireCooldown: COMBAT.fireCooldown,
    ammoMax: null,
    damage: COMBAT.projectileDamage,
  } satisfies WeaponModule,

  rapidPulse: {
    kind: "weapon",
    id: "rapid_pulse",
    name: "Rapid Pulse",
    blurb: "Faster cycle for a premium. Same punch as a stock pulse cannon.",
    price: 85,
    fireCooldown: COMBAT.fireCooldown * 0.65,
    ammoMax: null,
    damage: COMBAT.projectileDamage,
  } satisfies WeaponModule,

  heavyPulse: {
    kind: "weapon",
    id: "heavy_pulse",
    name: "Heavy Pulse",
    blurb: "Slower discharge with a harder hit.",
    price: 95,
    fireCooldown: COMBAT.fireCooldown * 1.45,
    ammoMax: null,
    damage: COMBAT.projectileDamage + 1,
  } satisfies WeaponModule,

  basicDrive: {
    kind: "drive",
    id: "basic_drive",
    name: "Basic Drive",
    blurb: "Stock thruster and hyperspace coil. Reliable, unremarkable.",
    price: 50,
    turnRate: SHIP.turnRate,
    thrustAccel: SHIP.thrustAccel,
    reverseAccel: SHIP.reverseAccel,
    maxSpeed: SHIP.maxSpeed,
    drag: SHIP.drag,
    jumpRange: GALAXY.jumpRange,
    warpChargesMax: null,
  } satisfies DriveModule,

  racingDrive: {
    kind: "drive",
    id: "racing_drive",
    name: "Racing Drive",
    blurb: "Hot thrusters and crisp turn authority. Shorter jump legs.",
    price: 120,
    turnRate: SHIP.turnRate * 1.2,
    thrustAccel: SHIP.thrustAccel * 1.25,
    reverseAccel: SHIP.reverseAccel * 1.15,
    maxSpeed: SHIP.maxSpeed * 1.15,
    drag: SHIP.drag,
    jumpRange: GALAXY.jumpRange * 0.75,
    warpChargesMax: null,
  } satisfies DriveModule,

  longRangeDrive: {
    kind: "drive",
    id: "long_range_drive",
    name: "Long-Range Drive",
    blurb: "Tuned hyperspace coil. Sluggish in-system, farther jumps.",
    price: 130,
    turnRate: SHIP.turnRate * 0.9,
    thrustAccel: SHIP.thrustAccel * 0.9,
    reverseAccel: SHIP.reverseAccel * 0.9,
    maxSpeed: SHIP.maxSpeed * 0.95,
    drag: SHIP.drag,
    jumpRange: GALAXY.jumpRange * 1.35,
    warpChargesMax: null,
  } satisfies DriveModule,

  lightShield: {
    kind: "utility",
    id: "light_shield",
    name: "Light Shield",
    blurb: "Thin deflector lattice. Absorbs hits first; recharges after a quiet spell.",
    price: 70,
    shieldMax: 4,
    shieldRegenDelay: 2.5,
    shieldRegenRate: 2.5,
    hullBonus: 0,
    cargoCapacity: 0,
    passengerCapacity: 0,
  } satisfies UtilityModule,

  hullPlating: {
    kind: "utility",
    id: "hull_plating",
    name: "Hull Plating",
    blurb: "Reinforced skin plates. More hull, no fancy tricks.",
    price: 65,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    hullBonus: 3,
    cargoCapacity: 0,
    passengerCapacity: 0,
  } satisfies UtilityModule,

  cargoRack: {
    kind: "utility",
    id: "cargo_rack",
    name: "Cargo Rack",
    blurb: "External holds measured in cargo units (CU). Value lives in the market, not the mass.",
    price: 55,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    hullBonus: 0,
    cargoCapacity: 8,
    passengerCapacity: 0,
  } satisfies UtilityModule,
} as const;

/** Fraction of list price credited when swapping a module off the ship. */
export const MODULE_TRADE_IN = 0.5;

export const CATALOG: EquipModule[] = [
  MODULES.energyPulse,
  MODULES.rapidPulse,
  MODULES.heavyPulse,
  MODULES.basicDrive,
  MODULES.racingDrive,
  MODULES.longRangeDrive,
  MODULES.lightShield,
  MODULES.hullPlating,
  MODULES.cargoRack,
];

export function createStarterSlots(): ShipSlot[] {
  return [
    {
      id: "slot_weapon_0",
      kind: "weapon",
      label: "Weapon",
      equipped: cloneModule(MODULES.energyPulse),
    },
    {
      id: "slot_drive_0",
      kind: "drive",
      label: "Drive",
      equipped: cloneModule(MODULES.basicDrive),
    },
    {
      id: "slot_utility_0",
      kind: "utility",
      label: "Utility",
      equipped: null,
    },
  ];
}

export function cloneModule<T extends EquipModule>(mod: T): T {
  return { ...mod };
}

export function moduleById(id: string): EquipModule | undefined {
  return CATALOG.find((m) => m.id === id);
}

export function tradeInValue(mod: EquipModule | null): number {
  if (!mod) return 0;
  return Math.floor(mod.price * MODULE_TRADE_IN);
}

/** Net credits to install `next`, trading in the currently equipped module. */
export function swapCost(
  current: EquipModule | null,
  next: EquipModule,
): number {
  return Math.max(0, next.price - tradeInValue(current));
}

export function rateOfFire(fireCooldown: number): number {
  return fireCooldown > 0 ? 1 / fireCooldown : 0;
}

export function slotKindLabel(kind: SlotKind): string {
  switch (kind) {
    case "weapon":
      return "Weapon";
    case "drive":
      return "Drive";
    case "utility":
      return "Utility";
  }
}

export function formatAmmo(ammoMax: number | null, ammo: number): string {
  if (ammoMax === null) return "Unlimited";
  const cur = Number.isFinite(ammo) ? Math.floor(ammo) : ammoMax;
  return `${cur} / ${ammoMax}`;
}

export function formatWarp(
  warpMax: number | null,
  charges: number,
): string {
  if (warpMax === null) return "Unlimited";
  const cur = Number.isFinite(charges) ? Math.floor(charges) : warpMax;
  return `${cur} / ${warpMax}`;
}
