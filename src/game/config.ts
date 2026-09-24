/** Tunable flight feel — adjust here as you playtest. */
export const SHIP = {
  turnRate: (220 * Math.PI) / 180,
  thrustAccel: 220,
  reverseAccel: 140,
  maxSpeed: 420,
  drag: 0.985,
  size: 14,
} as const;

export const STARFIELD = {
  layers: [
    { count: 80, size: 1.0, alpha: 0.45 },
    { count: 50, size: 1.4, alpha: 0.7 },
    { count: 25, size: 2.0, alpha: 0.95 },
  ],
} as const;

export const LOOP = {
  fixedDt: 1 / 60,
  maxSteps: 5,
} as const;

/**
 * Galaxy POI mix — realistic / possible discrete locations.
 * Star systems dominate; exotica stay rare but present in 100.
 */
export const GALAXY = {
  seed: 0x51a7e001,
  poiCount: 100,
  chartSpread: 160,
  minSeparation: 14,
  jumpRange: 48,
  startPoiId: 0,
  rarity: {
    starSystem: 82,
    derelict: 6,
    brownDwarf: 4,
    neutronStar: 3,
    roguePlanet: 3,
    nebula: 1,
    blackHole: 1,
  },
} as const;

/**
 * Main-sequence spectral classes.
 * Weights ≈ real IMF skew (M dwarfs dominate) with floors so rarer
 * classes still appear in a 100-POI starter cluster.
 */
export const STARS = {
  /** Approximate share of star-system POIs (rebalanced to sum ~1). */
  weights: {
    M: 0.52,
    K: 0.18,
    G: 0.12,
    F: 0.08,
    A: 0.05,
    B: 0.03,
    O: 0.02,
  },
  /** Minimum counts among star systems so hot stars aren't absent. */
  floors: {
    M: 0,
    K: 8,
    G: 6,
    F: 4,
    A: 3,
    B: 2,
    O: 1,
  },
  /** Start system forced class (familiar Sol-like). */
  startClass: "G" as const,
  colors: {
    O: "#9bb0ff",
    B: "#a8c0ff",
    A: "#d0dcff",
    F: "#f5f3ff",
    G: "#ffe566",
    K: "#ffb060",
    M: "#ff6b4a",
  },
  /** Visual radius scale in local view */
  radiusScale: {
    O: 1.35,
    B: 1.25,
    A: 1.15,
    F: 1.05,
    G: 1.0,
    K: 0.9,
    M: 0.75,
  },
} as const;

/**
 * Orbiting-body architecture by host star.
 * min 0 = barren systems allowed.
 * Zone types come from orbital index (inner→outer), not random flips.
 */
export const SYSTEM = {
  bodyCountByStar: {
    O: { min: 0, max: 2 },
    B: { min: 0, max: 3 },
    A: { min: 0, max: 4 },
    F: { min: 0, max: 5 },
    G: { min: 0, max: 6 },
    K: { min: 0, max: 5 },
    M: { min: 0, max: 4 },
  },
  /**
   * Which classes can roll a true habitable-zone world.
   * Hot O/B sterilize; tiny M zones are rare in this model.
   */
  habitableCapable: ["F", "G", "K"] as const,
  /** Chance a mid-system slot becomes an asteroid belt instead of rocky */
  asteroidBeltChance: 0.28,
  starStationChance: 0.4,
  /** Stations only on solid worlds / gas giants — not belts */
  planetStationChance: 0.35,
  gasGiantStationChance: 0.25,
} as const;

export const LOCAL = {
  starRadiusBase: 40,
  stationRadius: 18,
  arrivalDistance: 120,
  stationOrbitMin: 140,
  stationOrbitMax: 260,
  planetRadiusMin: 22,
  planetRadiusMax: 36,
  gasGiantScale: 1.6,
  iceScale: 0.95,
  moltenScale: 0.9,
  /** Half-length of the local belt chord (along-orbit). Far past starting view. */
  beltSpan: 2800,
  /** Half-thickness of the belt band (radial width of the chord). */
  beltThickness: 160,
  /** Target rocks per belt (placement may place fewer if gaps can't fit). */
  beltRockCount: 90,
  /** Extra clearance between rock edges (no overlaps). */
  beltMinGap: 14,
  /**
   * Along-track density exponent (>1 packs rocks toward the arrival center).
   * Higher = denser middle, emptier far wings.
   */
  beltDensityFalloff: 2.1,
} as const;

export const BODY_COLORS = {
  molten: "#ff5530",
  habitable: "#4a9a72",
  rocky: "#9a8570",
  gasGiant: "#d4b878",
  ice: "#c5e4f5",
  asteroidBelt: "#8a8490",
} as const;

export const JUMP = {
  fadeSeconds: 0.35,
} as const;

