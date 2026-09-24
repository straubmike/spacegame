import { COMBAT, GALAXY, SHIP } from "../game/config";

/** Equip categories — one module per slot. */
export type SlotKind = "weapon" | "drive" | "utility";

/**
 * Progression rung. Prices and station stock gate by this.
 * 1 = beginner, 2 = mid, 3 = late.
 */
export type ModuleTier = 1 | 2 | 3;

interface ModuleBase {
  id: string;
  name: string;
  blurb: string;
  /** Station list price (credits). */
  price: number;
  /** Ladder rung — used for stock gating and UI. */
  tier: ModuleTier;
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
  /**
   * World-unit range to reveal mineral-rich belt rocks (0 = no scan).
   * Belt farming needs scan + scoop equipped together.
   */
  mineralScanRange: number;
  /**
   * World-unit scoop reach for collecting scanned ore (0 = no scoop).
   * Belt farming needs scan + scoop equipped together.
   */
  scoopRange: number;
}

export type EquipModule = WeaponModule | DriveModule | UtilityModule;

export interface ShipSlot {
  id: string;
  kind: SlotKind;
  label: string;
  equipped: EquipModule | null;
}

/**
 * Full module catalog — beginner → mid → late ladder.
 *
 * Price intent (starting credits ~100, ~8 CU early hold):
 * - Tier 1 (~40–110): early dock buys / first trade hop
 * - Tier 2 (~200–340): a few trade loops or a quest + trades (not one dump)
 * - Tier 3 (~480–720): multi-loop goal; trade-in softens the step up
 */
