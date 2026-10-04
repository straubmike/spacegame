import { SHIP, WEAPONS } from "../game/config";

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
  /** Ladder rung — gates station stock and price; Mk label only on stat-ladder SKUs. */
  tier: ModuleTier;
}

/** Kinetic family. Mark is the tier rung, not a separate name. */
export type WeaponFamily = "gun" | "cannon" | "missile";

export interface WeaponModule extends ModuleBase {
  kind: "weapon";
  family: WeaponFamily;
  /**
   * Seconds between shots (pellet volley, slug, or missile).
   * Surfaced as rate of fire — not a separate “cooldown” label.
   */
  fireCooldown: number;
  /** null = infinite magazine. Player kinetics always carry a finite bank. */
  ammoMax: number | null;
  /**
   * Gun: HP chunk once the stream has stayed on target.
   * Cannon / missile: damage per hit.
   */
  damage: number;
  /**
   * Fraction of `damage` applied to a shield bank.
   * 0 leaves shields untouched and does not spill.
   * Excess over the current shield is wiped.
   */
  shieldMultiplier: number;
  /** Gun: seconds of sustained impacts before a chunk. 0 on other families. */
  timeOnTarget: number;
  /** Missile steering, radians per second. 0 on other families. */
  trackingTurn: number;
  /** Missile lock window. After this the round flies straight. */
  trackSeconds: number;
  /** Pellets per volley. 1 for slugs and missiles. */
  pelletCount: number;
  /** Cone half-angle in radians. 0 fires straight ahead. */
  spread: number;
}

export interface DriveModule extends ModuleBase {
  kind: "drive";
  turnRate: number;
  thrustAccel: number;
  reverseAccel: number;
  maxSpeed: number;
  drag: number;
  /**
   * Farthest single galactic jump this drive can make (chart ly).
   * Fuel cannot extend past this. A larger tank only pays for the same hop.
   */
  maxJumpRange: number;
  /**
   * Hyperspace / supercruise tank size contributed by this drive.
   * Extra fuel past one max jump does not increase maxJumpRange.
   */
  fuelCapacity: number;
  /** null = unlimited warp charges between repairs (legacy; travel uses fuel). */
  warpChargesMax: number | null;
}

export interface UtilityModule extends ModuleBase {
  kind: "utility";
  /** Shield bank HP. First layer; not bonus core HP. */
  shieldMax: number;
  /** Seconds without damage before shield regen starts. */
  shieldRegenDelay: number;
  /** Shield HP restored per second while regenerating. */
  shieldRegenRate: number;
  /**
   * Seconds a broken shield waits before recharge can start.
   * 0 when this module has no shield bank. Higher marks recover sooner.
   * Several shields equipped: the ship uses the shortest wait.
   */
  shieldBreakDowntime: number;
  /**
   * Fraction added to every equipped weapon's magazine (0.25 = +25%).
   * Multiple expanders stack by summing the fractions.
   */
  ammoBonus: number;
  /**
   * Plating bank HP. Sits in front of core hull after shields.
   * Does not raise core HP.
   */
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
  /** Bonus fuel tank units while equipped. */
  fuelCapacity: number;
  /** Hold F near a main-sequence star to skim fuel. */
  fuelScoop: boolean;
  /**
   * Survey / exploration POI scan capability (0 tiers — one module).
   * Required to accept explore missions and to complete a scan at the target.
   */
  poiScan: boolean;
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
  // —— Weapons (kinetic only: Gun / Cannon / Missile, Mk I–III) ———
  gunMk1: {
    kind: "weapon",
    family: "gun",
    id: "gun_mk1",
    name: "Gun",
    blurb:
      "Tight kinetic stream. Pellets do not hit — a chunk lands after the stream stays on target. No effect on shields.",
    price: 75,
    tier: 1,
    fireCooldown: WEAPONS.gun.pelletCooldown,
    ammoMax: WEAPONS.gun.marks[0].ammo,
    damage: WEAPONS.gun.chunkDamage,
    shieldMultiplier: 0,
    timeOnTarget: WEAPONS.gun.marks[0].timeOnTarget,
    trackingTurn: 0,
    trackSeconds: 0,
    pelletCount: WEAPONS.gun.pelletCount,
    spread: WEAPONS.gun.spread,
  } satisfies WeaponModule,

