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
  projectileSpeed: 520,
  projectileRadius: 2.5,
  playerHitRadius: 12,
  /**
   * Legacy flat spawn chance — encounter generation prefers ENCOUNTERS.heatBands.
   * Kept as a mid-band reference (~0.25).
   */
  pirateSpawnChance: 0.25,
  pirateSpawnMin: 220,
  pirateSpawnMax: 380,
  /** enter combat when player is this close */
  pirateThreatRange: 480,
  /** Legacy single stop-closing distance. Pathing uses weapon bands. */
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
 * Player weapons. Kinetic families (gun / cannon / missile) plus energy
 * pulse and beam. Marks are a stat ladder inside one family.
 *
 * Shields take `shieldMultiplier` of a hit. If that scaled damage meets or
 * exceeds the shield bank, the shield breaks and the excess is wiped
 * (no spill into plating or core). How long the break lasts is the
 * shield module's own stat. With shields down, plating takes
 * `platingMultiplier` (kinetic is 1) and leftover of that reduced hit
 * spills to core. With plating empty, core takes the full listed amount.
 * Guns never touch shields (multiplier 0).
 */
export const WEAPONS = {
  /**
   * Fallback shield fraction when a caller does not pass the shot's own.
   * Pirate and patrol guns, cannons, and missiles pass their module multiplier.
   */
  npcShieldMultiplier: 0.5,
  /** Gap between pellet impacts that resets a gun's time-on-target. */
  gunStreamBreakGap: 0.25,
  gun: {
    /** HP removed once per maintained stream, not per shot. */
    chunkDamage: 6,
    /**
     * Seconds between shots. One round per shot (recoil picks a heading
     * inside the cone). Doubled from the old 0.10 s paired volley so a
     * single shot replaces each of the two pellets.
     */
    pelletCooldown: 0.05,
    pelletCount: 1,
    /** Half-angle of the cone, radians. */
    spread: (3.2 * Math.PI) / 180,
    pelletSpeed: 760,
    pelletRadius: 1.5,
    /**
     * Marks raise ammo and shorten time-on-target. Chunk size stays put,
     * so a higher mark deals that chunk more often.
     * Per-second chunk: Mk I 6, Mk II ~8.6, Mk III ~13.3.
     */
    marks: [
      { ammo: 360, timeOnTarget: 1 },
      { ammo: 560, timeOnTarget: 0.7 },
      { ammo: 800, timeOnTarget: 0.45 },
    ],
  },
  cannon: {
    shieldMultiplier: 0.5,
    slugSpeed: 380,
    slugRadius: 4.4,
    /** Marks: damage, rate of fire, ammo. Small heavy magazine. */
    marks: [
      { damage: 14, fireCooldown: 1.15, ammo: 8 },
      { damage: 22, fireCooldown: 0.85, ammo: 12 },
      { damage: 34, fireCooldown: 0.62, ammo: 18 },
    ],
  },
  missile: {
    shieldMultiplier: 0.25,
    radius: 3.1,
    /**
     * Same launch rate on every mark. The ladder is damage, tracking,
     * ammo, and speed. Mk I stays at 320. Mk II and Mk III step up and
     * stay under the gun pellet (760), so a missile is still the slower
     * homing shot.
     */
    fireCooldown: 0.85,
    /**
     * Lock steering window. After this the missile keeps its heading
     * and flies off — it does not orbit.
     */
    trackSeconds: 1.4,
    /**
     * Damage stays under the same-mark gun's per-second chunk
     * (6 / ~8.6 / ~13.3) and under the same-mark cannon slug.
     */
    marks: [
      { damage: 4, trackingTurn: 1.6, ammo: 20, speed: 320 },
      { damage: 7, trackingTurn: 2.7, ammo: 32, speed: 480 },
      { damage: 11, trackingTurn: 4.2, ammo: 46, speed: 640 },
    ],
  },
  /**
   * Thin instant beam. Stops on the first target. No deflection.
   * Marks raise range and damage, and lower cooldown and heat.
   * Range stays short-to-mid: under the missile hold (420) and
   * shorter than the beam. Mk I damage stays under the gun chunk (6).
   * 100% shields, 100% core, 25% plating.
   */
  pulse: {
    shieldMultiplier: 1,
    platingMultiplier: 0.25,
    /** How long the instant line stays drawn. */
    flashSeconds: 0.08,
    marks: [
      { damage: 4, range: 180, fireCooldown: 0.55, heat: 6 },
      { damage: 5, range: 250, fireCooldown: 0.4, heat: 4 },
      { damage: 7, range: 300, fireCooldown: 0.28, heat: 3 },
    ],
  },
  /**
   * Held beam, drawn as a thick line. Same long reach on every mark (past
   * the missile hold, so it already covers short through long). Marks set
   * the opening hit, the sustain chunk, and the mark interval, and lower
   * upfront heat, heat per second, and the restart cooldown.
   * Opening hit is 3 / 4 / 5. Sustain chunk is 8 / 10 / 12.
   * The mark interval is 1.00 / 0.70 / 0.45 s, stored on the module.
   * Once a beam damages a target, that target takes nothing until the
   * interval passes. Leaving the hull does not reset that timer and does
   * not arm another opening hit. The next packet is the sustain chunk.
   * A new opening hit happens only after the beam is released and fired
   * again. Guns still use their own stream break and have no first hit.
   * The beam stays on the heading it was fired along.
   * 100% shields, 100% core, 50% plating.
   * Each target after the first takes `falloff` of the previous listed damage.
   */
  beam: {
    shieldMultiplier: 1,
    platingMultiplier: 0.5,
    range: 640,
    /** Listed-damage multiplier for each target after the previous one. */
    falloff: 0.6,
    /**
     * Reach past the centerline that still counts as a hit.
     * The drawn stroke is twice this (the camera is 1:1): a 7px line,
     * thicker than the pulse (1.5) and not a corridor.
     */
    halfWidth: 3.5,
    marks: [
      { damage: 3, chunkDamage: 8, interval: 1, heat: 10, heatPerSecond: 14, fireCooldown: 0.45 },
      { damage: 4, chunkDamage: 10, interval: 0.7, heat: 7, heatPerSecond: 10, fireCooldown: 0.32 },
      { damage: 5, chunkDamage: 12, interval: 0.45, heat: 5, heatPerSecond: 7, fireCooldown: 0.22 },
    ],
  },
} as const;