export const COMBAT = {
  maxHealth: 10,
  projectileDamage: 1,
  /** seconds between player shots */
  fireCooldown: 0.35,
  /** pirate fires at 30% of the player's rate (raider baseline) */
  pirateFireCooldown: 0.35 / 0.3,
  projectileSpeed: 520,
  projectileRadius: 2.5,
  playerHitRadius: 12,
  /** Fallback hit/draw sizes when a tier is unavailable. */
  pirateRadius: 14,
  pirateSize: 13,
  /**
   * Legacy flat spawn chance — encounter generation prefers ENCOUNTERS.heatBands.
   * Kept as a mid-band reference (~0.25).
   */
  pirateSpawnChance: 0.25,
  pirateSpawnMin: 220,
  pirateSpawnMax: 380,
  /** fraction of player max speed / thrust (raider baseline) */
  pirateSpeedFactor: 0.8,
  pirateTurnRate: (200 * Math.PI) / 180,
  /** enter combat when player is this close */
  pirateThreatRange: 480,
  /** stop closing once within this distance */
  pirateEngageRange: 200,
  /** while fleeing, warp away after reaching this distance */
  pirateRetreatRange: 560,
  /** half-angle (radians) of fire cone — imperfect aim */
  pirateFireCone: (14 * Math.PI) / 180,
  /** inset from screen edge for off-screen pirate markers */
  offscreenMargin: 22,
  /** projectiles live this many viewport sizes past the view edge */
  projectileDespawnViewMultiples: 10,
  /** seconds the pirate waits for payment after demanding a fee */
  pirateCommsTimeout: 60,
} as const;

/**
 * Pirate hull tiers — distinct silhouettes / loadouts for Must-have 4.
 * Stats are relative to the player's starter combat feel.
 */
export const PIRATE_TIERS = {
  scout: {
    label: "Scout",
    maxHealth: 6,
    size: 10,
    radius: 11,
    speedFactor: 1.05,
    /** Multiplier on COMBAT.pirateFireCooldown (higher = slower). */
    fireCooldownMul: 1.25,
    damage: 1,
    turnRateMul: 1.15,
    color: "#d07060",
    stroke: "#9a3830",
  },
  raider: {
    label: "Raider",
    maxHealth: 10,
    size: 13,
    radius: 14,
    speedFactor: 0.8,
    fireCooldownMul: 1,
    damage: 1,
    turnRateMul: 1,
    color: "#c45a4a",
    stroke: "#8a3028",
  },
  gunship: {
    label: "Gunship",
    maxHealth: 16,
    size: 17,
    radius: 18,
    speedFactor: 0.62,
    fireCooldownMul: 1.15,
    damage: 2,
    turnRateMul: 0.75,
    color: "#a84840",
    stroke: "#6a2018",
  },
  corsair: {
    label: "Corsair",
    maxHealth: 14,
    size: 15,
    radius: 16,
    speedFactor: 0.92,
    fireCooldownMul: 0.72,
    damage: 2,
    turnRateMul: 1.05,
    color: "#b05070",
    stroke: "#701838",
  },
} as const;

export type PirateTierId = keyof typeof PIRATE_TIERS;

/**
 * Encounter templates + heat bands.
 * Chart distance from the start POI drives early-readable vs late-hard fights.
 */
export const ENCOUNTERS = {
  /** Chart-distance bands from GALAXY.startPoiId (chart units). */
  heatBands: [
    { maxDist: 42, spawnChance: 0.16, id: "near" as const },
    { maxDist: 95, spawnChance: 0.27, id: "mid" as const },
    { maxDist: Number.POSITIVE_INFINITY, spawnChance: 0.4, id: "far" as const },
  ],
  /**
   * Relative template weights per heat band.
   * Near space prefers lone scouts / single patrols; far space leans wing / ambush / heat.
   */
  templateWeights: {
    scout: { near: 55, mid: 18, far: 4 },
    patrol: { near: 35, mid: 34, far: 14 },
    wing: { near: 8, mid: 28, far: 28 },
    ambush: { near: 2, mid: 15, far: 26 },
    heat: { near: 0, mid: 5, far: 28 },
  },
  /** Extra weight added to wing/ambush/heat when the system is "wealthy". */
  wealthyBoost: {
    wing: 6,
    ambush: 4,
    heat: 14,
  },
  /** Station count at or above this counts as wealthy-system heat. */
  wealthyStationThreshold: 3,
  /** Group tribute by template (credits). */
  feeByTemplate: {
    scout: 8,
    patrol: 10,
    wing: 18,
    ambush: 16,
    heat: 28,
  },
  /** Ambush packs spawn closer than open patrols. */
  ambushSpawnMin: 140,
  ambushSpawnMax: 240,
  /** Formation offset radius for multi-ship packs (world units). */
  formationRadius: 48,
} as const;

export type EncounterTemplateId = keyof typeof ENCOUNTERS.templateWeights;

export const ECONOMY = {
  startingCredits: 100,
  /** Default / patrol tribute — encounter fee overrides when present. */
  pirateFee: 10,
  repairCostPerHp: 1,
  /** Credits paid per eliminated pirate when docking at any station. */
  redemptionPerPirate: 10,
  /** Bonus for completing a system pirate-clearance quest. */
  pirateQuestReward: 50,
} as const;