  gunMk2: {
    kind: "weapon",
    family: "gun",
    id: "gun_mk2",
    name: "Gun",
    blurb:
      "Same stream and chunk. Deeper magazine, and less time on target before each chunk.",
    price: 240,
    tier: 2,
    fireCooldown: WEAPONS.gun.pelletCooldown,
    ammoMax: WEAPONS.gun.marks[1].ammo,
    damage: WEAPONS.gun.chunkDamage,
    shieldMultiplier: 0,
    timeOnTarget: WEAPONS.gun.marks[1].timeOnTarget,
    trackingTurn: 0,
    trackSeconds: 0,
    pelletCount: WEAPONS.gun.pelletCount,
    spread: WEAPONS.gun.spread,
  } satisfies WeaponModule,

  gunMk3: {
    kind: "weapon",
    family: "gun",
    id: "gun_mk3",
    name: "Gun",
    blurb:
      "Largest gun magazine and the shortest time on target before each chunk.",
    price: 520,
    tier: 3,
    fireCooldown: WEAPONS.gun.pelletCooldown,
    ammoMax: WEAPONS.gun.marks[2].ammo,
    damage: WEAPONS.gun.chunkDamage,
    shieldMultiplier: 0,
    timeOnTarget: WEAPONS.gun.marks[2].timeOnTarget,
    trackingTurn: 0,
    trackSeconds: 0,
    pelletCount: WEAPONS.gun.pelletCount,
    spread: WEAPONS.gun.spread,
  } satisfies WeaponModule,

  cannonMk1: {
    kind: "weapon",
    family: "cannon",
    id: "cannon_mk1",
    name: "Cannon",
    blurb:
      "Slow heavy slug, straight ahead. Half damage on shields — overkill past the bank is wasted.",
    price: 90,
    tier: 1,
    fireCooldown: WEAPONS.cannon.marks[0].fireCooldown,
    ammoMax: WEAPONS.cannon.marks[0].ammo,
    damage: WEAPONS.cannon.marks[0].damage,
    shieldMultiplier: WEAPONS.cannon.shieldMultiplier,
    timeOnTarget: 0,
    trackingTurn: 0,
    trackSeconds: 0,
    pelletCount: 1,
    spread: 0,
  } satisfies WeaponModule,

  cannonMk2: {
    kind: "weapon",
    family: "cannon",
    id: "cannon_mk2",
    name: "Cannon",
    blurb: "Harder slug, faster cycle, a few more rounds in the heavy magazine.",
    price: 270,
    tier: 2,
    fireCooldown: WEAPONS.cannon.marks[1].fireCooldown,
    ammoMax: WEAPONS.cannon.marks[1].ammo,
    damage: WEAPONS.cannon.marks[1].damage,
    shieldMultiplier: WEAPONS.cannon.shieldMultiplier,
    timeOnTarget: 0,
    trackingTurn: 0,
    trackSeconds: 0,
    pelletCount: 1,
    spread: 0,
  } satisfies WeaponModule,

  cannonMk3: {
    kind: "weapon",
    family: "cannon",
    id: "cannon_mk3",
    name: "Cannon",
    blurb: "Siege slug. Highest cannon damage, cycle, and magazine.",
    price: 580,
    tier: 3,
    fireCooldown: WEAPONS.cannon.marks[2].fireCooldown,
    ammoMax: WEAPONS.cannon.marks[2].ammo,
    damage: WEAPONS.cannon.marks[2].damage,
    shieldMultiplier: WEAPONS.cannon.shieldMultiplier,
    timeOnTarget: 0,
    trackingTurn: 0,
    trackSeconds: 0,
    pelletCount: 1,
    spread: 0,
  } satisfies WeaponModule,

  missileMk1: {
    kind: "weapon",
    family: "missile",
    id: "missile_mk1",
    name: "Missile",
    blurb:
      "Lighter than a slug. Locks the target nearest the cursor and does not switch. Tracking is short, then it flies straight. Quarter damage on shields.",
    price: 105,
    tier: 1,
    fireCooldown: WEAPONS.missile.fireCooldown,
    ammoMax: WEAPONS.missile.marks[0].ammo,
    damage: WEAPONS.missile.marks[0].damage,
    shieldMultiplier: WEAPONS.missile.shieldMultiplier,
    timeOnTarget: 0,
    trackingTurn: WEAPONS.missile.marks[0].trackingTurn,
    trackSeconds: WEAPONS.missile.trackSeconds,
    pelletCount: 1,
    spread: 0,
  } satisfies WeaponModule,