/**
 * Drive heat. Energy weapons, a hyperspace jump, and an intra-system
 * jump add heat. Both jumps add the same flat amount.
 * The equipped drive supplies sink, vent delay, and vent rate.
 * Jump heat is flat — it does not scale with distance.
 * A jump commits only when the sink can take all of it first
 * (`heat + jump` at or under the sink). Landing on the cap is allowed.
 * 14 is under the Basic sink (48), so one jump from a cold drive fits,
 * and five Pulse Mk I shots (6 each) still leave room for that jump.
 */
export const HEAT = {
  jump: 14,
} as const;

/**
 * Distress bands. Fuel Rat standing still lerps these four weights.
 * Spawn maps a rolled band onto an overlapping difficulty range.
 */
export type PirateTierId = "scout" | "raider" | "gunship" | "corsair";

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
  /**
   * Rare mid-stay pirate intrusion into the player's current local view.
   * One roll per enter: delay in [delayMin, delayMax], then `chance` to spawn.
   * After the window (~60s) with no spawn, the player can AFK safely.
   */
  intrusion: {
    delayMin: 30,
    delayMax: 60,
    /** Extra-rare — far below heat-band arrival spawn rates. */
    chance: 0.035,
    /** Usually a lone scout; small chance of a two-ship pair. */
    dualChance: 0.22,
  },
} as const;

export type EncounterTemplateId = keyof typeof ENCOUNTERS.templateWeights;

export const ECONOMY = {
  startingCredits: 100,
  /** Default / patrol tribute — encounter fee overrides when present. */
  pirateFee: 10,
  /** Legacy — dock repair/refuel is complimentary (no charge). */
  repairCostPerHp: 1,
  /** Legacy — dock repair/refuel is complimentary (no charge). */
  refuelCost: 1,
  /** Credits paid per eliminated pirate when docking at any station. */
  redemptionPerPirate: 10,
  /**
   * Credits paid per newly visited POI when docking (Cartographer bank).
   * Intentionally tiny vs pirate bounty.
   */
  cartographerCreditsPerVisit: 3,
} as const;