/**
 * Dynamic cargo markets — POI flavor + neighbor supply/demand.
 * Bias ∈ [-1,1]: +surplus (cheap buy) / −shortage (strong sell).
 */
export const MARKET = {
  /** How hard local/neighbor bias moves mid-price vs base. */
  biasStrength: 0.55,
  /** Half-spread as a fraction of mid when a station runs a two-way book. */
  spreadFraction: 0.12,
  /** Extra spread when a station both buys and sells the same good. */
  twoWaySpreadBump: 0.05,
  localBiasWeight: 0.78,
  neighborBiasWeight: 0.22,
  /** Neighbors within jumpRange * this factor influence prices. */
  neighborRangeFactor: 1.15,
  neighborDistanceFloor: 6,
  /** Seeded noise around the deterministic mid (± fraction). */
  noiseAmplitude: 0.05,
  surplusThreshold: 0.32,
  shortageThreshold: 0.32,
  specialtyThreshold: 0.55,
  neighborSignalThreshold: 0.28,
  /** Base CU stock/demand before bias scaling. */
  baseStock: 20,
  baseDemand: 18,
  stockBiasScale: 28,
  demandBiasScale: 28,
} as const;

/**
 * Station mission board (non-combat) — cargo transit + exploration scans.
 * Passenger fares stay design-only until a berth utility ships (Must-have 6).
 */
export const QUEST = {
  /** Max concurrent accepted board missions. */
  maxActive: 2,
  cargoCuMin: 2,
  cargoCuMax: 5,
  cargoBaseReward: 25,
  cargoPerCu: 8,
  cargoPerDistance: 1.2,
  /** How far (in jump-range multiples) cargo destinations may sit. */
  cargoMaxJumpRanges: 2.2,
  exploreBaseReward: 45,
  explorePerDistance: 1.6,
  exploreMaxJumpRanges: 2.5,
  /**
   * Passenger fare design hooks (unused until berths equip):
   * payouts should beat cargo of similar distance; require passengerCapacity.
   */
  passengerBaseReward: 70,
  passengerPerBerth: 20,
  passengerPerDistance: 2.4,
} as const;

export const DOCK = {
  /** world units — close enough to snap into dock */
  arriveDistance: 8,
  /** autopilot cruise speed cap */
  approachSpeed: 220,
  /** slow-down distance for smooth arrival */
  brakeDistance: 140,
  /** click hit pad beyond station radius */
  clickPad: 10,
  messageSidebarWidth: 300,
  messageMax: 14,
  /** seconds before a comms line expires */
  messageTtl: 8,
} as const;

/**
 * Reputation — stations + pirate faction (first slice).
 * See docs/reputation-system.md in the project Context store.
 */
export const REPUTATION = {
  min: -100,
  max: 100,
  /** Band thresholds (inclusive edges described in standingBand()). */
  hostileAtOrBelow: -50,
  unfriendlyAtOrBelow: -20,
  friendlyAtOrAbove: 20,
  alliedAtOrAbove: 50,
  /** Station deltas */
  missionComplete: 10,
  stealCargo: -25,
  cancelMissionMild: -5,
  /** Pirate faction deltas */
  pirateKill: -8,
  pirateFeePaid: 5,
  /** Bay net-install discount fractions by station band. */
  bayDiscountFriendly: 0.08,
  bayDiscountAllied: 0.15,
  /** Patrol fine: max(min, abs(negativeStanding) * perPoint). */
  patrolFineMin: 15,
  patrolFinePerPoint: 2,
} as const;

/**
 * Station patrol NPCs — local law tied to a host station.
 * Distinct from pirate encounter template id "patrol".
 */
export const PATROL = {
  /** Chance a given station gets a patrol when entering its local view. */
  spawnChance: 0.62,
  /** Half-size of the calm circuit rectangle around the host station. */
  circuitRadius: 70,
  size: 12,
  radius: 13,
  /** Extra click pad so fines are easy to open while idle/circuit. */
  clickPad: 18,
  maxHealth: 12,
  /** Hunt thrust vs player ship (only while chasing pirates). */
  speedFactor: 0.88,
  /** Calm circuit cruise speed (world units / sec) — slow and readable. */
  circuitSpeed: 55,
  fireCooldown: 0.55,
  damage: 1,
  turnRateMul: 0.85,
  color: "#6a9ec8",
  stroke: "#3a6a98",
  /** Engage pirates within this range of the patrol. */
  huntRange: 520,
  engageRange: 190,
  /** Seconds sitting still (pirate-like idle) before starting a circuit. */
  idleHoldMin: 4,
  idleHoldMax: 9,
  /** Seconds cruising the circuit before parking again. */
  circuitHoldMin: 8,
  circuitHoldMax: 14,
  /** Arrive within this distance to advance to the next circuit corner. */
  waypointArrive: 14,
} as const;