  missileMk2: {
    kind: "weapon",
    family: "missile",
    id: "missile_mk2",
    name: "Missile",
    blurb:
      "Heavier warhead, tighter homing, more rounds. Still locks once and flies off when tracking ends.",
    price: 300,
    tier: 2,
    fireCooldown: WEAPONS.missile.fireCooldown,
    ammoMax: WEAPONS.missile.marks[1].ammo,
    damage: WEAPONS.missile.marks[1].damage,
    shieldMultiplier: WEAPONS.missile.shieldMultiplier,
    timeOnTarget: 0,
    trackingTurn: WEAPONS.missile.marks[1].trackingTurn,
    trackSeconds: WEAPONS.missile.trackSeconds,
    pelletCount: 1,
    spread: 0,
  } satisfies WeaponModule,

  missileMk3: {
    kind: "weapon",
    family: "missile",
    id: "missile_mk3",
    name: "Missile",
    blurb:
      "Best missile warhead and the tightest turn. Short lock, then a straight run — no orbit.",
    price: 640,
    tier: 3,
    fireCooldown: WEAPONS.missile.fireCooldown,
    ammoMax: WEAPONS.missile.marks[2].ammo,
    damage: WEAPONS.missile.marks[2].damage,
    shieldMultiplier: WEAPONS.missile.shieldMultiplier,
    timeOnTarget: 0,
    trackingTurn: WEAPONS.missile.marks[2].trackingTurn,
    trackSeconds: WEAPONS.missile.trackSeconds,
    pelletCount: 1,
    spread: 0,
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
    maxJumpRange: 48,
    fuelCapacity: 24,
    warpChargesMax: null,
  } satisfies DriveModule,

  racingDrive: {
    kind: "drive",
    id: "racing_drive",
    name: "Racing Drive",
    blurb: "Hot thrusters and crisp turn authority. Smaller fuel tank.",
    price: 120,
    tier: 1,
    turnRate: SHIP.turnRate * 1.2,
    thrustAccel: SHIP.thrustAccel * 1.25,
    reverseAccel: SHIP.reverseAccel * 1.15,
    maxSpeed: SHIP.maxSpeed * 1.15,
    drag: SHIP.drag,
    maxJumpRange: 32,
    fuelCapacity: 18,
    warpChargesMax: null,
  } satisfies DriveModule,

  longRangeDrive: {
    kind: "drive",
    id: "long_range_drive",
    name: "Long-Range Drive",
    blurb: "Tuned hyperspace coil. Sluggish in-system, larger fuel tank.",
    price: 130,
    tier: 1,
    turnRate: SHIP.turnRate * 0.9,
    thrustAccel: SHIP.thrustAccel * 0.9,
    reverseAccel: SHIP.reverseAccel * 0.9,
    maxSpeed: SHIP.maxSpeed * 0.95,
    drag: SHIP.drag,
    maxJumpRange: 64,
    fuelCapacity: 32,
    warpChargesMax: null,
  } satisfies DriveModule,

  courierDrive: {
    kind: "drive",
    id: "courier_drive",
    name: "Courier Drive",
    blurb: "Trade-route coil. Solid thrust and a comfortable fuel tank.",
    price: 260,
    tier: 2,
    turnRate: SHIP.turnRate * 1.05,
    thrustAccel: SHIP.thrustAccel * 1.12,
    reverseAccel: SHIP.reverseAccel * 1.08,
    maxSpeed: SHIP.maxSpeed * 1.08,
    drag: SHIP.drag,
    maxJumpRange: 56,
    fuelCapacity: 28,
    warpChargesMax: null,
  } satisfies DriveModule,

  interceptorDrive: {
    kind: "drive",
    id: "interceptor_drive",
    name: "Interceptor Drive",
    blurb: "Combat thrusters first. Blistering in-system, stingy fuel tank.",
    price: 300,
    tier: 2,
    turnRate: SHIP.turnRate * 1.35,
    thrustAccel: SHIP.thrustAccel * 1.4,
    reverseAccel: SHIP.reverseAccel * 1.25,
    maxSpeed: SHIP.maxSpeed * 1.28,
    drag: SHIP.drag * 0.992,
    maxJumpRange: 36,
    fuelCapacity: 17,
    warpChargesMax: null,
  } satisfies DriveModule,