/**
 * Ship fuel — hyperspace + supercruise only (not local flight).
 * Drive / hull / Expanded Tank set capacity. Max jump range is the equipped drive.
 */
export const FUEL = {
  /** Flat cost for one system-map (supercruise) hop. */
  supercruiseCost: 1,
  /** Fuel burned per chart-ly on a galactic jump. */
  fuelPerLy: 0.2,
  /** Hold F near a main-sequence star with Fuel Scoop fitted. */
  scoopSecondsPerUnit: 1.2,
  /** How close (beyond star radius) the scoop must be. */
  scoopRangePad: 28,
  /**
   * L-menu distress: pirate vs Fuel Rat odds scale with Fuel Rats reputation.
   * Allied (≥ REPUTATION.alliedAtOrAbove) → hard 0% pirates (always Fuel Rat).
   * Negative → higher pirate chance, larger packs, harder tiers.
   * See `distressOdds.ts` for the piecewise lerp.
   */
  /** Pirate roll at Fuel Rat standing 0 (Neutral baseline). */
  distressPirateChanceNeutral: 0.55,
  /** Pirate roll at Fuel Rat Hostile floor (≤ REPUTATION.hostileAtOrBelow). */
  distressPirateChanceHostile: 0.95,
  /**
   * Pirate roll at Fuel Rat Friendly floor (≥ friendlyAtOrAbove, < Allied).
   * Allied band is always 0 — not a tunable.
   */
  distressPirateChanceFriendly: 0.2,
  /** Pack size (inclusive) at Neutral / Hostile / Friendly Fuel Rat standing. */
  distressPirateMinNeutral: 1,
  distressPirateMaxNeutral: 3,
  distressPirateMinHostile: 3,
  distressPirateMaxHostile: 5,
  distressPirateMinFriendly: 1,
  distressPirateMaxFriendly: 2,
  /** Pack tribute at Neutral / Hostile / Friendly. */
  distressFeeNeutral: 12,
  distressFeeHostile: 28,
  distressFeeFriendly: 8,
  /**
   * Relative tier weights at Neutral / Hostile / Friendly.
   * Negative standing lerps Neutral→Hostile; positive lerps Neutral→Friendly.
   */
  distressTierWeightsNeutral: {
    scout: 55,
    raider: 45,
    gunship: 0,
    corsair: 0,
  },
  distressTierWeightsHostile: {
    scout: 5,
    raider: 25,
    gunship: 40,
    corsair: 30,
  },
  distressTierWeightsFriendly: {
    scout: 80,
    raider: 20,
    gunship: 0,
    corsair: 0,
  },
  /** Seconds of taunt before distress pirates aggro. */
  distressTauntSeconds: 3.5,
  /**
   * After distress pirates arrive: if any of that pack is still present
   * when this elapses, an Imperial Bulwark and Hauler move in on them.
   */
  distressImperialSeconds: 45,
  /**
   * While current fuel can already reach a station, this many distress
   * calls in one local view are still answered. The next is ignored.
   */
  distressAbuseAnswerLimit: 2,
  /**
   * L-menu distress only: seconds after broadcast before a Fuel Rat or
   * pirate pack appears. Answer-distress sites spawn their contact on
   * arrival — that wait is not this timer.
   */
  distressResponseDelayMin: 8,
  distressResponseDelayMax: 15,
  /** Fuel rat visual + arrival tuning. */
  ratFill: "#9fd9a8",
  ratStroke: "#4a9a5c",
  ratSize: 13,
  ratCommsRange: 160,
  ratCommsSeconds: 2.2,
  ratDepartRange: 520,
  /** Spawn distance from player for distress responders. */
  distressSpawnMin: 220,
  distressSpawnMax: 340,
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
 * Black market (Must-have 9) — illegal cargo only; stripped from main Market.
 * Risk pairs with Must-have 11 patrol scan (fee above these rates).
 * Availability is rolled with other dock menus (Must-have 10).
 *
 * Margin intent (route smuggling, not local flips):
 * - Clear illegal surplus→shortage: ~25–45 cr/CU (beats legal ~7–15).
 * - Specialty extremes (e.g. organs gas-giant dump) can run higher.
 * - Same-station two-way books still lose to the spread.
 */
export const BLACK_MARKET = {
  /** Mid-price markup vs commodity base (player pays more / risks more). */
  pricePremium: 0.55,
  /**
   * How hard bias moves BM mid-price.
   * Own strength (not diluted vs legal) so surplus→shortage clears a fat route margin.
   */
  biasStrength: 0.42,
  /** Half-spread for two-way (quiet) BM books — same-station flips lose. */
  spreadFraction: 0.16,
  /** Sell-side of two-way spread as a fraction of the buy-side half-spread. */
  twoWaySellSpreadFactor: 0.55,
  noiseAmplitude: 0.06,
  /** One-way dump/import thresholds (aligned with legal readability). */
  surplusThreshold: 0.32,
  shortageThreshold: 0.32,
  baseStock: 14,
  baseDemand: 16,
  stockBiasScale: 22,
  demandBiasScale: 24,
} as const;

/**
 * Station dock menu variety (Must-have 10).
 * Missions are always on; repair/refuel is complimentary on dock (no button).
 * Optional menus (bay / hangar / market / black market) roll a seed-stable
 * subset — higher counts are rarer; the full optional set is rarest.
 * Index 0 = Missions only (most common).
 * `countWeights[k]` = relative weight for offering exactly k optional menus.
 */
export const STATION_MENU_VARIETY = {
  /** Index = optional-menu count (0..4 for bay/hangar/market/blackMarket). */
  countWeights: [32, 28, 22, 13, 5] as const,
} as const;

/**
 * Station mission board (non-combat) — cargo transit, exploration scans,
 * Retrieve Derelict Cargo, and passenger fares (berths, not CU).
 * Passenger fares need a Passenger Berth equipped (Must-have 5–6).
 */
export const QUEST = {
  /** Max concurrent regular board missions (rebel jobs have their own cap). */
  maxActive: 2,
  /**
   * Rebel contracts held at once, in addition to `maxActive` regular missions.
   * Offered only at a black market after Rebels are revealed.
   */
  maxRebelActive: 2,
  /** How many rebel offers a black-market board lists at once. */
  rebelOfferCount: 2,
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
  /** Utility module id required to accept exploration / scan missions. */
  exploreRequiredModuleId: "survey_scanner",
  /** Seconds holding F at the target POI to complete a survey scan. */
  exploreScanSeconds: 1.2,
  /** Retrieve Derelict Cargo — scoop 1 CU at a derelict, return to claim. */
  derelictCargoCu: 1,
  derelictCargoBaseReward: 55,
  derelictCargoPerDistance: 1.8,
  derelictCargoMaxJumpRanges: 2.5,
  /**
   * Passenger fares — berths (not CU); payouts beat cargo of similar distance.
   * Party sizes match berth capacities — Single / Twin / Quad (1 / 2 / 4).
   */
  passengerPartySizes: [1, 2, 4] as const,
  passengerBaseReward: 70,
  passengerPerBerth: 20,
  passengerPerDistance: 2.4,
  /** Prefer destinations at least this many jump-ranges away (long-haul). */
  passengerMinJumpRanges: 1.05,
  passengerMaxJumpRanges: 2.8,
  /** Chance pirates intercept on a jump that is not the final fare arrival. */
  passengerInterceptChance: 0.1,
  /** Seconds of taunt before intercept pack goes hostile (no fee demand). */
  passengerInterceptAggroSeconds: 2.5,
  /**
   * Rebel jobs at a black market (after Rebels are revealed).
   * Standing gate for the second tier is `REPUTATION.rebelsFriendlyJobStanding`.
   * Steal / kidnap credit payouts are flat — the cover haul or fare is the one
   * on this station's board. Steal turns in at the nearest other black market.
   * Derelict and scan jobs reuse the normal distance formulas.
   * Patrol destroy: kill that station's patrol, claim back at the offering market.
   */
  rebelStealReward: 110,
  rebelKidnapReward: 160,
  bmDestroyPatrolBaseReward: 120,
  bmDestroyPatrolPerDistance: 2,
  bmDestroyPatrolMaxJumpRanges: 2.5,
  /** Fuel Rat “Answer distress” — chance the site is pirate bait. */
  distressAnswerBaitChance: 0.4,
  /** Seconds of bait taunt before aggro (no fee demand). */
  distressAnswerAggroSeconds: 3,
  /** How far (in jump-range multiples) distress-answer destinations may sit. */
  distressAnswerMaxJumpRanges: 2.5,
  /** Utility module id required to accept Fuel Rat distress contracts. */
  distressAnswerRequiredModuleId: "expanded_fuel_tank",
  /**
   * Pirate clearance pay, summed for every ship still on the contract.
   * Difficulty is that pack's ladder step (1–7). Group size is the ship
   * count — each hull adds a share. Loadout is the fit's hull, weapon, and
   * defense list price, divided by `clearanceLoadoutDivisor`.
   */
  clearancePerShip: 8,
  clearancePerDifficulty: 18,
  clearanceLoadoutDivisor: 25,
} as const;

/**
 * Asteroid-belt prospecting (Must-have 6).
 * Requires Ore Scanner + Cargo Scoop (or Prospecting Rig) equipped.
 * Derelict debris scoop (Retrieve Derelict Cargo) needs Cargo Scoop only.
 */
export const SCOOP = {
  /** Hold F while in range of a scanned rock to collect. */
  collectKeyHint: "F",
  /** Seconds of continuous scooping per 1 CU. */
  secondsPerCu: 1.6,
  /** How close (world units beyond rock radius) the scoop must be. */
  rangePad: 6,
  /** Max CU remaining on a rich rock when generated. */
  rockYieldMin: 1,
  rockYieldMax: 3,
  /** Share of belt rocks that hold scoopable ore (rest are barren scenery). */
  richRockChance: 0.28,
  /** Among rich rocks: minerals / alloys / precious weights (sum ≈ 1). */
  yieldWeights: {
    minerals: 0.55,
    alloys: 0.32,
    precious_metals: 0.13,
  },
  /** Interactive debris pieces around a derelict hulk. */
  derelictDebrisCount: 18,
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
  /** Fixed panel height (header + scrollable body). */
  messageSidebarHeight: 220,
  /** Retained history lines (FIFO once full). */
  messageMax: 40,
  /** seconds before a fresh line fades from the live view */
  messageTtl: 18,
} as const;

/**
 * Reputation — stations + Imperial / pirate / Fuel Rats / Rebels / guild factions.
 * Station ladder includes Violation between Unfriendly and Hostile.
 * Imperial uses the non-station bands (no Violation), same as pirates.
 * See docs/reputation-system.md in the project Context store.
 */
export const REPUTATION = {
  min: -100,
  max: 100,
  /**
   * Station bands (score ≤ threshold):
   * Hostile ≤ −70 | Violation ≤ −40 | Unfriendly ≤ −15 | else Neutral until Friendly.
   */
  hostileAtOrBelow: -70,
  violationAtOrBelow: -40,
  unfriendlyAtOrBelow: -15,
  friendlyAtOrAbove: 20,
  alliedAtOrAbove: 50,
  /** Least-bad Unfriendly score after paying a Violation fine. */
  unfriendlyFloor: -15,
  /** Station deltas */
  missionComplete: 12,
  /**
   * Steal cargo delta. A single steal also **floors at Unfriendly**
   * (`unfriendlyFloor`) so positive standing cannot land in Neutral.
   * Abandoning the named kidnap fare uses this same station hit on the
   * station that offered the fare — not `cancelMissionMild`, and not
   * every station. Imperial stays `imperialKidnap`.
   */
  stealCargo: -22,
  cancelMissionMild: -5,
  ejectStolenCargo: -8,
  repairGoodwill: 3,
  /** Pirate faction deltas */
  pirateKill: -8,
  pirateFeePaid: 5,
  /** Fuel Rat faction deltas */
  fuelRatAbuse: -10,
  fuelRatGenuineRescue: 5,
  fuelRatMissionComplete: 12,
  /**
   * Cartographers — small standing per newly visited POI redeemed on dock.
   * Credits: `ECONOMY.cartographerCreditsPerVisit`.
   */
  cartographerVisitRep: 1,
  /**
   * Rebels — revealed by fencing Sensitive Derelict Cargo on the Black Market.
   * Applied per CU sold (`rebelsSellDerelictCargo` × CU).
   */
  rebelsSellDerelictCargo: 10,
  /** Merchants Guild — complete cargo-haul mission (plus station Δ). */
  merchantsHaulComplete: 8,
  /** Cartographers — complete scan / exploration mission (plus station Δ). */
  cartographersScanComplete: 8,
  /**
   * Rebel black-market contract claimed (credits are on the job).
   * Does not apply a station delta. Fence of derelict cargo is separate.
   */
  rebelsContractComplete: 8,
  /**
   * Rebel job tier. Below this (but revealed): derelict turn-in, rebel scan,
   * steal a haul. At or above (Friendly, same threshold as `friendlyAtOrAbove`):
   * also kidnap a fare and destroy a nearby patrol.
   */
  rebelsFriendlyJobStanding: 20,
  /**
   * Imperial is the slow galaxy-wide echo of station crimes. No floor and
   * no Hostile snap — one station going Hostile does not drag Imperial.
   * A few points per incident, not tens.
   * Steal −3: about four steals can Hostile one station (−22 each, plus the
   * Unfriendly floor) while Imperial is only −12, still Neutral.
   * Kidnap −3 on the abandon only. The fare's station takes the steal floor
   * (`stealCargo` / `unfriendlyFloor`), not this nick, and not −5.
   * Flat per incident, not per CU or per passenger.
   */
  imperialStealCargo: -3,
  imperialKidnap: -3,
  /** Bay net-install discount fractions by station band. */
  bayDiscountFriendly: 0.08,
  bayDiscountAllied: 0.15,
  /** Patrol fine: max(min, abs(standing) * perPoint). */
  patrolFineMin: 15,
  patrolFinePerPoint: 2,
  /**
   * Standing forced on a positive illegal-cargo scan (Violation band).
   * Settle / timeout still follow the normal Violation ladder.
   */
  scanViolationStanding: -45,
} as const;

/**
 * Station patrol NPCs — local law tied to a host station.
 * Distinct from pirate encounter template id "patrol".
 */
export const PATROL = {
  /** Chance a given station gets a patrol when entering its local view. */
  spawnChance: 0.62,
  /** Extra click pad so fines are easy to open while idle/wander. */
  clickPad: 20,
  /** Slow cruise toward a wander destination (world units / sec). */
  wanderSpeed: 70,
  /** Engage pirates / hostile player within this range. */
  huntRange: 720,
  /** Legacy single stop-closing distance. Pathing uses weapon bands. */
  engageRange: 200,
  /** Mostly idle (pirate-like) before picking a new wander leg. */
  idleHoldMin: 5,
  idleHoldMax: 12,
  /**
   * Wander destinations: mix of near-station legs and farther intercept legs.
   * Chance of picking a near destination (else far).
   */
  wanderNearChance: 0.35,
  wanderNearMin: 90,
  wanderNearMax: 180,
  wanderFarMin: 300,
  wanderFarMax: 560,
  /** Arrive within this distance to finish a wander leg. */
  waypointArrive: 18,
  /** Initial spawn distance from host station. */
  spawnDistance: 120,
  /** Violation warning window before patrol goes aggro (seconds). */
  warningSeconds: 60,
  /**
   * Illegal-cargo scan (Must-have 11).
   * Runs at Unfriendly, Neutral, Friendly, Allied, and Violation.
   * Hostile does not start a scan.
   */
  /** World range to start / continue an opportunistic scan. */
  scanRange: 520,
  /**
   * Per-second chance to open scan comms while the player is in range.
   * Unfriendly, Neutral, Friendly, Allied, and Violation can scan.
   * Hostile does not.
   */
  scanChancePerSecond: 0.045,
  /** Seconds until the scan completes once started. */
  scanSeconds: 30,
  /** Chance an eject of illegal cargo mid-scan is noticed. */
  scanEjectCaughtChance: 0.5,
  /** Cooldown after a completed scan (clean or positive) before another try. */
  scanCooldownSeconds: 90,
  /**
   * Shortfall fee = basePrice * mul per missing CU.
   * Must stay above typical black-market rates (BM markup is lower).
   */
  scanDebtFeeMul: 2.5,
} as const;