export const MODULES = {
  // —— Weapons ————————————————————————————————————————————————
  energyPulse: {
    kind: "weapon",
    id: "energy_pulse",
    name: "Energy Pulse",
    blurb: "Lightweight pulse cannon. Draws from the reactor — no magazine.",
    price: 40,
    tier: 1,
    fireCooldown: COMBAT.fireCooldown,
    ammoMax: null,
    damage: COMBAT.projectileDamage,
  } satisfies WeaponModule,

  rapidPulse: {
    kind: "weapon",
    id: "rapid_pulse",
    name: "Rapid Pulse",
    blurb: "Faster cycle for a premium. Same punch as a stock pulse cannon.",
    price: 90,
    tier: 1,
    fireCooldown: COMBAT.fireCooldown * 0.65,
    ammoMax: null,
    damage: COMBAT.projectileDamage,
  } satisfies WeaponModule,

  heavyPulse: {
    kind: "weapon",
    id: "heavy_pulse",
    name: "Heavy Pulse",
    blurb: "Slower discharge with a harder hit.",
    price: 100,
    tier: 1,
    fireCooldown: COMBAT.fireCooldown * 1.45,
    ammoMax: null,
    damage: COMBAT.projectileDamage + 1,
  } satisfies WeaponModule,

  twinPulse: {
    kind: "weapon",
    id: "twin_pulse",
    name: "Twin Pulse",
    blurb: "Paired emitters — quicker cycle and a firmer punch than stock.",
    price: 240,
    tier: 2,
    fireCooldown: COMBAT.fireCooldown * 0.72,
    ammoMax: null,
    damage: COMBAT.projectileDamage + 1,
  } satisfies WeaponModule,

  focusBeam: {
    kind: "weapon",
    id: "focus_beam",
    name: "Focus Beam",
    blurb: "Charged lance. Slow to cycle, nasty when it lands.",
    price: 280,
    tier: 2,
    fireCooldown: COMBAT.fireCooldown * 1.55,
    ammoMax: null,
    damage: COMBAT.projectileDamage + 2,
  } satisfies WeaponModule,

  burstCannon: {
    kind: "weapon",
    id: "burst_cannon",
    name: "Burst Cannon",
    blurb: "Aggressive cycle rate. Same bite as Twin Pulse, hungrier on heat.",
    price: 310,
    tier: 2,
    fireCooldown: COMBAT.fireCooldown * 0.48,
    ammoMax: null,
    damage: COMBAT.projectileDamage + 1,
  } satisfies WeaponModule,

  novaLance: {
    kind: "weapon",
    id: "nova_lance",
    name: "Nova Lance",
    blurb: "Late-yard beam. Strong hit with a respectable cycle.",
    price: 560,
    tier: 3,
    fireCooldown: COMBAT.fireCooldown * 0.9,
    ammoMax: null,
    damage: COMBAT.projectileDamage + 3,
  } satisfies WeaponModule,

  plasmaRepeater: {
    kind: "weapon",
    id: "plasma_repeater",
    name: "Plasma Repeater",
    blurb: "Top-end spray. Fastest energy cycle that still hits hard.",
    price: 620,
    tier: 3,
    fireCooldown: COMBAT.fireCooldown * 0.4,
    ammoMax: null,
    damage: COMBAT.projectileDamage + 2,
  } satisfies WeaponModule,

  siegePulse: {
    kind: "weapon",
    id: "siege_pulse",
    name: "Siege Pulse",
    blurb: "Capital-grade discharge. Slow, brutal, and expensive.",
    price: 680,
    tier: 3,
    fireCooldown: COMBAT.fireCooldown * 1.7,
    ammoMax: null,
    damage: COMBAT.projectileDamage + 4,
  } satisfies WeaponModule,

  // —— Drives ————————————————————————————————————————————————
  basicDrive: {
    kind: "drive",
    id: "basic_drive",
    name: "Basic Drive",
    blurb: "Stock thruster and hyperspace coil. Reliable, unremarkable.",
    price: 50,
    tier: 1,
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
    tier: 1,
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
    tier: 1,
    turnRate: SHIP.turnRate * 0.9,
    thrustAccel: SHIP.thrustAccel * 0.9,
    reverseAccel: SHIP.reverseAccel * 0.9,
    maxSpeed: SHIP.maxSpeed * 0.95,
    drag: SHIP.drag,
    jumpRange: GALAXY.jumpRange * 1.35,
    warpChargesMax: null,
  } satisfies DriveModule,

  courierDrive: {
    kind: "drive",
    id: "courier_drive",
    name: "Courier Drive",
    blurb: "Trade-route coil. Solid thrust and a comfortable jump leg.",
    price: 260,
    tier: 2,
    turnRate: SHIP.turnRate * 1.05,
    thrustAccel: SHIP.thrustAccel * 1.12,
    reverseAccel: SHIP.reverseAccel * 1.08,
    maxSpeed: SHIP.maxSpeed * 1.08,
    drag: SHIP.drag,
    jumpRange: GALAXY.jumpRange * 1.15,
    warpChargesMax: null,
  } satisfies DriveModule,

  interceptorDrive: {
    kind: "drive",
    id: "interceptor_drive",
    name: "Interceptor Drive",
    blurb: "Combat thrusters first. Blistering in-system, stingy on range.",
    price: 300,
    tier: 2,
    turnRate: SHIP.turnRate * 1.35,
    thrustAccel: SHIP.thrustAccel * 1.4,
    reverseAccel: SHIP.reverseAccel * 1.25,
    maxSpeed: SHIP.maxSpeed * 1.28,
    drag: SHIP.drag * 0.992,
    jumpRange: GALAXY.jumpRange * 0.7,
    warpChargesMax: null,
  } satisfies DriveModule,

  explorerCoil: {
    kind: "drive",
    id: "explorer_coil",
    name: "Explorer Coil",
    blurb: "Surveyor's jump stack. Soft thrusters, long chart reach.",
    price: 320,
    tier: 2,
    turnRate: SHIP.turnRate * 0.95,
    thrustAccel: SHIP.thrustAccel * 0.95,
    reverseAccel: SHIP.reverseAccel * 0.95,
    maxSpeed: SHIP.maxSpeed,
    drag: SHIP.drag,
    jumpRange: GALAXY.jumpRange * 1.55,
    warpChargesMax: null,
  } satisfies DriveModule,

  afterburnCore: {
    kind: "drive",
    id: "afterburn_core",
    name: "Afterburn Core",
    blurb: "Late combat coil. Peak thrust and turn — jump legs suffer.",
    price: 580,
    tier: 3,
    turnRate: SHIP.turnRate * 1.45,
    thrustAccel: SHIP.thrustAccel * 1.55,
    reverseAccel: SHIP.reverseAccel * 1.35,
    maxSpeed: SHIP.maxSpeed * 1.4,
    drag: SHIP.drag * 0.99,
    jumpRange: GALAXY.jumpRange * 0.85,
    warpChargesMax: null,
  } satisfies DriveModule,

  deepJumpArray: {
    kind: "drive",
    id: "deep_jump_array",
    name: "Deep Jump Array",
    blurb: "Long-haul hyperspace lattice. Slow locally, chart-dominating.",
    price: 600,
    tier: 3,
    turnRate: SHIP.turnRate * 0.85,
    thrustAccel: SHIP.thrustAccel * 0.85,
    reverseAccel: SHIP.reverseAccel * 0.85,
    maxSpeed: SHIP.maxSpeed * 0.9,
    drag: SHIP.drag,
    jumpRange: GALAXY.jumpRange * 1.85,
    warpChargesMax: null,
  } satisfies DriveModule,

  balancedHyperdrive: {
    kind: "drive",
    id: "balanced_hyperdrive",
    name: "Balanced Hyperdrive",
    blurb: "Premium all-rounder. Strong thrust and a long, reliable jump.",
    price: 650,
    tier: 3,
    turnRate: SHIP.turnRate * 1.15,
    thrustAccel: SHIP.thrustAccel * 1.25,
    reverseAccel: SHIP.reverseAccel * 1.15,
    maxSpeed: SHIP.maxSpeed * 1.18,
    drag: SHIP.drag,
    jumpRange: GALAXY.jumpRange * 1.4,
    warpChargesMax: null,
  } satisfies DriveModule,

  // —— Utilities —————————————————————————————————————————————
  lightShield: {
    kind: "utility",
    id: "light_shield",
    name: "Light Shield",
    blurb: "Thin deflector lattice. Absorbs hits first; recharges after a quiet spell.",
    price: 70,
    tier: 1,
    shieldMax: 4,
    shieldRegenDelay: 2.5,
    shieldRegenRate: 2.5,
    hullBonus: 0,
    cargoCapacity: 0,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
  } satisfies UtilityModule,

  hullPlating: {
    kind: "utility",
    id: "hull_plating",
    name: "Hull Plating",
    blurb: "Reinforced skin plates. More hull, no fancy tricks.",
    price: 65,
    tier: 1,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    hullBonus: 3,
    cargoCapacity: 0,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
  } satisfies UtilityModule,

  cargoRack: {
    kind: "utility",
    id: "cargo_rack",
    name: "Cargo Rack",
    blurb: "External holds measured in cargo units (CU). Value lives in the market, not the mass.",
    price: 55,
    tier: 1,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    hullBonus: 0,
    cargoCapacity: 8,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
  } satisfies UtilityModule,

  mediumShield: {
    kind: "utility",
    id: "medium_shield",
    name: "Medium Shield",
    blurb: "Thicker lattice and quicker recover. Mid-route self-defense.",
    price: 230,
    tier: 2,
    shieldMax: 8,
    shieldRegenDelay: 2.0,
    shieldRegenRate: 3.5,
    hullBonus: 0,
    cargoCapacity: 0,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
  } satisfies UtilityModule,

  reinforcedHull: {
    kind: "utility",
    id: "reinforced_hull",
    name: "Reinforced Hull",
    blurb: "Layered plating. Survives longer once shields are gone.",
    price: 210,
    tier: 2,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    hullBonus: 6,
    cargoCapacity: 0,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
  } satisfies UtilityModule,

  expandedHold: {
    kind: "utility",
    id: "expanded_hold",
    name: "Expanded Hold",
    blurb: "Deeper racks for longer trade runs. Still no shields.",
    price: 200,
    tier: 2,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    hullBonus: 0,
    cargoCapacity: 14,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
  } satisfies UtilityModule,

  heavyShield: {
    kind: "utility",
    id: "heavy_shield",
    name: "Heavy Shield",
    blurb: "Late deflector bank. Fat buffer and aggressive regen.",
    price: 500,
    tier: 3,
    shieldMax: 14,
    shieldRegenDelay: 1.6,
    shieldRegenRate: 5.0,
    hullBonus: 1,
    cargoCapacity: 0,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
  } satisfies UtilityModule,

  fortressPlating: {
    kind: "utility",
    id: "fortress_plating",
    name: "Fortress Plating",
    blurb: "Brutal armor kit. Hull-first survival for close fights.",
    price: 480,
    tier: 3,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    hullBonus: 10,
    cargoCapacity: 0,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
  } satisfies UtilityModule,

  freighterBay: {
    kind: "utility",
    id: "freighter_bay",
    name: "Freighter Bay",
    blurb: "Deep cargo spine. Built for multi-hop bulk runs.",
    price: 460,
    tier: 3,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    hullBonus: 0,
    cargoCapacity: 22,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
  } satisfies UtilityModule,


  oreScanner: {
    kind: "utility",
    id: "ore_scanner",
    name: "Ore Scanner",
    blurb:
      "Prospecting suite sensor. Lights up mineral veins in asteroid belts — pair with a Cargo Scoop to farm.",
    price: 60,
    tier: 1,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    hullBonus: 0,
    cargoCapacity: 0,
    passengerCapacity: 0,
    mineralScanRange: 110,
    scoopRange: 0,
  } satisfies UtilityModule,

  cargoScoop: {
    kind: "utility",
    id: "cargo_scoop",
    name: "Cargo Scoop",
    blurb:
      "Magnetic intake for belt ore. Needs an Ore Scanner to find veins; includes a small hold for hauls.",
    price: 70,
    tier: 1,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    hullBonus: 0,
    cargoCapacity: 6,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 48,
  } satisfies UtilityModule,

  passengerBerth: {
    kind: "utility",
    id: "passenger_berth",
    name: "Passenger Berth",
    blurb:
      "Cabin space for paying travelers (berths, not CU). Required to accept passenger fare contracts.",
    price: 90,
    tier: 1,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    hullBonus: 0,
    cargoCapacity: 0,
    passengerCapacity: 4,
    mineralScanRange: 0,
    scoopRange: 0,
  } satisfies UtilityModule,

  prospectingRig: {
    kind: "utility",
    id: "prospecting_rig",
    name: "Prospecting Rig",
    blurb:
      "Combined scanner and scoop in one bay — belt farming for single-utility hulls.",
    price: 110,
    tier: 1,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    hullBonus: 0,
    cargoCapacity: 5,
    passengerCapacity: 0,
    mineralScanRange: 100,
    scoopRange: 44,
  } satisfies UtilityModule,

  dualLattice: {
    kind: "utility",
    id: "dual_lattice",
    name: "Dual Lattice",
    blurb: "Hybrid kit — solid shields with a touch of plating. Jack of both.",
    price: 540,
    tier: 3,
    shieldMax: 10,
    shieldRegenDelay: 1.8,
    shieldRegenRate: 4.0,
    hullBonus: 4,
    cargoCapacity: 0,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
  } satisfies UtilityModule,
} as const;