  explorerCoil: {
    kind: "drive",
    id: "explorer_coil",
    name: "Explorer Coil",
    blurb: "Surveyor's jump stack. Soft thrusters, deep fuel reserves.",
    price: 320,
    tier: 2,
    turnRate: SHIP.turnRate * 0.95,
    thrustAccel: SHIP.thrustAccel * 0.95,
    reverseAccel: SHIP.reverseAccel * 0.95,
    maxSpeed: SHIP.maxSpeed,
    drag: SHIP.drag,
    maxJumpRange: 80,
    fuelCapacity: 37,
    warpChargesMax: null,
  } satisfies DriveModule,

  afterburnCore: {
    kind: "drive",
    id: "afterburn_core",
    name: "Afterburn Core",
    blurb: "Late combat coil. Peak thrust and turn — smaller tank.",
    price: 580,
    tier: 3,
    turnRate: SHIP.turnRate * 1.45,
    thrustAccel: SHIP.thrustAccel * 1.55,
    reverseAccel: SHIP.reverseAccel * 1.35,
    maxSpeed: SHIP.maxSpeed * 1.4,
    drag: SHIP.drag * 0.99,
    maxJumpRange: 40,
    fuelCapacity: 20,
    warpChargesMax: null,
  } satisfies DriveModule,

  deepJumpArray: {
    kind: "drive",
    id: "deep_jump_array",
    name: "Deep Jump Array",
    blurb: "Long-haul hyperspace lattice. Slow locally, huge fuel tank.",
    price: 600,
    tier: 3,
    turnRate: SHIP.turnRate * 0.85,
    thrustAccel: SHIP.thrustAccel * 0.85,
    reverseAccel: SHIP.reverseAccel * 0.85,
    maxSpeed: SHIP.maxSpeed * 0.9,
    drag: SHIP.drag,
    maxJumpRange: 96,
    fuelCapacity: 44,
    warpChargesMax: null,
  } satisfies DriveModule,

  balancedHyperdrive: {
    kind: "drive",
    id: "balanced_hyperdrive",
    name: "Balanced Hyperdrive",
    blurb: "Premium all-rounder. Strong thrust and a large, reliable tank.",
    price: 650,
    tier: 3,
    turnRate: SHIP.turnRate * 1.15,
    thrustAccel: SHIP.thrustAccel * 1.25,
    reverseAccel: SHIP.reverseAccel * 1.15,
    maxSpeed: SHIP.maxSpeed * 1.18,
    drag: SHIP.drag,
    maxJumpRange: 72,
    fuelCapacity: 34,
    warpChargesMax: null,
  } satisfies DriveModule,

  // —— Utilities —————————————————————————————————————————————
  lightShield: {
    kind: "utility",
    id: "light_shield",
    name: "Shield",
    blurb:
      "Shield bank in front of plating and core. A break waits 12s before recharge.",
    price: 70,
    tier: 1,
    shieldMax: 4,
    shieldRegenDelay: 2.5,
    shieldRegenRate: 2.5,
    shieldBreakDowntime: 12,
    ammoBonus: 0,
    hullBonus: 0,
    cargoCapacity: 0,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
    fuelCapacity: 0,
    fuelScoop: false,
    poiScan: false,
  } satisfies UtilityModule,

  hullPlating: {
    kind: "utility",
    id: "hull_plating",
    name: "Hull Plating",
    blurb:
      "Plating bank ahead of core hull. Kinetic hits it hard. Does not add core HP.",
    price: 65,
    tier: 1,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    shieldBreakDowntime: 0,
    ammoBonus: 0,
    hullBonus: 3,
    cargoCapacity: 0,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
    fuelCapacity: 0,
    fuelScoop: false,
    poiScan: false,
  } satisfies UtilityModule,

  cargoRack: {
    kind: "utility",
    id: "cargo_rack",
    name: "Cargo Hold",
    blurb: "External holds measured in cargo units (CU). Value lives in the market, not the mass.",
    price: 55,
    tier: 1,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    shieldBreakDowntime: 0,
    ammoBonus: 0,
    hullBonus: 0,
    cargoCapacity: 8,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
    fuelCapacity: 0,
    fuelScoop: false,
    poiScan: false,
  } satisfies UtilityModule,