/** Fraction of list price credited when swapping a module off the ship. */
export const MODULE_TRADE_IN = 0.5;

export const CATALOG: EquipModule[] = [
  MODULES.energyPulse,
  MODULES.rapidPulse,
  MODULES.heavyPulse,
  MODULES.twinPulse,
  MODULES.focusBeam,
  MODULES.burstCannon,
  MODULES.novaLance,
  MODULES.plasmaRepeater,
  MODULES.siegePulse,
  MODULES.basicDrive,
  MODULES.racingDrive,
  MODULES.longRangeDrive,
  MODULES.courierDrive,
  MODULES.interceptorDrive,
  MODULES.explorerCoil,
  MODULES.afterburnCore,
  MODULES.deepJumpArray,
  MODULES.balancedHyperdrive,
  MODULES.lightShield,
  MODULES.hullPlating,
  MODULES.cargoRack,
  MODULES.mediumShield,
  MODULES.reinforcedHull,
  MODULES.expandedHold,
  MODULES.heavyShield,
  MODULES.fortressPlating,
  MODULES.freighterBay,
  MODULES.dualLattice,
  MODULES.oreScanner,
  MODULES.cargoScoop,
  MODULES.passengerBerth,
  MODULES.prospectingRig,
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
      label: "Utility A",
      equipped: null,
    },
    {
      id: "slot_utility_1",
      kind: "utility",
      label: "Utility B",
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

export function tierLabel(tier: ModuleTier): string {
  switch (tier) {
    case 1:
      return "Mk I";
    case 2:
      return "Mk II";
    case 3:
      return "Mk III";
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