  mediumShield: {
    kind: "utility",
    id: "medium_shield",
    name: "Shield",
    blurb: "Thicker lattice. A break waits 8s before recharge.",
    price: 230,
    tier: 2,
    shieldMax: 8,
    shieldRegenDelay: 2.0,
    shieldRegenRate: 3.5,
    shieldBreakDowntime: 8,
    ammoBonus: 0,
    hullBonus: 0,
    cargoCapacity: 0,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
    fuelCapacity: 0,
    fuelScoop: false,
    poiScan: false,
  } satisfies UtilityModule,

  reinforcedHull: {
    kind: "utility",
    id: "reinforced_hull",
    name: "Hull Plating",
    blurb: "Thicker plating bank. Soaks kinetic once the shield is down.",
    price: 210,
    tier: 2,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    shieldBreakDowntime: 0,
    ammoBonus: 0,
    hullBonus: 6,
    cargoCapacity: 0,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
    fuelCapacity: 0,
    fuelScoop: false,
    poiScan: false,
  } satisfies UtilityModule,

  expandedHold: {
    kind: "utility",
    id: "expanded_hold",
    name: "Cargo Hold",
    blurb: "Deeper racks for longer trade runs. Still no shields.",
    price: 200,
    tier: 2,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    shieldBreakDowntime: 0,
    ammoBonus: 0,
    hullBonus: 0,
    cargoCapacity: 14,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
    fuelCapacity: 0,
    fuelScoop: false,
    poiScan: false,
  } satisfies UtilityModule,

  heavyShield: {
    kind: "utility",
    id: "heavy_shield",
    name: "Shield",
    blurb: "Late deflector bank. A break waits 5s before recharge.",
    price: 500,
    tier: 3,
    shieldMax: 14,
    shieldRegenDelay: 1.6,
    shieldRegenRate: 5.0,
    shieldBreakDowntime: 5,
    ammoBonus: 0,
    hullBonus: 1,
    cargoCapacity: 0,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
    fuelCapacity: 0,
    fuelScoop: false,
    poiScan: false,
  } satisfies UtilityModule,

  fortressPlating: {
    kind: "utility",
    id: "fortress_plating",
    name: "Hull Plating",
    blurb: "Heavy plating bank. The last buffer before core hull.",
    price: 480,
    tier: 3,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    shieldBreakDowntime: 0,
    ammoBonus: 0,
    hullBonus: 10,
    cargoCapacity: 0,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
    fuelCapacity: 0,
    fuelScoop: false,
    poiScan: false,
  } satisfies UtilityModule,

  freighterBay: {
    kind: "utility",
    id: "freighter_bay",
    name: "Cargo Hold",
    blurb: "Deep cargo spine. Built for multi-hop bulk runs.",
    price: 460,
    tier: 3,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    shieldBreakDowntime: 0,
    ammoBonus: 0,
    hullBonus: 0,
    cargoCapacity: 22,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
    fuelCapacity: 0,
    fuelScoop: false,
    poiScan: false,
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
    shieldBreakDowntime: 0,
    ammoBonus: 0,
    hullBonus: 0,
    cargoCapacity: 0,
    passengerCapacity: 0,
    mineralScanRange: 110,
    scoopRange: 0,
    fuelCapacity: 0,
    fuelScoop: false,
    poiScan: false,
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
    shieldBreakDowntime: 0,
    ammoBonus: 0,
    hullBonus: 0,
    cargoCapacity: 6,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 48,
    fuelCapacity: 0,
    fuelScoop: false,
    poiScan: false,
  } satisfies UtilityModule,

  /** 1-berth starter cabin — common on outpost shelves. */
  passengerBerth1: {
    kind: "utility",
    id: "passenger_berth_1",
    name: "Single Berth",
    blurb:
      "One passenger bunk (not CU). Required to accept fare contracts that fit free berths.",
    price: 55,
    tier: 1,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    shieldBreakDowntime: 0,
    ammoBonus: 0,
    hullBonus: 0,
    cargoCapacity: 0,
    passengerCapacity: 1,
    mineralScanRange: 0,
    scoopRange: 0,
    fuelCapacity: 0,
    fuelScoop: false,
    poiScan: false,
  } satisfies UtilityModule,

  /** 2-berth cabin — standard station stock. */
  passengerBerth2: {
    kind: "utility",
    id: "passenger_berth_2",
    name: "Twin Berth",
    blurb:
      "Two passenger bunks (not CU). Accept fares whose party fits free berths.",
    price: 80,
    tier: 1,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    shieldBreakDowntime: 0,
    ammoBonus: 0,
    hullBonus: 0,
    cargoCapacity: 0,
    passengerCapacity: 2,
    mineralScanRange: 0,
    scoopRange: 0,
    fuelCapacity: 0,
    fuelScoop: false,
    poiScan: false,
  } satisfies UtilityModule,

  /** 4-berth cabin — mid-tier / hub shelves. */
  passengerBerth4: {
    kind: "utility",
    id: "passenger_berth_4",
    name: "Quad Berth",
    blurb:
      "Four passenger bunks (not CU). Unlocks larger long-range fare parties.",
    price: 120,
    tier: 2,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    shieldBreakDowntime: 0,
    ammoBonus: 0,
    hullBonus: 0,
    cargoCapacity: 0,
    passengerCapacity: 4,
    mineralScanRange: 0,
    scoopRange: 0,
    fuelCapacity: 0,
    fuelScoop: false,
    poiScan: false,
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
    shieldBreakDowntime: 0,
    ammoBonus: 0,
    hullBonus: 0,
    cargoCapacity: 5,
    passengerCapacity: 0,
    mineralScanRange: 100,
    scoopRange: 44,
    fuelCapacity: 0,
    fuelScoop: false,
    poiScan: false,
  } satisfies UtilityModule,

  fuelScoop: {
    kind: "utility",
    id: "fuel_scoop",
    name: "Fuel Scoop",
    blurb:
      "Skims hydrogen from main-sequence stars. Hold F near the star to refill the tank.",
    price: 75,
    tier: 1,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    shieldBreakDowntime: 0,
    ammoBonus: 0,
    hullBonus: 0,
    cargoCapacity: 0,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
    fuelCapacity: 0,
    fuelScoop: true,
    poiScan: false,
  } satisfies UtilityModule,

  expandedFuelTank: {
    kind: "utility",
    id: "expanded_fuel_tank",
    name: "Expanded Fuel Tank",
    blurb:
      "Auxiliary tankage. Raises fuel capacity; installs with the tank topped by the bonus.",
    price: 85,
    tier: 1,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    shieldBreakDowntime: 0,
    ammoBonus: 0,
    hullBonus: 0,
    cargoCapacity: 0,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
    fuelCapacity: 12,
    fuelScoop: false,
    poiScan: false,
  } satisfies UtilityModule,

  /**
   * Single survey utility — no Mk ladder. Gates exploration missions and
   * completes a lightweight hold-F scan at exotic (non-derelict) POIs
   * (HUD tip when at the survey target — not in this blurb).
   */
  surveyScanner: {
    kind: "utility",
    id: "survey_scanner",
    name: "Survey Scanner",
    blurb:
      "Exploration suite. Required to accept scan contracts and survey exotic POIs.",
    price: 70,
    tier: 1,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    shieldBreakDowntime: 0,
    ammoBonus: 0,
    hullBonus: 0,
    cargoCapacity: 0,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
    fuelCapacity: 0,
    fuelScoop: false,
    poiScan: true,
  } satisfies UtilityModule,

  dualLattice: {
    kind: "utility",
    id: "dual_lattice",
    name: "Dual Lattice",
    blurb:
      "Hybrid kit — shields plus plating. A break waits 6s. Not on the Shield mark ladder.",
    price: 540,
    tier: 3,
    shieldMax: 10,
    shieldRegenDelay: 1.8,
    shieldRegenRate: 4.0,
    shieldBreakDowntime: 6,
    ammoBonus: 0,
    hullBonus: 4,
    cargoCapacity: 0,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
    fuelCapacity: 0,
    fuelScoop: false,
    poiScan: false,
  } satisfies UtilityModule,

  ammoExpander1: {
    kind: "utility",
    id: "ammo_expander_1",
    name: "Ammo Expander",
    blurb:
      "Magazine feed for every fitted weapon. Adds 25% rounds. Extra expanders stack.",
    price: 80,
    tier: 1,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    shieldBreakDowntime: 0,
    ammoBonus: 0.25,
    hullBonus: 0,
    cargoCapacity: 0,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
    fuelCapacity: 0,
    fuelScoop: false,
    poiScan: false,
  } satisfies UtilityModule,

  ammoExpander2: {
    kind: "utility",
    id: "ammo_expander_2",
    name: "Ammo Expander",
    blurb:
      "Larger feeds on every fitted weapon. Adds 50% rounds. Stacks with other expanders.",
    price: 240,
    tier: 2,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    shieldBreakDowntime: 0,
    ammoBonus: 0.5,
    hullBonus: 0,
    cargoCapacity: 0,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
    fuelCapacity: 0,
    fuelScoop: false,
    poiScan: false,
  } satisfies UtilityModule,

  ammoExpander3: {
    kind: "utility",
    id: "ammo_expander_3",
    name: "Ammo Expander",
    blurb:
      "Deep magazines on every fitted weapon. Doubles rounds. Stacks with other expanders.",
    price: 500,
    tier: 3,
    shieldMax: 0,
    shieldRegenDelay: 0,
    shieldRegenRate: 0,
    shieldBreakDowntime: 0,
    ammoBonus: 1,
    hullBonus: 0,
    cargoCapacity: 0,
    passengerCapacity: 0,
    mineralScanRange: 0,
    scoopRange: 0,
    fuelCapacity: 0,
    fuelScoop: false,
    poiScan: false,
  } satisfies UtilityModule,
} as const;

/** Fraction of list price credited when swapping a module off the ship. */
export const MODULE_TRADE_IN = 0.5;

export const CATALOG: EquipModule[] = [
  MODULES.gunMk1,
  MODULES.gunMk2,
  MODULES.gunMk3,
  MODULES.cannonMk1,
  MODULES.cannonMk2,
  MODULES.cannonMk3,
  MODULES.missileMk1,
  MODULES.missileMk2,
  MODULES.missileMk3,
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
  MODULES.passengerBerth1,
  MODULES.passengerBerth2,
  MODULES.passengerBerth4,
  MODULES.prospectingRig,
  MODULES.fuelScoop,
  MODULES.expandedFuelTank,
  MODULES.surveyScanner,
  MODULES.ammoExpander1,
  MODULES.ammoExpander2,
  MODULES.ammoExpander3,
];

export function createStarterSlots(): ShipSlot[] {
  return [
    {
      id: "slot_weapon_0",
      kind: "weapon",
      label: "Weapon",
      equipped: cloneModule(MODULES.gunMk1),
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
      // Match Sparrow defaultLoadout — Survey Scanner for explore on-ramp.
      equipped: cloneModule(MODULES.surveyScanner),
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

/**
 * Hardpoint index → held input.
 * Slot 1 Space, slot 2 left click, slot 3 right click.
 */
export const WEAPON_SLOT_BINDINGS = ["Space", "L-click", "R-click"] as const;

export function weaponSlotBinding(index: number): string | null {
  return WEAPON_SLOT_BINDINGS[index] ?? null;
}

/** Stat-ladder SKUs only — same role, better numbers (weapons / shield / plating / cargo). */
const TIER_MARK_MODULE_IDS = new Set<string>([
  "gun_mk1",
  "gun_mk2",
  "gun_mk3",
  "cannon_mk1",
  "cannon_mk2",
  "cannon_mk3",
  "missile_mk1",
  "missile_mk2",
  "missile_mk3",
  "light_shield",
  "medium_shield",
  "heavy_shield",
  "hull_plating",
  "reinforced_hull",
  "fortress_plating",
  "cargo_rack",
  "expanded_hold",
  "freighter_bay",
  "ammo_expander_1",
  "ammo_expander_2",
  "ammo_expander_3",
]);

export function moduleShowsTierMark(mod: EquipModule): boolean {
  return TIER_MARK_MODULE_IDS.has(mod.id);
}

/** Bay detail pane — e.g. `Shield (Mk II)` or `Survey Scanner`. */
export function moduleDetailTitle(mod: EquipModule): string {
  if (moduleShowsTierMark(mod)) {
    return `${mod.name} (${tierLabel(mod.tier)})`;
  }
  return mod.name;
}

/** Compact stock row — e.g. `Shield Mk II` or `Ore Scanner`. */
export function moduleStockLabel(mod: EquipModule): string {
  if (moduleShowsTierMark(mod)) {
    return `${mod.name} ${tierLabel(mod.tier)}`;
  }
  return mod.name;
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
