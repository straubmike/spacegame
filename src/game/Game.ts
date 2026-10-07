import { COMBAT, DOCK, ECONOMY, ENCOUNTERS, FUEL, GALAXY, HEAT, JUMP, LOCAL, PATROL, QUEST, REPUTATION, SCOOP, WEAPONS } from "./config";
import { Loop } from "./Loop";
import { hash2 } from "../galaxy/rng";
import { Galaxy } from "../galaxy/Galaxy";
import { generateLocalView } from "../galaxy/generateLocal";
import { markDerelictMissionDebris, rockYieldLabel } from "../galaxy/beltRocks";
import {
  heatPirateFits,
  listSystemPirateKeys,
  listSystemStations,
  pickQuestGiverStation,
  pirateViewKey,
  stationKey,
  type SystemStationRef,
} from "../galaxy/pirates";
import { patrolWouldSpawn } from "../galaxy/patrolSpawn";
import {
  moduleStockLabel,
  swapCost,
  weaponSlotBindingForId,
  type EquipModule,
  type WeaponModule,
} from "../ship/equipment";
import {
  stationBayStock,
  stationBayWealth,
  type StationStockContext,
} from "../ship/stationStock";
import {
  commodityById,
  createBlackMarket,
  createStationMarket,
  isIllegalCommodityId,
  rollStationMenus,
  stationHasMenu,
  stationOffersBlackMarket,
  type StationMarket,
} from "../ship/market";
import type { MarketContext } from "../ship/economy";
import {
  ALWAYS_VISIBLE_FACTIONS,
  applyBayDiscount,
  CARTOGRAPHERS_FACTION_ID,
  formatPirateStanding,
  formatStanding,
  FUEL_RATS_FACTION_ID,
  GUILD_FACTIONS,
  IMPERIAL_FACTION_ID,
  MERCHANTS_GUILD_FACTION_ID,
  PIRATE_FACTION_ID,
  REBELS_FACTION_ID,
  qualifySharedStationLabels,
  ReputationTracker,
  standingBand,
  type ReputationListing,
} from "../ship/reputation";
import {
  addObservedIllegal,
  confiscateIllegalCu,
  illegalCargoByCommodity,
  quoteScanSettle,
  ScanDebtLedger,
  type IllegalDebtLine,
} from "../ship/scanDebt";
import { hashStationKey } from "../ship/stationKey";
import {
  heavyPatrolFits,
  patrolFitForStation,
  pirateFitById,
  pirateRecipeFits,
  rollDistressDifficulty,
  rollPassengerDifficulty,
} from "../ship/npcLoadout";
import {
  ChartCatalog,
  stationMenuLettersForPoi,
} from "../ship/chartCatalog";
import {
  canReachNearestStation,
  galacticFuelCost,
  nearestStationRefuel,
  supercruiseFuelCost,
} from "../ship/fuel";
import {
  distressPiratePlan,
  rollDistressWantsPirates,
} from "../ship/distressOdds";
import type { HostKind, Landmark, LocalView } from "../galaxy/types";
import { Keyboard } from "../input/Keyboard";
import { Pointer } from "../input/Pointer";
import { Ship } from "../entities/Ship";
import { Pirate } from "../entities/Pirate";
import { PLAYER_LOCK_ID } from "../entities/npcVolley";
import { FuelRat } from "../entities/FuelRat";
import { strandedRadioLine, StrandedPilot } from "../entities/StrandedPilot";
import {
  StationPatrol,
  type PatrolPlayerLaw,
} from "../entities/StationPatrol";
import { Projectile, spawnPlayerShot } from "../entities/Projectile";
import {
  nextBeamDamagePacket,
  traceEnergyBeam,
  type BeamDamageMark,
  type BeamSegment,
} from "../entities/energyBeam";
import { Camera } from "../world/Camera";
import { Starfield } from "../world/Starfield";
import { Renderer } from "../render/Renderer";
import { GalaxyChart, type ChartPoiHints } from "../ui/GalaxyChart";
import { SystemPanel } from "../ui/SystemPanel";
import { MessageSidebar } from "../ui/MessageSidebar";
import { StationContextMenu } from "../ui/StationContextMenu";
import { DockedMenu } from "../ui/DockedMenu";
import { PirateFeeMenu } from "../ui/PirateFeeMenu";
import { PatrolFineMenu } from "../ui/PatrolFineMenu";
import { ShipMenu } from "../ui/ShipMenu";
import { MarketMenu } from "../ui/MarketMenu";
import { MissionBoardMenu } from "../ui/MissionBoardMenu";
import { HangarMenu } from "../ui/HangarMenu";
import {
  WEAPON_HUD_INPUTS,
  weaponCompleteName,
  weaponHoldArmedNext,
  weaponRowIsEnergy,
  type WeaponHudRow,
} from "../ui/Hud";
import { GameOverScreen, StartScreen } from "../ui/RunScreens";
import { factoryPassengerCapacity, hullById } from "../ship/hulls";
import {
  ABANDONED_DERELICT_CARGO_ID,
  DERELICT_CARGO_NAME,
  distressAnswerMatchesView,
  generateRebelReplenishmentOffer,
  generateStationMissions,
  generateStationReplenishmentOffer,
  freePassengerBerths,
  isDerelictRetrievalKind,
  isMissionCargoId,
  isRebelMissionKind,
  isStolenCargoId,
  isSurveyMissionKind,
  makeClearanceOffer,
  missionCargoId,
  occupiedPassengerBerths,
  questChartPoiIds,
  rebelCoverNeedsRegularSlot,
  rebelMissionOffers,
  stolenCargoId,
  stationRefFromLocal,
  type ActiveMission,
  type MissionKind,
  type MissionOffer,
} from "../ship/missions";

type FadePhase = "idle" | "fadeOut" | "fadeIn";

/** Title before the first tick of a run; game over when the hull is lost. */
type RunPhase = "title" | "playing" | "gameover";

type PendingTravel =
  | { kind: "galaxy"; poiId: number }
  | { kind: "body"; bodyId: number };

type DockState =
  | { kind: "free" }
  | { kind: "approaching"; station: Landmark }
  | { kind: "docked"; station: Landmark };

/**
 * One fee / combat event for the entire local pirate group.
 * Ships never open their own hail — the pack is the unit.
 */
type PackPhase = "idle" | "comms" | "paid" | "hostile";

interface PackEncounter {
  phase: PackPhase;
  fee: number;
  /** Seconds left on the shared fee window. */
  timer: number;
  /** True after the pack has hailed once (re-approach → fight). */
  demanded: boolean;
  shipCount: number;
  /**
   * Passenger-fare intercept: taunt then aggro — no tribute UI.
   * Starts in "comms" with demanded already true.
   */
  noFeeAggro?: boolean;
}

interface EnergyTarget {
  id: string;
  x: number;
  y: number;
  heading: number;
  radius: number;
  kind: "pack" | "distress" | "bait" | "patrol";
  pirate: Pirate | null;
  patrol: StationPatrol | null;
}

export class Game {
  private readonly keyboard: Keyboard;
  private readonly pointer: Pointer;
  private readonly ship: Ship;
  private readonly camera: Camera;
  private readonly starfield: Starfield;
  private readonly renderer: Renderer;
  private readonly loop: Loop;
  private readonly galaxy: Galaxy;
  private readonly chart = new GalaxyChart();
  private readonly panel = new SystemPanel();
  private readonly messages = new MessageSidebar();
  private readonly stationMenu = new StationContextMenu();
  private readonly dockedMenu = new DockedMenu();
  private readonly pirateMenu = new PirateFeeMenu();
  private readonly patrolMenu = new PatrolFineMenu();
  private readonly shipMenu = new ShipMenu();
  private readonly marketMenu = new MarketMenu();
  private readonly missionBoard = new MissionBoardMenu();
  private readonly hangarMenu = new HangarMenu();
  /** Active market for the current dock session (mutated by trades). */
  private dockMarket: StationMarket | null = null;
  /** Illegal-goods book when this station offers Black Market. */
  private dockBlackMarket: StationMarket | null = null;
  /** Which exchange the market menu is showing. */
  private marketMenuKind: "legal" | "black" = "legal";
  /** Offers posted at the current dock (seeded per station). */
  private dockMissionOffers: MissionOffer[] = [];
  /**
   * Empty-board replenishment offers posted this session, keyed by station.
   * Survives undock so a leftover refill reappears; accepted ids still hide them.
   */
  private readonly stationReplenishOffers = new Map<string, MissionOffer[]>();
  /**
   * Must-have 8 cadence: empty boards wait until the player leaves this local
   * view and returns before one new offer is posted.
   */
  private readonly stationRefillState = new Map<
    string,
    | { phase: "awaitingDeparture"; viewKey: string }
    | { phase: "ready" }
  >();
  /**
   * Rebel contracts use the same empty-board cadence, tracked apart from the
   * station board so one list emptying does not arm the other.
   */
  private readonly stationRebelReplenishOffers = new Map<string, MissionOffer[]>();
  private readonly stationRebelRefillState = new Map<
    string,
    | { phase: "awaitingDeparture"; viewKey: string }
    | { phase: "ready" }
  >();
  /** Local views where the pirate fee has already been paid. */
  private readonly paidPirateViews = new Set<string>();
  /** Pirate slots permanently cleared (killed or driven off). */
  private readonly clearedPirateViews = new Set<string>();
  /** Eliminated pirates not yet cashed in at a station. */
  private pendingPirateKills = 0;
  /** Accepted board missions (cargo / explore / clearance). */
  private readonly activeMissions: ActiveMission[] = [];
  /** Offer ids already taken this session (hide from boards). */
  private readonly acceptedMissionIds = new Set<string>();
  /**
   * Last scooped derelict debris id, keyed by wreck POI.
   * The next regular or rebel scoop at that wreck marks a different piece
   * when another exists.
   */
  private readonly lastScoopedDerelictDebris = new Map<number, number>();
  /** Systems whose clearance contract has already been claimed. */
  private readonly claimedClearanceSystems = new Set<number>();
  /**
   * Per-player chart fog-of-war (visited + identified neighbors).
   * Cartographer bank redeems newly visited ids from catalog.visitedIds.
   */
  private readonly chartCatalog = new ChartCatalog();
  /**
   * Visited POIs already cashed in for Cartographer dock rewards.
   * Start POI is pre-claimed so home does not pay out.
   */
  private readonly claimedCartographerVisits = new Set<number>();
  /** POIs scanned via exploration contracts. */
  private readonly scannedPoiIds = new Set<number>();
  /** Per-station + pirate / Fuel Rat / guild faction standing (session). */
  private readonly reputation = new ReputationTracker();
  /** Station names that occur in more than one system (rep-menu labels). */
  private namesSharedInGalaxy: ReadonlySet<string> | null = null;
  /** Patrol knowledge / knownIllegalDebt from illegal-cargo scans. */
  private readonly scanDebt = new ScanDebtLedger();
  /**
   * Mid-scan caught ejects, keyed by stationKey → commodity lines.
   * Merged into debt when the scan completes.
   */
  private readonly scanCaught = new Map<string, Map<string, IllegalDebtLine>>();
  /** Last successfully docked station (for eject-stolen local blame). */
  private lastDockedStation: { key: string; name: string } | null = null;

  /** Stations that have granted docking clearance this local visit. */
  private readonly dockClearance = new Set<number>();
  /**
   * TEMP(dock-service): receipt lines kept on the dock panel until launch.
   * Strip with `applyTempDockServiceShortfall` and the comms TEMP line.
   */
  private dockServiceNote: readonly string[] = [];
  private local: LocalView;
  private pirates: Pirate[] = [];
  /** Local station patrols (host-station tied). */
  private patrols: StationPatrol[] = [];
  /**
   * Imperial Bulwark + Hauler for this local view. One pair. They stay until
   * the player leaves, shoot any pirate in hunt range, and do not break a
   * paid truce.
   */
  private distressRelief: StationPatrol[] = [];
  /** Seconds left before that pair can arrive. Null when not armed. */
  private distressImperialTimer: number | null = null;
  /** This view already received its pair. A new view can send another. */
  private distressImperialSent = false;
  /**
   * Distress calls answered in this view while a station was already in
   * reach. Leaving the view clears it. Stranded calls do not count.
   */
  private distressAnsweredWhileAble = 0;
  /** Shared fee/combat event for the current local pirate group (null = none). */
  private pack: PackEncounter | null = null;
  /** Distress-spawned pirates (separate from seeded pack). */
  private distressPirates: Pirate[] = [];
  private distressPack: PackEncounter | null = null;
  private fuelRat: FuelRat | null = null;
  /** True while a distress responder is inbound or active in this view. */
  private distressPending = false;
  /**
   * Armed on broadcast: wait delay seconds, then spawn pirates or a fuel rat.
   * Arrival comms fire from the spawn helpers / approach phases.
   */
  private distressInbound:
    | { kind: "pirates" | "rat"; delay: number; elapsed: number }
    | null = null;
  /** Fuel Rat faction quest — stranded pilot at the distress site. */
  private strandedPilot: StrandedPilot | null = null;
  /** Fuel Rat faction quest — pirate bait (no fee, delayed aggro). */
  private baitPirate: Pirate | null = null;
  private baitPack: PackEncounter | null = null;
  /**
   * Armed on a galaxy jump while carrying fare passengers to a non-destination
   * POI (~10%). Consumed on local enter to spawn a no-fee aggro intercept.
   */
  private pendingPassengerIntercept: { passengers: number } | null = null;
  /** Confirm dialog when a jump would leave too little fuel to return. */
  private fuelWarnTravel: PendingTravel | null = null;
  private fuelWarnYes: { x: number; y: number; w: number; h: number } = {
    x: 0, y: 0, w: 0, h: 0,
  };
  private fuelWarnNo: { x: number; y: number; w: number; h: number } = {
    x: 0, y: 0, w: 0, h: 0,
  };
  /** Fuel scoop progress while holding F at a star. */
  private fuelScoopProgress = 0;
  /**
   * Rare delayed pirate intrusion for this local visit.
   * Armed on enter with a 30–60s delay; one roll then done (AFK-safe after).
   */
  private intrusion:
    | { delay: number; elapsed: number; resolved: boolean }
    | null = null;

  private projectiles: Projectile[] = [];
  /** Per weapon-slot seconds until that hardpoint can fire again. */
  private weaponCooldowns = new Map<string, number>();
  /**
   * Slot ids whose current key hold started on an open fire window.
   * A press that begins during a cooldown is absent until that window opens.
   */
  private weaponHoldArmed = new Set<string>();
  /** Gun time-on-target, keyed by slot id + target id. */
  private gunStreams = new Map<string, { accumulated: number; lastHit: number }>();
  private combatClock = 0;
  /** Pulse lines still fading out. Beams live in `heldEnergy` while held. */
  private energyFlashes: { segments: BeamSegment[]; wide: boolean; ttl: number }[] =
    [];
  private heldEnergy: { segments: BeamSegment[]; wide: boolean }[] = [];
  /** Weapon slots whose beam is currently held. */
  private beamingSlots = new Set<string>();
  /**
   * Damage lock for a beam that is still held, keyed by slot id + target id.
   * Cleared when that beam is released. A broken contact leaves the lock
   * in place, so the next touch cannot be another opening hit.
   */
  private beamContact = new Map<string, BeamDamageMark>();
  private dock: DockState = { kind: "free" };
  /** Progress toward the next scooped CU while holding F. */
  private scoopProgress = 0;
  private scoopHintCooldown = 0;
  /** Progress toward completing an explore POI survey (hold F). */
  private poiScanProgress = 0;
  private poiScanHintCooldown = 0;

  private chartOpen = false;
  private panelOpen = false;
  private shipMenuOpen = false;
  private marketMenuOpen = false;
  private missionBoardOpen = false;
  private hangarMenuOpen = false;
  private fadePhase: FadePhase = "idle";
  private fadeTimer = 0;
  private fadeAlpha = 0;
  private pending: PendingTravel | null = null;
  private phase: RunPhase = "title";
  /** True when the session was just reset and has not launched yet. */
  private sessionFresh = true;
  private readonly startScreen = new StartScreen();
  private readonly gameOverScreen = new GameOverScreen();

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not get 2D canvas context");
    }

    this.keyboard = new Keyboard();
    this.pointer = new Pointer(canvas);
    this.pointer.setUiOpen(() => this.pointerUiOpen());
    this.ship = new Ship();
    this.camera = new Camera();
    this.galaxy = new Galaxy();
    this.starfield = new Starfield(hash2(GALAXY.seed, GALAXY.startPoiId));
    this.renderer = new Renderer(canvas, ctx);

    this.local = generateLocalView(this.galaxy, GALAXY.startPoiId, 0);
    this.resetSession();

    this.loop = new Loop(
      (dt) => this.update(dt),
      (alpha) => this.render(alpha),
    );

    this.renderer.resizeToDisplay();
    window.addEventListener("resize", () => this.renderer.resizeToDisplay());
  }

  start(): void {
    this.loop.start();
  }

  /**
   * Fresh run at the starting system: starter hull, empty ledger, no chart
   * progress. Home stays pre-visited so it does not pay Cartographer credit.
   */
  private resetSession(): void {
    this.stationReplenishOffers.clear();
    this.stationRefillState.clear();
    this.stationRebelReplenishOffers.clear();
    this.stationRebelRefillState.clear();
    this.paidPirateViews.clear();
    this.clearedPirateViews.clear();
    this.pendingPirateKills = 0;
    this.activeMissions.length = 0;
    this.acceptedMissionIds.clear();
    this.lastScoopedDerelictDebris.clear();
    this.claimedClearanceSystems.clear();
    this.chartCatalog.clear();
    this.claimedCartographerVisits.clear();
    this.scannedPoiIds.clear();
    this.reputation.reset();
    this.scanDebt.clearAll();
    this.scanCaught.clear();
    this.lastDockedStation = null;
    this.dockClearance.clear();

    this.fuelWarnTravel = null;
    this.pendingPassengerIntercept = null;
    this.fadePhase = "idle";
    this.fadeTimer = 0;
    this.fadeAlpha = 0;
    this.pending = null;
    this.chartOpen = false;
    this.panelOpen = false;
    this.shipMenuOpen = false;
    this.marketMenuOpen = false;
    this.missionBoardOpen = false;
    this.hangarMenuOpen = false;
    this.marketMenuKind = "legal";
    this.dockMissionOffers = [];
    this.dockMarket = null;
    this.dockBlackMarket = null;

    this.ship.resetForNewRun();
    this.applyTempDockServiceShortfall();
    this.ship.stashActiveToFleet();
    this.shipMenu.selectedIndex = 0;
    this.shipMenu.openView();
    this.messages.clear();
    this.chart.selectedId = null;

    this.starfield.reseed(hash2(GALAXY.seed, GALAXY.startPoiId));
    this.local = generateLocalView(this.galaxy, GALAXY.startPoiId, 0);
    this.chartCatalog.markVisited(
      GALAXY.startPoiId,
      this.galaxy,
      this.ship.jumpRange(),
    );
    this.claimedCartographerVisits.add(GALAXY.startPoiId);
    this.enterLocal();
    const pose = this.ship.sample(1);
    this.camera.follow(pose.x, pose.y);
    this.sessionFresh = true;
  }

  private beginRun(): void {
    if (!this.sessionFresh) this.resetSession();
    this.sessionFresh = false;
    this.phase = "playing";
    this.keyboard.discardEdges();
    this.pointer.consumeClick();
    this.pointer.releaseHeld();
  }

  private returnToTitle(): void {
    this.phase = "title";
    this.keyboard.discardEdges();
    this.pointer.consumeClick();
    this.pointer.releaseHeld();
  }

  /** Hull already at 0 — freeze the run and show the destroyed card. */
  private enterGameOver(): void {
    if (this.phase === "gameover") return;
    this.phase = "gameover";
    this.stationMenu.hide();
    this.pirateMenu.hide();
    this.patrolMenu.hide();
    this.chartOpen = false;
    this.panelOpen = false;
    this.closeShipMenuUi();
    this.marketMenuOpen = false;
    this.marketMenu.hide();
    this.missionBoardOpen = false;
    this.missionBoard.hide();
    this.hangarMenuOpen = false;
    this.hangarMenu.hide();
    this.dockedMenu.hide();
    this.fuelWarnTravel = null;
    this.keyboard.discardEdges();
    this.pointer.consumeClick();
  }

  private updateRunFlow(): void {
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    this.pointer.consumeWheel();

    if (this.phase === "title") {
      this.startScreen.layout(viewW, viewH);
      const clicked = this.pointer.consumeClick();
      const key =
        this.keyboard.consume("Enter") || this.keyboard.consume("Space");
      this.keyboard.discardEdges();
      if (key || (clicked && this.startScreen.hitsBegin(this.pointer.x, this.pointer.y))) {
        this.beginRun();
      }
      return;
    }

    this.gameOverScreen.layout(viewW, viewH);
    const clicked = this.pointer.consumeClick();
    const titleKey = this.keyboard.consume("Escape");
    this.keyboard.discardEdges();
    if (titleKey || (clicked && this.gameOverScreen.hitsTitle(this.pointer.x, this.pointer.y))) {
      this.returnToTitle();
    }
  }

  private enterLocal(): void {
    const angle = -Math.PI / 2;
    this.ship.arriveAt(
      Math.cos(angle) * LOCAL.arrivalDistance,
      Math.sin(angle) * LOCAL.arrivalDistance,
      angle + Math.PI,
    );
    this.panel.selectedBodyId = this.local.bodyId;
    this.projectiles = [];
    this.weaponCooldowns.clear();
    this.weaponHoldArmed.clear();
    this.gunStreams.clear();
    this.combatClock = 0;
    this.energyFlashes = [];
    this.heldEnergy = [];
    this.beamingSlots.clear();
    this.beamContact.clear();
    this.scoopProgress = 0;
    this.poiScanProgress = 0;
    this.pirates = [];
    this.patrols = [];
    this.distressRelief = [];
    this.distressImperialTimer = null;
    this.distressImperialSent = false;
    this.distressAnsweredWhileAble = 0;
    this.pack = null;
    this.distressPirates = [];
    this.distressPack = null;
    this.fuelRat = null;
    this.distressPending = false;
    this.distressInbound = null;
    this.strandedPilot = null;
    this.baitPirate = null;
    this.baitPack = null;
    this.fuelScoopProgress = 0;
    this.fuelWarnTravel = null;
    this.intrusion = null;

    this.clearDockClearance();
    this.clearDockState();
    // Patrols first — arrival pirate packs are already nullified in
    // pirateEncounterFor when a patrol would share this local view.
    this.spawnStationPatrols();

    // Passenger-fare intercept overrides the seeded arrival pack for this visit.
    const intercept = this.pendingPassengerIntercept;
    this.pendingPassengerIntercept = null;
    if (intercept && intercept.passengers > 0) {
      this.spawnPassengerIntercept(intercept.passengers);
    } else {
      const key = this.pirateKey();
      const allowArrivalPirates = this.patrols.length === 0;
      if (
        allowArrivalPirates &&
        this.local.pirate &&
        !this.clearedPirateViews.has(key)
      ) {
        const feePaid = this.paidPirateViews.has(key);
        const encounter = this.local.pirate;
        for (const ship of encounter.ships) {
          this.pirates.push(
            new Pirate(
              ship.x,
              ship.y,
              ship.heading,
              pirateFitById(ship.fitId),
              ship.difficulty,
              encounter.fee,
            ),
          );
        }
        this.pack = {
          phase: feePaid ? "paid" : "idle",
          fee: encounter.fee,
          timer: 0,
          demanded: feePaid,
          shipCount: encounter.ships.length,
        };
        if (feePaid) {
          for (const p of this.pirates) p.setPeaceful();
        }
      }
      this.armPirateIntrusion();
    }
    this.spawnFactionDistressEncounter();
    this.checkExploreScanProgress();
    this.ensureDerelictMissionDebris();
  }

  /**
   * When a Retrieve Derelict Cargo contract targets this POI and the lot is
   * not yet scooped, mark one debris piece as scoopable. The piece just
   * scooped at this wreck is skipped when another exists.
   */
  private ensureDerelictMissionDebris(): void {
    if (this.local.focus.kind !== "derelict" || !this.local.beltRocks) return;
    const pending = this.activeMissions.find(
      (m) =>
        isDerelictRetrievalKind(m.kind) &&
        m.targetPoiId === this.local.poiId &&
        !m.scanned,
    );
    if (!pending) return;
    markDerelictMissionDebris(
      this.local.beltRocks,
      GALAXY.seed ^ (this.local.poiId * 9973 + 19),
      this.lastScoopedDerelictDebris.get(this.local.poiId),
    );
  }

  /**
   * Roll a one-shot intrusion delay for this local visit.
   * Extra-rare spawn after the delay; no further rolls (AFK-safe past ~60s).
   */
  private armPirateIntrusion(): void {
    const { delayMin, delayMax } = ENCOUNTERS.intrusion;
    const delay = delayMin + Math.random() * (delayMax - delayMin);
    this.intrusion = { delay, elapsed: 0, resolved: false };
  }

  /** Seeded chance: some stations get one patrol loitering nearby. */
  private spawnStationPatrols(): void {
    for (const station of this.stations()) {
      const key = this.currentStationKey(station);
      if (!key) continue;
      if (!patrolWouldSpawn(key)) continue;
      const angle =
        ((hash2(GALAXY.seed ^ 0xc0ff, hashStationKey(key)) % 360) * Math.PI) /
        180;
      const dist = PATROL.spawnDistance;
      const fit = patrolFitForStation(
        hash2(GALAXY.seed ^ 0x57a1, hashStationKey(key)),
      );
      this.patrols.push(
        new StationPatrol(
          station.x + Math.cos(angle) * dist,
          station.y + Math.sin(angle) * dist,
          angle + Math.PI,
          station.id,
          station.name,
          key,
          station.x,
          station.y,
          fit,
        ),
      );
    }
  }

  private pirateKey(poiId = this.local.poiId, bodyId = this.local.bodyId): string {
    return pirateViewKey(poiId, bodyId);
  }

  private rememberPaidPirates(): void {
    if (this.pack?.phase === "paid") {
      this.paidPirateViews.add(this.pirateKey());
    }
  }

  private clearDockState(): void {
    this.dock = { kind: "free" };
    this.dockServiceNote = [];
    this.stationMenu.hide();
    this.dockedMenu.hide();
    this.pirateMenu.hide();
    this.patrolMenu.hide();
    this.marketMenu.hide();
    this.marketMenuOpen = false;
    this.dockMarket = null;
    this.dockBlackMarket = null;
    this.marketMenuKind = "legal";
    this.missionBoard.hide();
    this.missionBoardOpen = false;
    this.dockMissionOffers = [];
    this.hangarMenu.hide();
    this.hangarMenuOpen = false;
  }

  /** Clear hail approvals when leaving / regenerating a local view. */
  private clearDockClearance(): void {
    this.dockClearance.clear();
  }

  private menuOpen(): boolean {
    return (
      this.chartOpen ||
      this.panelOpen ||
      this.shipMenuOpen ||
      this.marketMenuOpen ||
      this.missionBoardOpen ||
      this.hangarMenuOpen
    );
  }

  /**
   * Menus that return before pirate, patrol, rat, and stranded updates.
   * Station hail, pirate fee, and patrol fine are overlays and stay live.
   * The dock screen is included: NPCs do not tick while docked.
   */
  private menuPausesNpc(): boolean {
    return this.menuOpen() || this.dock.kind === "docked";
  }

  private pirateAggroActive(): boolean {
    return (
      this.pack?.phase === "hostile" ||
      this.distressPack?.phase === "hostile" ||
      this.baitPack?.phase === "hostile"
    );
  }

  /**
   * Every pirate hull in the current local view — seeded pack (paid truce
   * included), distress responders, and mission bait. Station patrols and
   * distress Imperial ships hunt this list. A truce with the player is not
   * a reason to skip a hull.
   */
  private localPirateThreats(): Pirate[] {
    const list: Pirate[] = [...this.pirates];
    list.push(...this.distressPirates);
    if (this.baitPirate) list.push(this.baitPirate);
    return list;
  }

  private packThreatInRange(): boolean {
    return this.pirates.some((p) => {
      if (!p.alive) return false;
      return (
        Math.hypot(this.ship.x - p.x, this.ship.y - p.y) <=
        COMBAT.pirateThreatRange
      );
    });
  }

  private packAcceptingPayment(): boolean {
    return this.pack?.phase === "comms" && !this.pack.noFeeAggro;
  }

  /**
   * Drive the single shared fee/combat event for the local pirate group.
   * Returns true the frame the pack first opens its hail.
   */
  private updatePackEncounter(dt: number): boolean {
    const pack = this.pack;
    if (!pack || this.pirates.every((p) => !p.alive)) return false;

    let justDemanded = false;
    const inRange = this.packThreatInRange();

    if (pack.phase === "paid") {
      for (const p of this.pirates) {
        if (p.alive) p.setPeaceful();
      }
      return false;
    }

    if (pack.phase === "hostile") {
      for (const p of this.pirates) {
        if (p.alive) p.goAggro();
      }
      return false;
    }

    if (pack.phase === "idle") {
      if (inRange) {
        const stance = this.reputation.pirateEncounterOverride();
        if (stance === "skipFee") {
          pack.phase = "paid";
          pack.demanded = true;
          pack.timer = 0;
          this.paidPirateViews.add(this.pirateKey());
          for (const p of this.pirates) {
            if (p.alive) p.setPeaceful();
          }
          this.messages.push(
            pack.shipCount > 1
              ? "Pirate pack: Allies recognized — free passage."
              : "Pirate: Ally recognized — free passage.",
            "pirate",
          );
          return false;
        }
        if (stance === "instantAggro") {
          pack.phase = "hostile";
          pack.demanded = true;
          pack.timer = 0;
          for (const p of this.pirates) {
            if (p.alive) p.goAggro();
          }
          this.messages.push(
            pack.shipCount > 1
              ? "Pirate pack: They know your face — weapons free!"
              : "Pirate: They know your face — weapons free!",
            "pirate",
          );
          return false;
        }
        if (!pack.demanded) {
          pack.phase = "comms";
          pack.timer = COMBAT.pirateCommsTimeout;
          pack.demanded = true;
          justDemanded = true;
        } else {
          pack.phase = "hostile";
          for (const p of this.pirates) {
            if (p.alive) p.goAggro();
          }
          return false;
        }
      }
    }

    if (pack.phase === "comms") {
      pack.timer = Math.max(0, pack.timer - dt);
      for (const p of this.pirates) {
        if (p.alive) p.setPeaceful();
      }
      if (pack.timer <= 0) {
        if (inRange || pack.noFeeAggro) {
          pack.phase = "hostile";
          for (const p of this.pirates) {
            if (p.alive) p.goAggro();
          }
        } else {
          // Left during the window — next approach fights.
          pack.phase = "idle";
        }
        this.pirateMenu.hide();
      }
    }

    return justDemanded;
  }

  /**
   * Sneak attack, fee-window timeout, or a broken tribute truce.
   * Paying (or allied free passage) keeps the pack peaceful until the
   * player fires — then the whole pack defends itself.
   */
  private makePackHostile(): void {
    if (!this.pack || this.pack.phase === "hostile") return;
    const brokeTruce = this.pack.phase === "paid";
    this.pack.phase = "hostile";
    this.pack.demanded = true;
    this.pack.timer = 0;
    this.pirateMenu.hide();
    if (brokeTruce) {
      // Don't restore a passive pack if the player leaves and comes back.
      this.paidPirateViews.delete(this.pirateKey());
    }
    for (const p of this.pirates) {
      if (p.alive) p.goAggro();
    }
    if (brokeTruce) {
      this.messages.push(
        this.pack.shipCount > 1
          ? "Pirate pack: Truce broken — weapons free!"
          : "Pirate: Truce broken — weapons free!",
        "pirate",
      );
    }
  }

  private payPackTribute(): void {
    if (!this.pack || this.pack.phase !== "comms") return;
    const fee = this.pack.fee;
    if (!this.ship.spendCredits(fee)) {
      this.messages.push(
        `Pirate: Not enough credits. Need ${fee} cr.`,
        "pirate",
      );
      return;
    }
    this.pack.phase = "paid";
    this.pack.timer = 0;
    this.paidPirateViews.add(this.pirateKey());
    for (const p of this.pirates) {
      if (p.alive) p.setPeaceful();
    }
    this.pirateMenu.hide();
    const next = this.reputation.adjust(
      PIRATE_FACTION_ID,
      REPUTATION.pirateFeePaid,
    );
    this.pushRepChange("Pirates", next, REPUTATION.pirateFeePaid);
    this.messages.push(
      this.pack.shipCount > 1
        ? `Pirate pack: Tribute received (${fee} cr). Safe passage granted.`
        : `Pirate: Tribute received (${fee} cr). Safe passage granted.`,
      "pirate",
    );
  }

  private missionBoardHint(): string {
    const regular = this.regularMissionsForBoard();
    const claimable = regular.filter((m) => m.status === "readyToClaim").length;
    if (claimable > 0) return `${claimable} ready`;
    if (regular.length > 0) return `${regular.length} active`;
    const open = this.visibleMissionOffers().length;
    return open > 0 ? `${open} open` : "";
  }

  /** Offers still posted here. Accepted ids stay off this station's board. */
  private postedMissionOffers(): MissionOffer[] {
    return this.dockMissionOffers.filter(
      (o) => !this.acceptedMissionIds.has(o.id) && !isRebelMissionKind(o.kind),
    );
  }

  /** Derelict POIs tied up by a contract the player has not finished or dropped. */
  private activeDerelictTargetIds(): Set<number> {
    const ids = new Set<number>();
    for (const m of this.activeMissions) {
      if (isDerelictRetrievalKind(m.kind) && m.targetPoiId !== undefined) {
        ids.add(m.targetPoiId);
      }
    }
    return ids;
  }

  /**
   * Board listing. Same-station haul/explore uniqueness is in the generator.
   * A derelict another contract already accepted is hidden everywhere until
   * that contract is abandoned or completed — then other stations may list it
   * again. Rebel jobs are not on this board. Cross-station hauls, passenger
   * fares, and POI scans stay listed.
   */
  private visibleMissionOffers(): MissionOffer[] {
    const locked = this.activeDerelictTargetIds();
    return this.postedMissionOffers().filter((o) => {
      if (o.kind !== "derelictCargo" || o.targetPoiId === undefined) return true;
      return !locked.has(o.targetPoiId);
    });
  }

  /**
   * Rebel jobs on the black market. A derelict another contract already
   * accepted stays posted but hidden until that contract is abandoned or
   * completed, so the slate does not refill while it is only hidden.
   */
  private visibleRebelOffers(): MissionOffer[] {
    const locked = this.activeDerelictTargetIds();
    return this.dockMissionOffers.filter((o) => {
      if (this.acceptedMissionIds.has(o.id) || !isRebelMissionKind(o.kind)) {
        return false;
      }
      if (
        o.kind === "rebelDerelict" &&
        o.targetPoiId !== undefined &&
        locked.has(o.targetPoiId)
      ) {
        return false;
      }
      return true;
    });
  }

  /** Mission board omits rebel jobs — those live on the black market menu. */
  private regularMissionsForBoard(): ActiveMission[] {
    return this.missionsForBoardUi().filter((m) => !isRebelMissionKind(m.kind));
  }

  private chartHints(): ChartPoiHints {
    const questPoiIds = questChartPoiIds(this.activeMissions);
    // Mission targets get identified-level visibility (Mike add-on).
    for (const id of questPoiIds) {
      this.chartCatalog.grantIdentified(id);
    }
    const selectedMenuLetters =
      this.chart.selectedId !== null &&
      this.chartCatalog.isVisited(this.chart.selectedId)
        ? stationMenuLettersForPoi(this.galaxy, this.chart.selectedId)
        : [];
    return {
      visitedPoiIds: this.chartCatalog.visitedIds,
      identifiedPoiIds: this.chartCatalog.identifiedIds,
      questPoiIds,
      selectedMenuLetters,
    };
  }

  /** Grant chart visibility for a mission's destination POI(s). */
  private revealMissionChartTargets(mission: MissionOffer | ActiveMission): void {
    for (const id of questChartPoiIds([mission])) {
      this.chartCatalog.grantIdentified(id);
    }
  }

  private missionsForBoardUi(): ActiveMission[] {
    const here =
      this.dock.kind === "docked"
        ? this.currentStationKey(this.dock.station)
        : null;
    return this.activeMissions.map((m) => {
      if (
        isSurveyMissionKind(m.kind) ||
        isDerelictRetrievalKind(m.kind) ||
        m.kind === "rebelSteal" ||
        m.kind === "rebelKidnap" ||
        m.kind === "bmDestroyPatrol"
      ) {
        const claimKey =
          m.kind === "rebelKidnap" || m.kind === "rebelSteal"
            ? m.destStationKey
            : m.originStationKey;
        const ready = m.scanned && here === claimKey;
        if (ready && m.status !== "readyToClaim") {
          return { ...m, status: "readyToClaim" as const };
        }
        if (!ready && m.status === "readyToClaim") {
          return { ...m, status: "inProgress" as const };
        }
        return m;
      }
      if (m.kind === "clearance") {
        const remaining = (m.pirateTargets ?? []).filter(
          (k) => !this.clearedPirateViews.has(k),
        );
        const done = remaining.length === 0;
        const atGiver = here === m.originStationKey;
        return {
          ...m,
          pirateTargets: remaining,
          status:
            done && atGiver
              ? ("readyToClaim" as const)
              : ("inProgress" as const),
        };
      }
      return m;
    });
  }

  private buildDockMissionOffers(station: Landmark): MissionOffer[] {
    const ref = stationRefFromLocal(
      this.galaxy,
      this.local.poiId,
      this.local.bodyId,
      station.id,
      station.name,
    );
    const offers = ref ? generateStationMissions(this.galaxy, ref) : [];
    if (!ref || this.local.poiType !== "starSystem") return offers;

    const giver = this.questGiverForCurrentSystem();
    if (
      giver &&
      giver.key === ref.key &&
      !this.claimedClearanceSystems.has(this.local.poiId) &&
      !this.acceptedMissionIds.has(`clearance:${this.local.poiId}`) &&
      !this.activeMissions.some(
        (m) => m.kind === "clearance" && m.originPoiId === this.local.poiId,
      )
    ) {
      const targets = this.unclearedPirateKeys(this.local.poiId);
      const clearance = makeClearanceOffer(
        this.galaxy,
        giver,
        targets,
        this.local.poiName,
      );
      if (clearance) offers.unshift(clearance);
    }
    return offers;
  }

  /**
   * Rebel jobs appear only after Rebels are revealed, and only at a dock that
   * has a black market. The initial slate is up to two offers. Accepting one
   * does not fill the seat. When none remain — including a derelict hidden
   * because that wreck is still under contract — the next offer waits until
   * the player leaves this local view and docks again, then exactly one.
   * Shown on the black market menu, not the normal mission board.
   */
  private syncBlackMarketOffers(station: Landmark): void {
    const ref = stationRefFromLocal(
      this.galaxy,
      this.local.poiId,
      this.local.bodyId,
      station.id,
      station.name,
    );
    this.dockMissionOffers = this.dockMissionOffers.filter(
      (o) => !isRebelMissionKind(o.kind),
    );
    if (
      !ref ||
      !this.reputation.rebelsKnown() ||
      !stationOffersBlackMarket(ref.key)
    ) {
      return;
    }

    const board = this.dockMissionOffers;
    const initial = rebelMissionOffers(
      this.galaxy,
      ref,
      this.reputation.rebelsRep(),
      this.acceptedMissionIds,
      board,
      stationOffersBlackMarket,
    );
    if (initial.length > 0) {
      for (const offer of initial) this.dockMissionOffers.push(offer);
      this.stationRebelRefillState.delete(ref.key);
      return;
    }

    const posted = this.stationRebelReplenishOffers.get(ref.key) ?? [];
    const stillOpen = posted.filter((o) => !this.acceptedMissionIds.has(o.id));
    if (stillOpen.length > 0) {
      for (const offer of stillOpen) {
        if (!this.dockMissionOffers.some((o) => o.id === offer.id)) {
          this.dockMissionOffers.push(offer);
        }
      }
      this.stationRebelRefillState.delete(ref.key);
      return;
    }

    const state = this.stationRebelRefillState.get(ref.key);
    if (state?.phase !== "ready") {
      if (!state) {
        this.stationRebelRefillState.set(ref.key, {
          phase: "awaitingDeparture",
          viewKey: this.localViewKey(),
        });
      }
      return;
    }

    const offer = generateRebelReplenishmentOffer(
      this.galaxy,
      ref,
      this.reputation.rebelsRep(),
      posted.length,
      this.acceptedMissionIds,
      board,
      stationOffersBlackMarket,
    );
    if (!offer || this.acceptedMissionIds.has(offer.id)) return;
    if (
      offer.kind === "rebelDerelict" &&
      offer.targetPoiId !== undefined &&
      this.activeDerelictTargetIds().has(offer.targetPoiId)
    ) {
      // Stay ready. After abandon or complete, the same refill can post.
      return;
    }

    this.stationRebelReplenishOffers.set(ref.key, [...posted, offer]);
    this.dockMissionOffers.push(offer);
    this.stationRebelRefillState.delete(ref.key);
  }

  private localViewKey(): string {
    return `${this.local.poiId}:${this.local.bodyId ?? "none"}`;
  }

  /**
   * When leaving a local view (jump / in-system travel), arm empty boards that
   * were waiting so the next dock can post exactly one refill offer.
   */
  private armMissionRefillsOnLeavingView(): void {
    const view = this.localViewKey();
    for (const [key, state] of this.stationRefillState) {
      if (state.phase === "awaitingDeparture" && state.viewKey === view) {
        this.stationRefillState.set(key, { phase: "ready" });
      }
    }
    for (const [key, state] of this.stationRebelRefillState) {
      if (state.phase === "awaitingDeparture" && state.viewKey === view) {
        this.stationRebelRefillState.set(key, { phase: "ready" });
      }
    }
  }

  /**
   * Must-have 8: empty offer boards refill with exactly one quest — but only
   * after the player leaves this local view and returns. Do not top up while
   * any offer remains, including a derelict hidden because another station's
   * contract for that wreck is still active. Cancelled / accepted ids stay
   * removed. A refill may repeat a finished haul, scan, or scoop — completed
   * work is not consumed. A derelict refill waits while that wreck is active.
   */
  private ensureMissionBoardReplenished(station: Landmark): void {
    this.syncBlackMarketOffers(station);
    if (this.postedMissionOffers().length > 0) return;

    const ref = stationRefFromLocal(
      this.galaxy,
      this.local.poiId,
      this.local.bodyId,
      station.id,
      station.name,
    );
    if (!ref) return;

    const posted = this.stationReplenishOffers.get(ref.key) ?? [];
    const stillOpen = posted.filter((o) => !this.acceptedMissionIds.has(o.id));
    if (stillOpen.length > 0) {
      for (const offer of stillOpen) {
        if (!this.dockMissionOffers.some((o) => o.id === offer.id)) {
          this.dockMissionOffers.push(offer);
        }
      }
      this.stationRefillState.delete(ref.key);
      return;
    }

    const state = this.stationRefillState.get(ref.key);
    if (state?.phase !== "ready") {
      // Stay empty until leave + return; remember which local view to leave.
      if (!state) {
        this.stationRefillState.set(ref.key, {
          phase: "awaitingDeparture",
          viewKey: this.localViewKey(),
        });
      }
      return;
    }

    const offer = generateStationReplenishmentOffer(
      this.galaxy,
      ref,
      posted.length,
    );
    if (!offer || this.acceptedMissionIds.has(offer.id)) return;
    if (
      offer.kind === "derelictCargo" &&
      offer.targetPoiId !== undefined &&
      this.activeDerelictTargetIds().has(offer.targetPoiId)
    ) {
      // Stay ready. After abandon or complete, the same refill can post.
      return;
    }

    this.stationReplenishOffers.set(ref.key, [...posted, offer]);
    this.dockMissionOffers.push(offer);
    this.stationRefillState.delete(ref.key);
  }

  private marketContext(): MarketContext {
    return {
      galaxy: this.galaxy,
      poiId: this.local.poiId,
      bodyId: this.local.bodyId,
    };
  }

  private questGiverForCurrentSystem(): SystemStationRef | null {
    if (this.local.poiType !== "starSystem") return null;
    return pickQuestGiverStation(this.galaxy, this.local.poiId);
  }

  private unclearedPirateKeys(poiId: number): string[] {
    return listSystemPirateKeys(this.galaxy, poiId).filter(
      (k) => !this.clearedPirateViews.has(k),
    );
  }

  private redeemPendingKills(stationName: string): void {
    const n = this.pendingPirateKills;
    if (n <= 0) return;
    const payout = n * ECONOMY.redemptionPerPirate;
    this.ship.addCredits(payout);
    this.pendingPirateKills = 0;
    this.messages.push(
      `${stationName}: Bounty redemption — ${n} pirate${n === 1 ? "" : "s"} (+${payout} cr).`,
      "station",
    );
  }

  /**
   * Cash in newly visited POIs (chart catalog visited − already claimed).
   * Same dock timing as pirate bounty redemption. Single discovery track.
   */
  private redeemCartographerVisits(stationName: string): void {
    const fresh: number[] = [];
    for (const id of this.chartCatalog.visitedIds) {
      if (this.claimedCartographerVisits.has(id)) continue;
      fresh.push(id);
    }
    if (fresh.length === 0) return;

    for (const id of fresh) this.claimedCartographerVisits.add(id);
    const n = fresh.length;
    const payout = n * ECONOMY.cartographerCreditsPerVisit;
    const repDelta = n * REPUTATION.cartographerVisitRep;
    this.ship.addCredits(payout);
    this.messages.push(
      `${stationName}: Cartographer data — ${n} new visit${n === 1 ? "" : "s"} (+${payout} cr).`,
      "station",
    );
    if (repDelta !== 0) {
      const next = this.reputation.adjust(CARTOGRAPHERS_FACTION_ID, repDelta);
      this.pushRepChange("Cartographers", next, repDelta);
    }
  }

  /**
   * One or more pirates left this frame. Credits kills separately;
   * clears the encounter slot when no ships remain.
   */
  private onPirateRemoved(killed: boolean, remainingAlive: number): void {
    if (remainingAlive > 0) {
      if (killed) {
        this.messages.push(
          `Pirate destroyed. ${remainingAlive} hostile${remainingAlive === 1 ? "" : "s"} left in this sector.`,
        );
      } else {
        this.messages.push(
          `Pirate escaped. ${remainingAlive} hostile${remainingAlive === 1 ? "" : "s"} left in this sector.`,
        );
      }
      return;
    }

    const key = this.pirateKey();
    if (this.clearedPirateViews.has(key)) return;
    this.clearedPirateViews.add(key);
    this.paidPirateViews.delete(key);

    const clearance = this.activeMissions.find(
      (m) =>
        m.kind === "clearance" &&
        m.originPoiId === this.local.poiId &&
        (m.pirateTargets ?? []).includes(key),
    );
    if (clearance) {
      const left = (clearance.pirateTargets ?? []).filter(
        (k) => !this.clearedPirateViews.has(k),
      ).length;
      if (left === 0) {
        this.messages.push(
          killed
            ? "Encounter cleared. System clearance complete — return to the contracting station."
            : "Encounter emptied. System clearance complete — return to the contracting station.",
        );
      } else if (killed) {
        this.messages.push(
          `Encounter cleared. ${left} pirate encounter${left === 1 ? "" : "s"} remaining for system clearance.`,
        );
      } else {
        this.messages.push(
          `Encounter emptied. ${left} pirate encounter${left === 1 ? "" : "s"} remaining for system clearance.`,
        );
      }
    } else if (killed) {
      this.messages.push(
        "Pirate destroyed. Dock at any station to redeem the bounty.",
      );
    } else {
      this.messages.push("Pirate escaped the sector.");
    }
  }

  /**
   * On arriving in a local view — bank first visits for Cartographer dock
   * rewards; explore scans need hold-F with a Survey Scanner (see
   * updateExploreScan). No auto-complete on arrival.
   */
  private checkExploreScanProgress(): void {
    const poiId = this.local.poiId;
    const firstVisit = !this.chartCatalog.isVisited(poiId);
    this.chartCatalog.markVisited(poiId, this.galaxy, this.ship.jumpRange());
    if (firstVisit && !this.claimedCartographerVisits.has(poiId)) {
      this.messages.push(
        "New system charted. Dock at any station to redeem Cartographer data.",
      );
    }
    const pending = this.activeMissions.find(
      (m) =>
        isSurveyMissionKind(m.kind) &&
        !m.scanned &&
        m.targetPoiId === this.local.poiId,
    );
    if (!pending) return;
    if (this.ship.loadout.hasPoiScan) {
      this.messages.push(
        `Survey target: ${pending.targetPoiName} — hold F to scan.`,
      );
    } else {
      this.messages.push(
        `Survey target: ${pending.targetPoiName} — fit a Survey Scanner, then hold F.`,
      );
    }
  }

  private tryCompleteCargoDelivery(station: Landmark): void {
    const here = this.currentStationKey(station);
    if (!here) return;

    // Docked fleet is all in the hangar — pull mission freight from any owned hull.
    this.ship.stashActiveToFleet();

    const delivered: ActiveMission[] = [];
    for (const mission of this.activeMissions) {
      if (mission.kind === "passenger") {
        if (mission.destStationKey !== here) continue;
        this.ship.addCredits(mission.reward);
        delivered.push(mission);
        this.adjustStationRep(
          mission.destStationKey!,
          mission.destStationName ?? station.name,
          REPUTATION.missionComplete,
        );
        const n = mission.passengers ?? 0;
        this.messages.push(
          `${station.name}: ${n} passenger${n === 1 ? "" : "s"} delivered — ${mission.title} (+${mission.reward} cr).`,
          "station",
        );
        continue;
      }
      if (mission.kind !== "cargo") continue;
      if (mission.destStationKey !== here) continue;
      const lotId = missionCargoId(mission.id);
      const need = mission.cu ?? 0;
      const fleetHeld = this.ship.fleet.amountOfCargo(lotId);
      if (fleetHeld < need) {
        this.messages.push(
          `${station.name}: Missing ${need} CU mission freight for "${mission.title}".`,
          "station",
        );
        continue;
      }
      const onActive = this.ship.cargo.amountOf(lotId);
      const hits = this.ship.fleet.findCargo(lotId);
      this.ship.fleet.removeCargo(lotId, need);
      this.ship.addCredits(mission.reward);
      delivered.push(mission);
      this.adjustStationRep(
        mission.destStationKey!,
        mission.destStationName ?? station.name,
        REPUTATION.missionComplete,
      );
      this.adjustMerchantsRep(REPUTATION.merchantsHaulComplete);
      if (onActive < need) {
        const parked = hits
          .filter((h) => h.instanceId !== this.ship.fleet.activeInstanceId)
          .map((h) => hullById(h.hullId)?.name ?? h.hullId);
        const from =
          parked.length > 0 ? parked.join(", ") : "a parked hangar ship";
        this.messages.push(
          `${station.name}: Retrieved mission freight from ${from}.`,
          "station",
        );
      }
      this.messages.push(
        `${station.name}: Cargo delivered — ${mission.title} (+${mission.reward} cr).`,
        "station",
      );
    }
    for (const m of delivered) {
      const i = this.activeMissions.indexOf(m);
      if (i >= 0) this.activeMissions.splice(i, 1);
      if (m.kind === "passenger" || m.kind === "cargo") {
        this.unlinkUnfinishedCover(m.id, m.kind);
      }
    }
  }

  private syncExploreClaimableAtStation(station: Landmark): void {
    const here = this.currentStationKey(station);
    if (!here) return;
    for (const mission of this.activeMissions) {
      if (isSurveyMissionKind(mission.kind) || isDerelictRetrievalKind(mission.kind)) {
        if (!mission.scanned) continue;
        if (mission.originStationKey !== here) continue;
        mission.status = "readyToClaim";
        continue;
      }
      if (mission.kind === "clearance") {
        const done = (mission.pirateTargets ?? []).every((k) =>
          this.clearedPirateViews.has(k),
        );
        if (done && mission.originStationKey === here) {
          mission.status = "readyToClaim";
        }
      }
    }
  }

  private acceptBoardMission(missionId: string): void {
    if (this.dock.kind !== "docked") return;
    const offer = this.dockMissionOffers.find((o) => o.id === missionId);
    if (!offer || this.acceptedMissionIds.has(missionId)) return;

    if (offer.kind === "clearance") {
      if (this.activeMissions.some((m) => m.kind === "clearance")) {
        this.messages.push(
          "Missions: Already running a pirate clearance contract.",
          "station",
        );
        return;
      }
    } else if (isRebelMissionKind(offer.kind)) {
      if (this.rebelMissionCount() >= QUEST.maxRebelActive) {
        this.messages.push(
          `Missions: Already holding ${QUEST.maxRebelActive} rebel contracts — complete one first.`,
          "station",
        );
        return;
      }
      if (
        rebelCoverNeedsRegularSlot(offer.kind) &&
        this.coverSlotsFree() < 1
      ) {
        this.messages.push(
          "Missions: Requires a free mission slot to accept the cover haul or fare.",
          "station",
        );
        return;
      }
    } else if (this.regularMissionCount() >= QUEST.maxActive) {
      this.messages.push(
        `Missions: Already holding ${QUEST.maxActive} contracts — complete one first.`,
        "station",
      );
      return;
    }

    if (offer.kind === "distressAnswer") {
      if (this.activeMissions.some((m) => m.kind === "distressAnswer")) {
        this.messages.push(
          "Missions: Already answering a Fuel Rat distress contract.",
          "station",
        );
        return;
      }
      if (!this.hasExpandedFuelTank()) {
        this.messages.push(
          "Missions: Fit an Expanded Fuel Tank before accepting Fuel Rat work.",
          "station",
        );
        return;
      }
    }

    if (offer.kind === "cargo") {
      const cu = offer.cu ?? 0;
      const name = offer.commodityName ?? "Freight";
      if (!this.ship.cargo.canStow(cu)) {
        this.messages.push(
          `Missions: Requires ${cu} free CU (equip a cargo rack in the Bay).`,
          "station",
        );
        return;
      }
      if (
        !this.ship.cargo.stow({
          id: missionCargoId(offer.id),
          name,
          cu,
        })
      ) {
        this.messages.push("Missions: Could not load freight.", "station");
        return;
      }
    }

    if (isDerelictRetrievalKind(offer.kind)) {
      const need = offer.cu ?? QUEST.derelictCargoCu;
      if (this.ship.loadout.scoopRange <= 0) {
        this.messages.push(
          "Missions: Equip a Cargo Scoop (Bay) to accept this contract.",
          "station",
        );
        return;
      }
      if (this.ship.cargo.freeCu < need) {
        this.messages.push(
          `Missions: Requires ${need} free CU for the recovered lot.`,
          "station",
        );
        return;
      }
    }

    if (offer.kind === "passenger") {
      const need = offer.passengers ?? 0;
      const free = freePassengerBerths(
        this.ship.passengerCapacity,
        this.activeMissions,
      );
      if (this.ship.passengerCapacity <= 0) {
        this.messages.push(
          "Missions: Fit a Passenger Berth (Bay) before accepting fares.",
          "station",
        );
        return;
      }
      if (free < need) {
        this.messages.push(
          `Missions: Requires ${need} unoccupied passenger berth${need === 1 ? "" : "s"} (have ${free}).`,
          "station",
        );
        return;
      }
    }

    if (isSurveyMissionKind(offer.kind)) {
      if (!this.hasSurveyScanner()) {
        this.messages.push(
          "Missions: Fit a Survey Scanner before accepting exploration work.",
          "station",
        );
        return;
      }
    }

    const active: ActiveMission = {
      ...offer,
      pirateTargets: offer.pirateTargets
        ? [...offer.pirateTargets]
        : undefined,
      status: "inProgress",
      scanned: false,
    };
    this.activeMissions.push(active);
    this.acceptedMissionIds.add(offer.id);
    this.revealMissionChartTargets(active);
    if (offer.kind === "cargo") this.linkNewCover("rebelSteal", offer);
    if (offer.kind === "passenger") this.linkNewCover("rebelKidnap", offer);
    this.attachCoverIfAlreadyActive(active);

    let msg: string;
    if (offer.kind === "cargo") {
      msg = `Missions: Accepted — haul to ${offer.destStationName} (+${offer.reward} cr).`;
    } else if (offer.kind === "passenger") {
      const n = offer.passengers ?? 0;
      msg = `Missions: Accepted — fare for ${n} passenger${n === 1 ? "" : "s"} to ${offer.destStationName} (+${offer.reward} cr).`;
    } else if (offer.kind === "clearance") {
      const n = offer.pirateTargets?.length ?? 0;
      msg = `Missions: Accepted — clear ${n} pirate${n === 1 ? "" : "s"} in this system (+${offer.reward} cr).`;
    } else if (offer.kind === "derelictCargo") {
      msg = `Missions: Accepted — scoop cargo at ${offer.targetPoiName}, then return here (+${offer.reward} cr).`;
    } else if (offer.kind === "rebelDerelict") {
      msg = `Missions: Accepted — scoop cargo at ${offer.targetPoiName}, then turn it in here (+${offer.reward} cr, Rebels).`;
    } else if (offer.kind === "rebelScan") {
      msg = `Missions: Accepted — scan ${offer.targetPoiName}, then claim here (Rebel reputation, +${offer.reward} cr).`;
    } else if (offer.kind === "rebelSteal") {
      msg = `Rebels: Accepted — ${offer.blurb}`;
    } else if (offer.kind === "rebelKidnap") {
      msg = `Rebels: Accepted — ${offer.blurb}`;
    } else if (offer.kind === "distressAnswer") {
      const where =
        offer.targetBodyName ?? offer.targetPoiName ?? "the distress site";
      msg = `Missions: Accepted — answer distress at ${where} (Fuel Rats reputation).`;
    } else if (offer.kind === "bmDestroyPatrol") {
      msg = `Missions: Accepted — destroy the patrol at ${offer.destStationName}, then return here (+${offer.reward} cr, Rebels).`;
    } else {
      msg = `Missions: Accepted — scan ${offer.targetPoiName}, then return here (+${offer.reward} cr).`;
    }
    this.messages.push(msg, "station");
    this.refreshMissionBoardUi();
  }

  private claimBoardMission(missionId: string): void {
    if (this.dock.kind !== "docked") return;
    const station = this.dock.station;
    const here = this.currentStationKey(station);
    const idx = this.activeMissions.findIndex((m) => m.id === missionId);
    if (idx < 0) return;
    const mission = this.activeMissions[idx]!;

    if (isSurveyMissionKind(mission.kind)) {
      if (!mission.scanned || here !== mission.originStationKey) {
        this.messages.push(
          `Missions: Finish the scan and return to ${mission.originStationName}.`,
          "station",
        );
        return;
      }
      this.activeMissions.splice(idx, 1);
      if (mission.kind === "rebelScan") {
        this.payRebelContract(
          mission,
          station.name,
          `Survey filed for the Rebels — ${mission.title}`,
        );
      } else {
        this.ship.addCredits(mission.reward);
        this.adjustStationRep(
          mission.originStationKey,
          mission.originStationName,
          REPUTATION.missionComplete,
        );
        this.adjustCartographersRep(REPUTATION.cartographersScanComplete);
        this.messages.push(
          `${station.name}: Survey filed — ${mission.title} (+${mission.reward} cr).`,
          "station",
        );
      }
      this.refreshMissionBoardUi();
      return;
    }

    if (isDerelictRetrievalKind(mission.kind)) {
      if (!mission.scanned || here !== mission.originStationKey) {
        this.messages.push(
          `Missions: Scoop the cargo and return to ${mission.originStationName}.`,
          "station",
        );
        return;
      }
      const lotId = missionCargoId(mission.id);
      const need = mission.cu ?? QUEST.derelictCargoCu;
      this.ship.stashActiveToFleet();
      const held = this.ship.fleet.amountOfCargo(lotId);
      if (held < need) {
        this.messages.push(
          `Missions: Missing ${need} CU ${DERELICT_CARGO_NAME} — scoop it at the derelict.`,
          "station",
        );
        return;
      }
      this.ship.fleet.removeCargo(lotId, need);
      this.activeMissions.splice(idx, 1);
      if (mission.kind === "rebelDerelict") {
        this.payRebelContract(
          mission,
          station.name,
          `Derelict cargo turned in — ${mission.title}`,
        );
      } else {
        this.ship.addCredits(mission.reward);
        this.adjustStationRep(
          mission.originStationKey,
          mission.originStationName,
          REPUTATION.missionComplete,
        );
        this.messages.push(
          `${station.name}: Derelict cargo recovered — ${mission.title} (+${mission.reward} cr).`,
          "station",
        );
      }
      this.refreshMissionBoardUi();
      return;
    }

    if (mission.kind === "clearance") {
      if (here !== mission.originStationKey) {
        this.messages.push(
          `Missions: Return to ${mission.originStationName} to claim clearance.`,
          "station",
        );
        return;
      }
      const done = (mission.pirateTargets ?? []).every((k) =>
        this.clearedPirateViews.has(k),
      );
      if (!done) {
        this.messages.push(
          "Missions: Pirates still remain in this system.",
          "station",
        );
        return;
      }
      this.ship.addCredits(mission.reward);
      this.activeMissions.splice(idx, 1);
      this.claimedClearanceSystems.add(mission.originPoiId);
      this.adjustStationRep(
        mission.originStationKey,
        mission.originStationName,
        REPUTATION.missionComplete,
      );
      this.messages.push(
        `${station.name}: System clearance confirmed (+${mission.reward} cr).`,
        "station",
      );
      this.refreshMissionBoardUi();
      return;
    }

    if (mission.kind === "bmDestroyPatrol") {
      if (!mission.scanned || here !== mission.originStationKey) {
        this.messages.push(
          mission.scanned
            ? `Missions: Return to ${mission.originStationName} to claim.`
            : `Missions: Destroy the patrol at ${mission.destStationName ?? "the destination"} first.`,
          "station",
        );
        return;
      }
      this.activeMissions.splice(idx, 1);
      this.payRebelContract(
        mission,
        station.name,
        `Patrol contract paid — ${mission.title}`,
      );
      this.refreshMissionBoardUi();
      return;
    }

    if (mission.kind === "rebelSteal") {
      if (!mission.scanned || here !== mission.destStationKey) {
        this.messages.push(
          mission.scanned
            ? `Missions: Deliver the stolen freight to ${mission.destStationName ?? "the black market"}.`
            : "Missions: Steal a haul first — abandon it away from the giver.",
          "station",
        );
        return;
      }
      const commodityId = mission.commodityId ?? "goods";
      const need = mission.cu ?? 0;
      this.ship.stashActiveToFleet();
      const held = this.ship.fleet.amountOfCargo(stolenCargoId(commodityId));
      if (held < need) {
        this.messages.push(
          `Missions: Missing ${need} CU stolen ${mission.commodityName ?? "freight"}.`,
          "station",
        );
        return;
      }
      this.ship.fleet.removeCargo(stolenCargoId(commodityId), need);
      this.activeMissions.splice(idx, 1);
      this.payRebelContract(
        mission,
        station.name,
        `Stolen haul delivered — ${mission.title}`,
      );
      this.refreshMissionBoardUi();
      return;
    }

    if (mission.kind === "rebelKidnap") {
      if (!mission.scanned || here !== mission.destStationKey) {
        this.messages.push(
          mission.scanned
            ? `Missions: Turn the passengers in at ${mission.destStationName ?? "the black market"}.`
            : "Missions: Abandon the named fare while the passengers are still aboard.",
          "station",
        );
        return;
      }
      const n = mission.passengers ?? 0;
      this.activeMissions.splice(idx, 1);
      this.payRebelContract(
        mission,
        station.name,
        `Turned in ${n} kidnapped passenger${n === 1 ? "" : "s"}`,
      );
      this.refreshMissionBoardUi();
      return;
    }

    // Cargo / passenger pay on delivery; claim button is unused for those.
    this.messages.push(
      mission.kind === "passenger"
        ? "Missions: Deliver the passengers at the destination station."
        : "Missions: Deliver the freight at the destination station.",
      "station",
    );
  }

  private freeBerthsForUi(): number {
    return freePassengerBerths(
      this.ship.passengerCapacity,
      this.activeMissions,
    );
  }

  private refreshMissionBoardUi(): void {
    if (this.dock.kind === "docked") {
      this.ensureMissionBoardReplenished(this.dock.station);
    }
    // Accept from the black market does not open the station board. Refresh
    // that menu in place so the row flips to taken without closing it.
    this.refreshBlackMarketJobs();
    if (!this.missionBoardOpen) return;
    this.missionBoard.refresh(
      this.visibleMissionOffers(),
      this.regularMissionsForBoard(),
      this.ship.cargo.freeCu,
      this.regularMissionCount() < QUEST.maxActive,
      this.ship.loadout.scoopRange > 0,
      this.hasExpandedFuelTank(),
      this.freeBerthsForUi(),
      this.hasSurveyScanner(),
      this.rebelMissionCount() < QUEST.maxRebelActive,
      this.coverSlotsFree() >= 1,
    );
  }

  private openMissionBoard(station: Landmark): void {
    // Missions is always-on (Must-have 10) — no stationHasMenu gate.
    this.dockedMenu.hide();
    this.marketMenuOpen = false;
    this.marketMenu.hide();
    this.shipMenuOpen = false;
    this.shipMenu.openView();
    this.hangarMenuOpen = false;
    this.hangarMenu.hide();
    this.syncExploreClaimableAtStation(station);
    this.ensureMissionBoardReplenished(station);
    this.missionBoard.show(
      station.name,
      this.visibleMissionOffers(),
      this.regularMissionsForBoard(),
      this.ship.cargo.freeCu,
      this.regularMissionCount() < QUEST.maxActive,
      this.ship.loadout.scoopRange > 0,
      this.hasExpandedFuelTank(),
      this.freeBerthsForUi(),
      this.hasSurveyScanner(),
      this.rebelMissionCount() < QUEST.maxRebelActive,
      this.coverSlotsFree() >= 1,
    );
    this.missionBoardOpen = true;
  }

  private closeMissionBoard(): void {
    this.missionBoardOpen = false;
    this.missionBoard.hide();
    if (this.dock.kind === "docked") {
      this.showDockedUi(this.dock.station);
    }
  }

  private updateMissionBoard(): void {
    if (!this.pointer.consumeClick()) return;
    const result = this.missionBoard.handleClick(this.pointer.x, this.pointer.y);
    if (result === "close") {
      this.closeMissionBoard();
      return;
    }
    if (!result || typeof result !== "object") return;
    if (result.action === "accept") {
      this.acceptBoardMission(result.missionId);
      return;
    }
    if (result.action === "claim") {
      this.claimBoardMission(result.missionId);
      return;
    }
    if (result.action === "cancel") {
      this.cancelBoardMission(result.missionId, { fromBoard: true });
    }
  }

  /**
   * Drop an active contract.
   * - Cancel via origin station's Missions board → return haul freight (no steal).
   * - Cancel elsewhere (L menu, or board away from origin) → keep freight as stolen.
   * - Derelict cargo Cancel: mild rep; keep lot as ordinary (non-stolen) freight —
   *   fenceable on Black Market for Rebels +rep (not stolen / no steal floor).
   * - Derelict cargo eject (`discardCargo`): force-abandon — cargo discarded, no
   *   BM fence / Rebels reveal; same mild rep, not stolen, no patrol fee.
   * - Passenger fare with people still aboard: passengers leave the ship.
   *   A named rebel kidnap fare sours that fare's station like a stolen haul
   *   (`applyCargoSteal`). Any other fare is the mild −5. Imperial is −3
   *   either way, once, with no floor. Other stations are not hit.
   * Offer stays in acceptedMissionIds so it does not reappear on that station's board.
   */
  private cancelBoardMission(
    missionId: string,
    opts: { fromBoard?: boolean; discardCargo?: boolean } = {},
  ): void {
    const idx = this.activeMissions.findIndex((m) => m.id === missionId);
    if (idx < 0) return;
    const mission = this.activeMissions[idx]!;

    const here =
      this.dock.kind === "docked"
        ? this.currentStationKey(this.dock.station)
        : null;
    const atOriginBoard =
      !!opts.fromBoard &&
      here !== null &&
      here === mission.originStationKey;

    let stoleCu = 0;
    let returnedCu = 0;
    let keptDerelictCu = 0;
    if (mission.kind === "cargo") {
      const lotId = missionCargoId(mission.id);
      // Mission freight may sit on a parked hangar hull — search the whole fleet.
      this.ship.stashActiveToFleet();
      const held = this.ship.fleet.amountOfCargo(lotId);
      if (held > 0) {
        this.ship.fleet.removeCargo(lotId, held);
        if (atOriginBoard) {
          // Abort at giver: cargo returned — do not keep as stolen.
          returnedCu = held;
        } else {
          const commodityId = mission.commodityId ?? "goods";
          const name = mission.commodityName ?? "Freight";
          // Stolen freight lands on the active ship (player is flying it).
          this.ship.cargo.stow({
            id: stolenCargoId(commodityId),
            name,
            cu: held,
          });
          stoleCu = held;
        }
      }
    } else if (isDerelictRetrievalKind(mission.kind)) {
      const lotId = missionCargoId(mission.id);
      this.ship.stashActiveToFleet();
      const held = this.ship.fleet.amountOfCargo(lotId);
      if (held > 0) {
        this.ship.fleet.removeCargo(lotId, held);
        if (opts.discardCargo) {
          // Eject path: cargo already dumped / discarded — do not retain for a
          // future alternate-mission chain.
        } else {
          // Cancel path: keep as ordinary non-stolen freight (possible chain later).
          this.ship.cargo.stow({
            id: ABANDONED_DERELICT_CARGO_ID,
            name: DERELICT_CARGO_NAME,
            cu: held,
          });
          keptDerelictCu = held;
        }
      }
    }

    this.activeMissions.splice(idx, 1);
    // Keep missionId in acceptedMissionIds — cancel consumes the offer for this station.

    if (mission.kind === "distressAnswer") {
      this.strandedPilot = null;
      this.baitPirate = null;
      this.baitPack = null;
    }

    const kidnapped =
      mission.kind === "passenger" && (mission.passengers ?? 0) > 0;

    if (stoleCu > 0) {
      this.fulfillStealContract(mission, stoleCu);
      const before = this.reputation.stationStanding(mission.originStationKey);
      const next = this.reputation.applyCargoSteal(
        mission.originStationKey,
        mission.originStationName,
      );
      this.pushRepChange(
        mission.originStationName,
        next,
        next - before,
      );
      this.adjustImperialRep(REPUTATION.imperialStealCargo);
    } else if (kidnapped) {
      const kidnap = this.fulfillKidnapContract(mission);
      if (kidnap) {
        const before = this.reputation.stationStanding(mission.originStationKey);
        const next = this.reputation.applyCargoSteal(
          mission.originStationKey,
          mission.originStationName,
        );
        this.pushRepChange(
          mission.originStationName,
          next,
          next - before,
        );
      } else {
        this.adjustStationRep(
          mission.originStationKey,
          mission.originStationName,
          REPUTATION.cancelMissionMild,
        );
      }
      this.adjustImperialRep(REPUTATION.imperialKidnap);
    } else if (mission.kind !== "cargo" || returnedCu > 0) {
      if (mission.kind === "cargo" || mission.kind === "passenger") {
        this.unlinkUnfinishedCover(mission.id, mission.kind);
      }
      this.adjustStationRep(
        mission.originStationKey,
        mission.originStationName,
        REPUTATION.cancelMissionMild,
      );
    }

    let msg: string;
    if (returnedCu > 0) {
      msg = "Mission aborted, cargo returned.";
    } else if (stoleCu > 0) {
      msg = `Missions: Cancelled "${mission.title}" — kept ${stoleCu} CU as stolen freight.`;
    } else if (keptDerelictCu > 0) {
      msg = `Missions: Cancelled "${mission.title}" — kept ${keptDerelictCu} CU ${DERELICT_CARGO_NAME} (not stolen).`;
    } else if (opts.discardCargo && isDerelictRetrievalKind(mission.kind)) {
      msg = `Missions: Abandoned "${mission.title}" — cargo dumped.`;
    } else if (kidnapped) {
      const n = mission.passengers ?? 0;
      msg = `Missions: Cancelled "${mission.title}" — ${n} passenger${n === 1 ? "" : "s"} taken off the ship. Logged as kidnapping.`;
    } else {
      msg = `Missions: Cancelled "${mission.title}".`;
    }
    this.messages.push(msg, "station");
    this.refreshMissionBoardUi();
  }

  private adjustStationRep(
    stationKeyStr: string,
    stationLabel: string,
    delta: number,
  ): void {
    const next = this.reputation.adjust(stationKeyStr, delta, stationLabel);
    this.pushRepChange(stationLabel, next, delta);
  }

  private pushRepChange(label: string, next: number, delta: number): void {
    const signed = delta > 0 ? `+${delta}` : `${delta}`;
    const factionTone =
      label === "Pirates" ||
      label === "Rebels" ||
      label === "Fuel Rats" ||
      label === "Imperial" ||
      label === "Merchants Guild" ||
      label === "Cartographers";
    const standing = factionTone
      ? formatPirateStanding(next)
      : formatStanding(next);
    this.messages.push(
      `Standing — ${label}: ${standing} (${signed})`,
      factionTone ? "pirate" : "station",
    );
  }

  private dockStandingLine(station: Landmark): string {
    const key = this.currentStationKey(station);
    if (!key) return "";
    return `Rep ${formatStanding(this.reputation.stationStanding(key))}`;
  }

  private reputationListingForUi(): ReputationListing {
    const factions: ReputationListing["factions"] = ALWAYS_VISIBLE_FACTIONS.map(
      (f) => ({
        id: f.id,
        label: f.label,
        score: this.factionScore(f.id),
      }),
    );
    // Rebels stay hidden until revealed (e.g. fence Sensitive Derelict Cargo).
    if (this.reputation.rebelsKnown()) {
      factions.push({
        id: REBELS_FACTION_ID,
        label: "Rebels",
        score: this.reputation.rebelsRep(),
      });
    }
    for (const g of GUILD_FACTIONS) {
      factions.push({
        id: g.id,
        label: g.label,
        score:
          g.id === MERCHANTS_GUILD_FACTION_ID
            ? this.reputation.merchantsRep()
            : g.id === CARTOGRAPHERS_FACTION_ID
              ? this.reputation.cartographersRep()
              : 0,
      });
    }
    const stations = this.reputation.nonzeroStations();
    return {
      factions,
      stations: qualifySharedStationLabels(
        stations,
        (key) => this.mainSequenceStarName(key),
        this.stationNamesSharedAcrossSystems(),
      ),
    };
  }

  /** Main-sequence star for a station key (`poiId:bodyId:stationId`). */
  private mainSequenceStarName(stationKey: string): string | null {
    const head = stationKey.split(":")[0] ?? "";
    if (!/^\d+$/.test(head)) return null;
    const poiId = Number(head);
    if (poiId >= this.galaxy.pois.length) return null;
    const poi = this.galaxy.get(poiId);
    if (poi.type !== "starSystem") return null;
    return poi.name;
  }

  private stationNamesSharedAcrossSystems(): ReadonlySet<string> {
    if (this.namesSharedInGalaxy) return this.namesSharedInGalaxy;
    const counts = new Map<string, number>();
    for (const poi of this.galaxy.pois) {
      if (poi.type !== "starSystem") continue;
      for (const station of listSystemStations(this.galaxy, poi.id)) {
        counts.set(station.name, (counts.get(station.name) ?? 0) + 1);
      }
    }
    const shared = new Set<string>();
    for (const [name, count] of counts) {
      if (count > 1) shared.add(name);
    }
    this.namesSharedInGalaxy = shared;
    return shared;
  }

  private hasExpandedFuelTank(): boolean {
    return this.ship.loadout.hasUtilityId(
      QUEST.distressAnswerRequiredModuleId,
    );
  }

  private hasSurveyScanner(): boolean {
    return this.ship.loadout.hasPoiScan;
  }

  private factionScore(id: string): number {
    if (id === PIRATE_FACTION_ID) return this.reputation.pirateRep();
    if (id === FUEL_RATS_FACTION_ID) return this.reputation.fuelRatsRep();
    if (id === IMPERIAL_FACTION_ID) return this.reputation.imperialRep();
    if (id === REBELS_FACTION_ID) return this.reputation.rebelsRep();
    if (id === MERCHANTS_GUILD_FACTION_ID) return this.reputation.merchantsRep();
    if (id === CARTOGRAPHERS_FACTION_ID) {
      return this.reputation.cartographersRep();
    }
    return 0;
  }

  private adjustImperialRep(delta: number): number {
    const next = this.reputation.adjust(IMPERIAL_FACTION_ID, delta);
    this.pushRepChange("Imperial", next, delta);
    return next;
  }

  private regularMissionCount(): number {
    return this.activeMissions.filter(
      (m) => m.kind !== "clearance" && !isRebelMissionKind(m.kind),
    ).length;
  }

  private rebelMissionCount(): number {
    return this.activeMissions.filter((m) => isRebelMissionKind(m.kind)).length;
  }

  /** Cover contracts that still need their named haul or fare accepted. */
  private unfilledCoverCount(): number {
    return this.activeMissions.filter(
      (m) =>
        rebelCoverNeedsRegularSlot(m.kind) &&
        !!m.coverOfferId &&
        !m.linkedMissionId &&
        !m.scanned,
    ).length;
  }

  /** Free regular seats minus seats already reserved by unfilled steal/kidnap jobs. */
  private coverSlotsFree(): number {
    return (
      QUEST.maxActive -
      this.regularMissionCount() -
      this.unfilledCoverCount()
    );
  }

  private linkNewCover(
    rebelKind: "rebelSteal" | "rebelKidnap",
    cover: MissionOffer,
  ): void {
    const waiting = this.activeMissions.find(
      (m) =>
        m.kind === rebelKind &&
        m.coverOfferId === cover.id &&
        !m.linkedMissionId &&
        !m.scanned,
    );
    if (!waiting) return;
    waiting.linkedMissionId = cover.id;
    if (rebelKind === "rebelSteal") {
      waiting.commodityId = cover.commodityId;
      waiting.commodityName = cover.commodityName;
      waiting.cu = cover.cu;
    } else {
      waiting.passengers = cover.passengers;
    }
  }

  /** The named cover was already aboard when the rebel job was accepted. */
  private attachCoverIfAlreadyActive(rebel: ActiveMission): void {
    if (!rebelCoverNeedsRegularSlot(rebel.kind) || !rebel.coverOfferId) return;
    if (rebel.linkedMissionId || rebel.scanned) return;
    const cover = this.activeMissions.find((m) => m.id === rebel.coverOfferId);
    if (!cover) return;
    rebel.linkedMissionId = cover.id;
  }

  /**
   * Legal delivery of the named cover. The rebel contract stays, but it no
   * longer reserves a regular slot — that haul or fare will not be offered again.
   */
  private unlinkUnfinishedCover(missionId: string, kind: MissionKind): void {
    const rebelKind =
      kind === "cargo" ? "rebelSteal" : kind === "passenger" ? "rebelKidnap" : null;
    if (!rebelKind) return;
    const cover = this.activeMissions.find(
      (m) =>
        m.kind === rebelKind &&
        (m.linkedMissionId === missionId || m.coverOfferId === missionId) &&
        !m.scanned,
    );
    if (!cover) return;
    cover.linkedMissionId = undefined;
    cover.coverOfferId = undefined;
    cover.blurb =
      kind === "cargo"
        ? "Haul delivered legally. Cancel this contract."
        : "Fare delivered legally. Cancel this contract.";
    this.messages.push(
      kind === "cargo"
        ? "Rebels: That haul was not stolen — cancel the steal contract."
        : "Rebels: That fare was not kidnapped — cancel the kidnap contract.",
      "station",
    );
  }

  /** Stolen named haul fills its steal contract. No extra Imperial hit. */
  private fulfillStealContract(haul: ActiveMission, cu: number): void {
    const cover = this.activeMissions.find(
      (m) =>
        m.kind === "rebelSteal" &&
        (m.linkedMissionId === haul.id || m.coverOfferId === haul.id) &&
        !m.scanned,
    );
    if (!cover) return;
    cover.linkedMissionId = haul.id;
    cover.commodityId = haul.commodityId;
    cover.commodityName = haul.commodityName;
    cover.cu = cu;
    cover.scanned = true;
    const where = cover.destStationName ?? "the black market";
    this.messages.push(
      `Rebels: Stolen ${cover.commodityName ?? "freight"} held — deliver it to ${where}'s black market.`,
      "station",
    );
  }

  /**
   * Abandon-with-passengers fills the kidnap contract that names this fare.
   * Returns that contract when the harsh station hit should apply.
   * Imperial is applied by the caller, once, for the act itself.
   */
  private fulfillKidnapContract(fare: ActiveMission): ActiveMission | null {
    const n = fare.passengers ?? 0;
    const cover = this.activeMissions.find(
      (m) =>
        m.kind === "rebelKidnap" &&
        (m.linkedMissionId === fare.id || m.coverOfferId === fare.id) &&
        !m.scanned,
    );
    if (!cover || n <= 0) return null;
    cover.linkedMissionId = fare.id;
    cover.passengers = n;
    cover.scanned = true;
    const where = cover.destStationName ?? cover.originStationName;
    this.messages.push(
      `Rebels: ${n} passenger${n === 1 ? "" : "s"} held — turn them in at ${where}'s black market.`,
      "station",
    );
    return cover;
  }

  private payRebelContract(
    mission: ActiveMission,
    stationName: string,
    detail: string,
  ): void {
    this.ship.addCredits(mission.reward);
    const delta = REPUTATION.rebelsContractComplete;
    const next = this.reputation.adjust(REBELS_FACTION_ID, delta);
    this.pushRepChange("Rebels", next, delta);
    this.messages.push(
      `${stationName}: ${detail} (+${mission.reward} cr).`,
      "station",
    );
  }

  /** Hangar hull swap must not drop berths below passengers already aboard. */
  private refuseIfBerthsTooSmall(nextCap: number): boolean {
    const occupied = occupiedPassengerBerths(this.activeMissions);
    if (occupied <= 0 || nextCap >= occupied) return false;
    const berthWord = nextCap === 1 ? "berth" : "berths";
    this.messages.push(
      `Hangar: ${occupied} passenger${occupied === 1 ? "" : "s"} aboard — that hull has ${nextCap} ${berthWord}.`,
      "station",
    );
    return true;
  }

  /** Black-market destroy-patrol: the named station's patrol going down completes the hunt. */
  private notePatrolDestroyed(stationKey: string, stationName: string): void {
    for (const mission of this.activeMissions) {
      if (mission.kind !== "bmDestroyPatrol" || mission.scanned) continue;
      if (mission.destStationKey !== stationKey) continue;
      mission.scanned = true;
      this.messages.push(
        `Rebels: ${stationName} patrol is down — return to ${mission.originStationName} to claim.`,
        "station",
      );
    }
  }

  private adjustFuelRatRep(delta: number): number {
    const next = this.reputation.adjust(FUEL_RATS_FACTION_ID, delta);
    this.pushRepChange("Fuel Rats", next, delta);
    return next;
  }

  private adjustMerchantsRep(delta: number): number {
    const next = this.reputation.adjust(MERCHANTS_GUILD_FACTION_ID, delta);
    this.pushRepChange("Merchants Guild", next, delta);
    return next;
  }

  private adjustCartographersRep(delta: number): number {
    const next = this.reputation.adjust(CARTOGRAPHERS_FACTION_ID, delta);
    this.pushRepChange("Cartographers", next, delta);
    return next;
  }

  private showDockedUi(station: Landmark): void {
    const key =
      this.currentStationKey(station) ??
      `visit:${this.local.poiId}:${station.id}`;
    this.dockedMenu.show(
      station.name,
      window.innerWidth,
      window.innerHeight,
      rollStationMenus(key),
      this.missionBoardHint(),
      this.dockStandingLine(station),
      this.dockServiceNote,
    );
  }

  private stations(): Landmark[] {
    const list: Landmark[] = [];
    if (this.local.focus.kind === "station") list.push(this.local.focus);
    for (const c of this.local.companions) {
      if (c.kind === "station") list.push(c);
    }
    return list;
  }

  private currentStationKey(station: Landmark): string | null {
    if (this.local.bodyId === null) return null;
    return stationKey(this.local.poiId, this.local.bodyId, station.id);
  }

  private update(dt: number): void {
    if (this.phase !== "playing") {
      this.updateRunFlow();
      return;
    }

    if (!this.ship.alive) {
      this.enterGameOver();
      return;
    }

    this.messages.update(dt);
    this.ship.tickDefense(dt);
    // Chart, system panel, ship, market, missions, hangar, and the dock
    // screen already skip NPC updates. The vent delay and the shed wait
    // with them, then continue from the stored heat and wait.
    if (!this.menuPausesNpc()) this.ship.tickHeat(dt);
    this.tickEnergyFlashes(dt);

    // Drain wheel every frame so deltas don't pile up while menus are closed.
    const wheel = this.pointer.consumeWheel();
    if (wheel !== 0) {
      if (this.hangarMenuOpen) {
        this.hangarMenu.handleWheel(wheel, this.pointer.x, this.pointer.y);
      } else if (this.missionBoardOpen) {
        this.missionBoard.handleWheel(wheel, this.pointer.x, this.pointer.y);
      } else if (this.marketMenuOpen) {
        this.marketMenu.handleWheel(wheel, this.pointer.x, this.pointer.y);
      } else if (this.shipMenuOpen) {
        this.shipMenu.handleWheel(wheel, this.pointer.x, this.pointer.y);
      } else {
        this.messages.handleWheel(wheel, this.pointer.x, this.pointer.y);
      }
    }

    if (this.fadePhase !== "idle") {
      this.releaseEnergyBeams();
      this.updateFade(dt);
      return;
    }

    // Beacon is already out — menus, dock, and the fuel-warn modal must not
    // freeze the wait. Combat itself still pauses while those are up.
    this.tickDistressInbound(dt);
    this.tickDistressImperial(dt);

    if (this.fuelWarnTravel) {
      this.releaseEnergyBeams();
      if (this.keyboard.consume("Escape")) {
        this.fuelWarnTravel = null;
        this.messages.push("Jump cancelled — not enough fuel for a return trip.");
        return;
      }
      if (this.pointer.consumeClick()) {
        const px = this.pointer.x;
        const py = this.pointer.y;
        const hitYes =
          px >= this.fuelWarnYes.x &&
          px <= this.fuelWarnYes.x + this.fuelWarnYes.w &&
          py >= this.fuelWarnYes.y &&
          py <= this.fuelWarnYes.y + this.fuelWarnYes.h;
        const hitNo =
          px >= this.fuelWarnNo.x &&
          px <= this.fuelWarnNo.x + this.fuelWarnNo.w &&
          py >= this.fuelWarnNo.y &&
          py <= this.fuelWarnNo.y + this.fuelWarnNo.h;
        if (hitYes) {
          const travel = this.fuelWarnTravel;
          this.fuelWarnTravel = null;
          this.beginTravel(travel, true);
        } else if (hitNo) {
          this.fuelWarnTravel = null;
          this.messages.push("Jump cancelled — not enough fuel for a return trip.");
        }
      }
      return;
    }

    if (this.keyboard.consume("KeyG")) {
      if (this.dock.kind === "docked") return;
      this.chartOpen = !this.chartOpen;
      if (this.chartOpen) {
        this.panelOpen = false;
        this.closeShipMenuUi();
        this.stationMenu.hide();
        this.pirateMenu.hide();
        this.chart.selectedId = null;
      }
    }

    if (this.keyboard.consume("KeyM")) {
      if (this.dock.kind === "docked") return;
      this.panelOpen = !this.panelOpen;
      if (this.panelOpen) {
        this.chartOpen = false;
        this.closeShipMenuUi();
        this.stationMenu.hide();
        this.pirateMenu.hide();
        this.panel.selectedBodyId = this.local.bodyId;
      }
    }

    if (this.keyboard.consume("KeyL")) {
      if (this.shipMenuOpen) {
        this.closeShipMenu();
      } else {
        this.openShipView();
      }
    }

    if (this.keyboard.consume("Escape")) {
      if (this.missionBoardOpen) {
        this.closeMissionBoard();
      } else if (this.hangarMenuOpen) {
        this.closeHangarMenu();
      } else if (this.marketMenuOpen) {
        this.closeMarketMenu();
      } else if (this.shipMenuOpen) {
        this.closeShipMenu();
      } else if (this.stationMenu.open) {
        this.stationMenu.hide();
      } else if (this.pirateMenu.open) {
        this.pirateMenu.hide();
      } else if (this.patrolMenu.open) {
        this.patrolMenu.hide();
      } else if (this.dock.kind === "approaching") {
        this.dock = { kind: "free" };
        this.messages.push("Docking approach cancelled.");
      } else {
        this.chartOpen = false;
        this.panelOpen = false;
        this.chart.selectedId = null;
      }
    }

    if (this.chartOpen) {
      this.releaseEnergyBeams();
      this.updateGalaxyMenu();
      return;
    }

    if (this.panelOpen) {
      this.releaseEnergyBeams();
      this.updateSystemMenu();
      return;
    }

    if (this.shipMenuOpen) {
      this.releaseEnergyBeams();
      this.updateShipMenu();
      return;
    }

    if (this.marketMenuOpen) {
      this.releaseEnergyBeams();
      this.updateMarketMenu();
      return;
    }

    if (this.missionBoardOpen) {
      this.releaseEnergyBeams();
      this.updateMissionBoard();
      const pose = this.ship.sample(1);
      this.camera.follow(pose.x, pose.y);
      return;
    }

    if (this.hangarMenuOpen) {
      this.releaseEnergyBeams();
      this.updateHangarMenu();
      const pose = this.ship.sample(1);
      this.camera.follow(pose.x, pose.y);
      return;
    }

    if (this.dock.kind === "docked") {
      this.releaseEnergyBeams();
      this.updateDockedMenu();
      const pose = this.ship.sample(1);
      this.camera.follow(pose.x, pose.y);
      return;
    }

    // Context menus are overlays — gameplay keeps running underneath
    if (this.stationMenu.open) {
      if (this.stationMenu.station) {
        this.stationMenu.dockEnabled = this.canDockAt(this.stationMenu.station);
        this.refreshStationSettleOffer(this.stationMenu.station);
      }
      this.updateStationMenu();
    } else if (this.pirateMenu.open) {
      this.updatePirateMenu();
    } else if (this.patrolMenu.open) {
      this.updatePatrolMenu();
    } else {
      this.handleWorldClick();
    }

    if (this.dock.kind === "approaching") {
      const arrived = this.ship.updateAutopilot(
        dt,
        this.dock.station.x,
        this.dock.station.y,
      );
      this.updateCombat(dt);
      // World is still live on approach — rats, stranded, and taunts keep going.
      this.updateDistress(dt);
      if (!this.ship.alive) {
        this.enterGameOver();
        return;
      }
      if (arrived) {
        this.completeDock(this.dock.station);
      }
    } else {
      this.ship.update(dt, this.keyboard.state);
      this.updateCombat(dt);
      if (!this.ship.alive) {
        this.enterGameOver();
        return;
      }
      this.updateScoop(dt);
      this.updateFuelScoop(dt);
      this.updateExploreScan(dt);
      this.updateDistress(dt);
    }

    if (
      this.pirateMenu.open &&
      !this.packAcceptingPayment()
    ) {
      this.pirateMenu.hide();
    }

    const pose = this.ship.sample(1);
    this.camera.follow(pose.x, pose.y);
  }

  private handleWorldClick(): void {
    if (!this.pointer.consumeClick()) return;
    if (this.dock.kind === "approaching") return;

    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const world = this.camera.screenToWorld(
      this.pointer.x,
      this.pointer.y,
      viewW,
      viewH,
    );

    if (this.tryHelpStrandedPilot(world.x, world.y)) return;

    // Fee window only: click a pirate hull to open the shared pack pay UI.
    // Must not early-return when the pack is idle — that ate station clicks.
    if (this.packAcceptingPayment() && this.pack) {
      for (const pirate of this.pirates) {
        if (!pirate.alive) continue;
        const hitR = pirate.radius + DOCK.clickPad;
        const dist = Math.hypot(world.x - pirate.x, world.y - pirate.y);
        if (dist <= hitR) {
          this.pirateMenu.show(
            this.pack.fee,
            this.pack.shipCount > 1,
            this.pointer.x,
            this.pointer.y,
            viewW,
            viewH,
          );
          return;
        }
      }
    }

    // Unfriendly / Violation: click a host-station patrol to pay a fine.
    // Hostile is unredeemable — no fine UI.
    for (const patrol of this.patrols) {
      if (!patrol.alive) continue;
      if (!this.reputation.hasOutstandingFine(patrol.stationKey)) continue;
      const hitR = patrol.radius + PATROL.clickPad;
      const dist = Math.hypot(world.x - patrol.x, world.y - patrol.y);
      if (dist <= hitR) {
        this.openPatrolFineUi(patrol, this.pointer.x, this.pointer.y, viewW, viewH);
        return;
      }
    }

    for (const station of this.stations()) {
      const hitR = station.radius + DOCK.clickPad;
      const dist = Math.hypot(world.x - station.x, world.y - station.y);
      if (dist <= hitR) {
        this.stationMenu.show(
          station,
          this.pointer.x,
          this.pointer.y,
          viewW,
          viewH,
        );
        this.stationMenu.dockEnabled = this.canDockAt(station);
        this.refreshStationSettleOffer(station);
        return;
      }
    }
  }

  private updatePirateMenu(): void {
    if (!this.pointer.consumeClick()) return;
    const action = this.pirateMenu.handleClick(this.pointer.x, this.pointer.y);
    if (action === "close") {
      this.pirateMenu.hide();
      return;
    }
    if (action !== "pay") return;
    if (!this.packAcceptingPayment()) {
      this.pirateMenu.hide();
      return;
    }
    this.payPackTribute();
  }

  private updatePatrolMenu(): void {
    if (!this.pointer.consumeClick()) return;
    const action = this.patrolMenu.handleClick(this.pointer.x, this.pointer.y);
    if (action === "close") {
      this.patrolMenu.hide();
      return;
    }
    if (action !== "pay") return;
    this.payPatrolFine();
  }

  /** Pay the open patrol fine — Violation→Unfriendly, Unfriendly→Neutral. */
  private payPatrolFine(): void {
    if (!this.patrolMenu.open) return;
    const stationName = this.patrolMenu.stationName;
    const patrol = this.patrols.find(
      (p) => p.alive && p.stationName === stationName,
    );
    if (!patrol) {
      this.patrolMenu.hide();
      return;
    }
    this.settleViolationOrFine(patrol.stationKey, stationName, "patrol");
    this.patrolMenu.hide();
  }

  /**
   * Station-hail Violation settle — same path as patrol click.
   * Offered even when a host patrol is present (dual path; patrol not required).
   * Scan debt → hand over + fee; stolen-haul → credits-only standing fine.
   * After pay → Unfriendly + clearance if safe.
   */
  private payStationHailFine(station: Landmark): void {
    const key = this.currentStationKey(station);
    if (!key) return;
    const ok = this.settleViolationOrFine(key, station.name, "station");
    if (!ok) return;
    this.stationMenu.setSettleOffer(null);
    // Standing is now Unfriendly — grant clearance so Dock works without re-hail.
    if (!this.pirateAggroActive() && this.reputation.allowsDock(key)) {
      this.dockClearance.add(station.id);
      this.stationMenu.dockEnabled = true;
    }
  }

  /**
   * Dual-path redeem: scan debt if present, else standing fine.
   */
  private settleViolationOrFine(
    key: string,
    stationName: string,
    via: "patrol" | "station",
  ): boolean {
    if (this.scanDebt.has(key)) {
      return this.settleScanDebt(key, stationName, via);
    }
    return this.settleStandingFine(key, stationName, via);
  }

  /**
   * Settle knownIllegalDebt: confiscate remaining matching CU + fee for shortfall.
   * Empty hold → fee for full debt. → Unfriendly.
   */
  private settleScanDebt(
    key: string,
    stationName: string,
    via: "patrol" | "station",
  ): boolean {
    const speaker = via === "patrol" ? `${stationName} patrol` : stationName;
    const debt = this.scanDebt.get(key);
    if (!debt) {
      this.messages.push(`${speaker}: No scan debt on record.`, "station");
      return false;
    }
    const band = standingBand(this.reputation.stationStanding(key));
    if (band === "hostile") {
      this.messages.push(
        `${speaker}: Your record is Hostile — no settlement will clear it.`,
        "station",
      );
      return false;
    }
    if (via === "station" && band !== "violation") {
      this.messages.push(
        `${speaker}: No Violation on record — hail for clearance.`,
        "station",
      );
      return false;
    }
    const quote = quoteScanSettle(debt, this.ship.cargo);
    if (!this.ship.spendCredits(quote.feeCredits)) {
      this.messages.push(
        `${speaker}: Need ${quote.feeCredits} cr for the shortfall fee (above black-market rates).`,
        "station",
      );
      return false;
    }
    for (const line of quote.lines) {
      if (line.handOverCu > 0) {
        confiscateIllegalCu(this.ship.cargo, line.commodityId, line.handOverCu);
      }
    }
    const before = this.reputation.stationStanding(key);
    const next = this.reputation.applyPatrolFine(key, stationName);
    if (next === null) {
      // Refund fee; cargo already taken — reverse confiscation is messy; restore fee only.
      this.ship.addCredits(quote.feeCredits);
      this.messages.push(`${speaker}: Unable to clear the record.`, "station");
      return false;
    }
    this.scanDebt.clear(key);
    this.scanCaught.delete(key);
    this.clearPatrolWarnings(key);
    const handBit =
      quote.handOverCu > 0
        ? `Confiscated ${quote.handOverCu} CU`
        : "No matching cargo left";
    const feeBit =
      quote.feeCredits > 0
        ? ` · shortfall fee −${quote.feeCredits} cr`
        : "";
    this.messages.push(
      `${speaker}: Debt settled (${handBit}${feeBit}). Standing → Unfriendly.`,
      "station",
    );
    this.pushRepChange(stationName, next, next - before);
    return true;
  }

  /**
   * Shared standing fine: credits + applyPatrolFine → Unfriendly / Neutral.
   * Works with or without a live patrol (station hail fallback).
   * @returns true when the fine was paid and standing changed.
   */
  private settleStandingFine(
    key: string,
    stationName: string,
    via: "patrol" | "station",
  ): boolean {
    const speaker = via === "patrol" ? `${stationName} patrol` : stationName;
    const band = standingBand(this.reputation.stationStanding(key));
    if (band === "hostile") {
      this.messages.push(
        `${speaker}: Your record is Hostile — no fine will clear it.`,
        "station",
      );
      return false;
    }
    if (!this.reputation.hasOutstandingFine(key)) {
      this.messages.push(`${speaker}: No outstanding fines.`, "station");
      return false;
    }
    // Station hail settle is Violation-only; Unfriendly stays optional via patrol.
    if (via === "station" && band !== "violation") {
      this.messages.push(
        `${speaker}: No Violation on record — hail for clearance.`,
        "station",
      );
      return false;
    }
    const fine = this.reputation.patrolFineCredits(key);
    if (!this.ship.spendCredits(fine)) {
      this.messages.push(
        `${speaker}: Need ${fine} cr to settle the fine.`,
        "station",
      );
      return false;
    }
    const before = this.reputation.stationStanding(key);
    const next = this.reputation.applyPatrolFine(key, stationName);
    if (next === null) {
      this.ship.addCredits(fine);
      return false;
    }
    // Clear warning timers on host patrols after a successful Violation pay.
    this.clearPatrolWarnings(key);
    const outcome =
      band === "violation"
        ? "Standing restored to Unfriendly (docking allowed)."
        : "Standing restored to Neutral.";
    this.messages.push(
      `${speaker}: Fine paid (−${fine} cr). ${outcome}`,
      "station",
    );
    this.pushRepChange(stationName, next, next - before);
    return true;
  }

  /** Show Settle on the station popup while Violation (dual path with patrol click). */
  private refreshStationSettleOffer(station: Landmark): void {
    const key = this.currentStationKey(station);
    if (!key) {
      this.stationMenu.setSettleOffer(null);
      return;
    }
    const band = standingBand(this.reputation.stationStanding(key));
    // Always offer settle while Violation — even if a host patrol exists.
    if (band !== "violation") {
      this.stationMenu.setSettleOffer(null);
      return;
    }
    const debt = this.scanDebt.get(key);
    if (debt) {
      const quote = quoteScanSettle(debt, this.ship.cargo);
      this.stationMenu.setSettleOffer({
        credits: quote.feeCredits,
        handOverCu: quote.handOverCu,
        scanDebt: true,
      });
      return;
    }
    this.stationMenu.setSettleOffer({
      credits: this.reputation.patrolFineCredits(key),
      handOverCu: 0,
      scanDebt: false,
    });
  }

  private clearPatrolWarnings(stationKey: string): void {
    for (const p of this.patrols) {
      if (p.stationKey === stationKey) p.clearWarning();
    }
  }

  private openPatrolFineUi(
    patrol: StationPatrol,
    cursorX: number,
    cursorY: number,
    viewW: number,
    viewH: number,
  ): void {
    const score = this.reputation.stationStanding(patrol.stationKey);
    const band = standingBand(score);
    if (band !== "unfriendly" && band !== "violation") return;

    const debt = this.scanDebt.get(patrol.stationKey);
    if (debt && band === "violation") {
      const quote = quoteScanSettle(debt, this.ship.cargo);
      this.patrolMenu.show(
        patrol.stationName,
        quote.feeCredits,
        formatStanding(score),
        "scanDebt",
        cursorX,
        cursorY,
        viewW,
        viewH,
        quote.handOverCu,
      );
      return;
    }

    const fine = this.reputation.patrolFineCredits(patrol.stationKey);
    this.patrolMenu.show(
      patrol.stationName,
      fine,
      formatStanding(score),
      band,
      cursorX,
      cursorY,
      viewW,
      viewH,
    );
  }

  private updateStationMenu(): void {
    if (!this.pointer.consumeClick()) return;
    const action = this.stationMenu.handleClick(this.pointer.x, this.pointer.y);
    if (action === "close" || action === null) {
      if (action === "close") this.stationMenu.hide();
      return;
    }

    const station = this.stationMenu.station;
    if (!station) return;

    if (action === "hail") {
      this.hailStation(station);
      return;
    }

    if (action === "settle") {
      this.payStationHailFine(station);
      return;
    }

    if (action === "dock") {
      this.requestDock(station);
    }
  }

  /**
   * Hostile station standing blocks hail clearance and approach.
   */
  private stationReputationAllowsDock(station: Landmark): boolean {
    const key = this.currentStationKey(station);
    if (!key) return true;
    return this.reputation.allowsDock(key);
  }

  private hasDockClearance(station: Landmark): boolean {
    return this.dockClearance.has(station.id);
  }

  /** Dock only after successful hail, and while aggro + reputation stay clear. */
  private canDockAt(station: Landmark): boolean {
    return (
      this.hasDockClearance(station) &&
      !this.pirateAggroActive() &&
      this.stationReputationAllowsDock(station)
    );
  }

  private hailStation(station: Landmark): void {
    if (this.pirateAggroActive()) {
      this.dockClearance.delete(station.id);
      this.stationMenu.dockEnabled = false;
      this.messages.push(
        `${station.name}: Negative. Hostiles in sector — docking denied.`,
        "station",
      );
      return;
    }

    if (!this.stationReputationAllowsDock(station)) {
      this.dockClearance.delete(station.id);
      this.stationMenu.dockEnabled = false;
      const key = this.currentStationKey(station);
      const band = key
        ? standingBand(this.reputation.stationStanding(key))
        : "hostile";
      if (band === "violation" && key) {
        this.refreshStationSettleOffer(station);
        const debt = this.scanDebt.has(key);
        this.messages.push(
          debt
            ? `${station.name}: Illegal cargo debt unpaid — docking denied. Settle here (hand over remaining + fee), or click a patrol — same outcome either way.`
            : `${station.name}: Outstanding violations — docking denied. Settle the fine here, or click a patrol — same outcome either way.`,
          "station",
        );
      } else {
        this.stationMenu.setSettleOffer(null);
        this.messages.push(
          `${station.name}: Your record is Hostile — docking permanently denied.`,
          "station",
        );
      }
      return;
    }

    this.dockClearance.add(station.id);
    this.stationMenu.dockEnabled = true;
    this.stationMenu.setSettleOffer(null);
    this.messages.push(
      `${station.name}: Clearance granted. You are cleared to dock.`,
      "station",
    );
  }

  private requestDock(station: Landmark): void {
    this.stationMenu.hide();

    if (!this.hasDockClearance(station)) {
      this.messages.push(
        `${station.name}: Hail for docking clearance before approach.`,
        "station",
      );
      return;
    }

    if (this.pirateAggroActive()) {
      this.messages.push(
        `${station.name}: Approach rejected — pirate threat active.`,
        "station",
      );
      return;
    }

    if (!this.stationReputationAllowsDock(station)) {
      const key = this.currentStationKey(station);
      const band = key
        ? standingBand(this.reputation.stationStanding(key))
        : "hostile";
      const reason =
        band === "violation"
          ? "outstanding violations — settle the fine from the station menu (or a patrol)."
          : "Hostile standing — approach denied.";
      this.messages.push(
        `${station.name}: Approach rejected — ${reason}`,
        "station",
      );
      return;
    }

    this.dock = { kind: "approaching", station };
    this.messages.push(`Autopilot engaged: docking with ${station.name}.`);
  }

  private completeDock(station: Landmark): void {
    this.dock = { kind: "docked", station };
    this.ship.vx = 0;
    this.ship.vy = 0;
    this.ship.x = station.x;
    this.ship.y = station.y;
    this.projectiles = [];
    this.releaseEnergyBeams();
    this.redeemPendingKills(station.name);
    this.redeemCartographerVisits(station.name);
    this.tryCompleteCargoDelivery(station);
    this.syncExploreClaimableAtStation(station);
    const key =
      this.currentStationKey(station) ??
      `visit:${this.local.poiId}:${station.id}`;
    this.lastDockedStation = { key, name: station.name };
    this.dockMarket = createStationMarket(key, this.marketContext());
    this.dockBlackMarket = stationOffersBlackMarket(key)
      ? createBlackMarket(key, this.marketContext())
      : null;
    this.dockMissionOffers = this.buildDockMissionOffers(station);
    this.ensureMissionBoardReplenished(station);
    this.dockServiceNote = [];
    this.showDockedUi(station);
    this.messages.push(`Docked at ${station.name}.`);
    // Denial (hail / approach) is unchanged. Service runs only when standing
    // still allows dock at arrival: not Violation, not Hostile.
    if (this.stationReputationAllowsDock(station)) {
      this.applyComplimentaryDockService(station);
    }
  }

  /**
   * TEMP(dock-service): new game starts short so the first allowed dock
   * prints a non-zero refill. Strip with the dock-panel TEMP lines.
   * Does not change the charge (still 0 cr).
   */
  private applyTempDockServiceShortfall(): void {
    const hullRoom = Math.max(0, this.ship.health - 1);
    this.ship.health -= Math.min(4, hullRoom);
    this.ship.fuel = Math.max(0, this.ship.fuel - Math.min(3, this.ship.fuel));
    for (const slot of this.ship.loadout.slots) {
      const equipped = slot.equipped;
      if (!equipped || equipped.kind !== "weapon" || equipped.ammoMax === null) {
        continue;
      }
      this.ship.loadout.consumeSlotAmmo(slot.id, 40);
      break;
    }
  }

  /** Free hull repair, refuel, and ammo refill when standing allows dock. */
  private applyComplimentaryDockService(station: Landmark): void {
    const result = this.ship.applyComplimentaryDockService();
    const refueled = result.fuelAdded > 0;
    if (result.healed > 0 && refueled) {
      this.messages.push(
        `${station.name}: Complimentary repair, refuel, and ammo — hull, tanks, and magazines topped free of charge.`,
        "station",
      );
    } else if (result.healed > 0) {
      this.messages.push(
        `${station.name}: Complimentary repair and ammo — hull restored and magazines topped free of charge.`,
        "station",
      );
    } else if (refueled) {
      this.messages.push(
        `${station.name}: Complimentary refuel and ammo — tanks and magazines topped free of charge.`,
        "station",
      );
    } else {
      this.messages.push(
        `${station.name}: Complimentary dock services — hull and fuel already full. Magazines topped.`,
        "station",
      );
    }
    const hull = this.formatServiceAmount(result.healed);
    const fuel = this.formatServiceAmount(result.fuelAdded);
    const ammo = this.formatServiceAmount(result.ammoAdded);
    this.messages.push(
      `TEMP(dock-service): Hull +${hull}, fuel +${fuel}, ammo +${ammo}. Repair ${result.repairCredits} cr, refuel ${result.refuelCredits} cr, ammo ${result.ammoCredits} cr.`,
      "station",
    );
    this.dockServiceNote = [
      "TEMP(dock-service)",
      `Hull +${hull}, fuel +${fuel}, ammo +${ammo}`,
      `Repair ${result.repairCredits} cr, refuel ${result.refuelCredits} cr, ammo ${result.ammoCredits} cr`,
    ];
    this.showDockedUi(station);
  }

  private formatServiceAmount(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return "0";
    const rounded = Math.round(n * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  private updateDockedMenu(): void {
    if (!this.pointer.consumeClick()) return;
    if (this.dock.kind !== "docked") return;
    const station = this.dock.station;
    const action = this.dockedMenu.handleClick(this.pointer.x, this.pointer.y);
    if (action === "bay") {
      this.openBay(station);
      return;
    }
    if (action === "hangar") {
      this.openHangar(station);
      return;
    }
    if (action === "market") {
      this.openMarket(station);
      return;
    }
    if (action === "blackMarket") {
      this.openBlackMarket(station);
      return;
    }
    if (action === "missions") {
      this.openMissionBoard(station);
      return;
    }
    if (action === "launch") {
      this.launchFromStation();
    }
  }

  private launchFromStation(): void {
    if (this.dock.kind !== "docked") return;
    const station = this.dock.station;
    this.dockedMenu.hide();
    this.marketMenu.hide();
    this.marketMenuOpen = false;
    this.missionBoard.hide();
    this.missionBoardOpen = false;
    this.hangarMenu.hide();
    this.hangarMenuOpen = false;
    this.dockMarket = null;
    this.dockBlackMarket = null;
    this.marketMenuKind = "legal";
    this.dockMissionOffers = [];
    this.dockServiceNote = [];
    this.dock = { kind: "free" };
    // Nudge clear of the station so the ship isn't buried in the hub
    const angle = this.ship.heading;
    const size = this.ship.hull.size;
    this.ship.arriveAt(
      station.x + Math.cos(angle) * (station.radius + size * 2),
      station.y + Math.sin(angle) * (station.radius + size * 2),
      angle,
    );
    this.messages.push(`Launched from ${station.name}.`);
  }

  /**
   * Hold F near a scanned rich rock while Ore Scanner + Cargo Scoop are fitted
   * (or a Prospecting Rig). Collects 1 CU at a time; rocks deplete.
   * Derelict debris (Retrieve Derelict Cargo): Cargo Scoop only — no scanner.
   */
  private updateScoop(dt: number): void {
    this.scoopHintCooldown = Math.max(0, this.scoopHintCooldown - dt);
    if (this.dock.kind !== "free") {
      this.scoopProgress = 0;
      return;
    }
    if (!this.ship.alive || this.menuOpen()) {
      this.scoopProgress = 0;
      return;
    }

    const rocks = this.local.beltRocks;
    const inBelt = this.local.focus.kind === "asteroidBelt";
    const inDerelict = this.local.focus.kind === "derelict";
    if (!rocks || (!inBelt && !inDerelict)) {
      this.scoopProgress = 0;
      return;
    }

    const holding = this.keyboard.state.scoop;
    if (!holding) {
      this.scoopProgress = 0;
      return;
    }

    if (inDerelict) {
      this.updateDerelictCargoScoop(dt, rocks);
      return;
    }

    if (!this.ship.loadout.canProspectBelts) {
      this.scoopProgress = 0;
      return;
    }

    const scanRange = this.ship.loadout.mineralScanRange;
    const scoopRange = this.ship.loadout.scoopRange;
    const reach = scoopRange + SCOOP.rangePad;

    let best: (typeof rocks)[number] | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const rock of rocks) {
      if (!rock.yieldId || rock.remaining <= 0) continue;
      if (rock.yieldId === "derelict_cargo") continue;
      const dist = Math.hypot(rock.x - this.ship.x, rock.y - this.ship.y);
      if (dist > scanRange) continue;
      if (dist > rock.r + reach) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = rock;
      }
    }

    if (!best || !best.yieldId) {
      this.scoopProgress = 0;
      if (this.scoopHintCooldown <= 0) {
        this.messages.push(
          "Scoop: No scanned vein in range — fly toward a highlighted rock.",
        );
        this.scoopHintCooldown = 3.5;
      }
      return;
    }

    if (this.ship.cargo.freeCu < 1) {
      this.scoopProgress = 0;
      if (this.scoopHintCooldown <= 0) {
        this.messages.push("Scoop: Cargo full — dock and sell before more ore.");
        this.scoopHintCooldown = 4;
      }
      return;
    }

    this.scoopProgress += dt;
    if (this.scoopProgress < SCOOP.secondsPerCu) return;
    this.scoopProgress = 0;

    const commodity = commodityById(best.yieldId);
    if (!commodity) return;
    if (!this.ship.cargo.stow({ id: commodity.id, name: commodity.name, cu: 1 })) {
      return;
    }
    best.remaining -= 1;
    const label = rockYieldLabel(best.yieldId);
    if (best.remaining <= 0) {
      this.messages.push(`Scoop: +1 CU ${label} — vein depleted.`);
    } else {
      this.messages.push(`Scoop: +1 CU ${label} (${best.remaining} left).`);
    }
  }

  /**
   * Scoop Sensitive Derelict Cargo from the marked debris piece (mission only).
   */
  private updateDerelictCargoScoop(
    dt: number,
    rocks: NonNullable<LocalView["beltRocks"]>,
  ): void {
    if (this.ship.loadout.scoopRange <= 0) {
      this.scoopProgress = 0;
      return;
    }

    const mission = this.activeMissions.find(
      (m) =>
        isDerelictRetrievalKind(m.kind) &&
        m.targetPoiId === this.local.poiId &&
        !m.scanned,
    );
    if (!mission) {
      this.scoopProgress = 0;
      return;
    }

    const scoopRange = this.ship.loadout.scoopRange;
    const reach = scoopRange + SCOOP.rangePad;

    let best: (typeof rocks)[number] | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const rock of rocks) {
      if (rock.yieldId !== "derelict_cargo" || rock.remaining <= 0) continue;
      const dist = Math.hypot(rock.x - this.ship.x, rock.y - this.ship.y);
      if (dist > rock.r + reach) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = rock;
      }
    }

    if (!best) {
      this.scoopProgress = 0;
      if (this.scoopHintCooldown <= 0) {
        this.messages.push(
          "Scoop: Fly to the marked debris (circle).",
        );
        this.scoopHintCooldown = 3.5;
      }
      return;
    }

    const need = mission.cu ?? QUEST.derelictCargoCu;
    if (this.ship.cargo.freeCu < need) {
      this.scoopProgress = 0;
      if (this.scoopHintCooldown <= 0) {
        this.messages.push("Scoop: Need free CU for derelict cargo.");
        this.scoopHintCooldown = 4;
      }
      return;
    }

    this.scoopProgress += dt;
    if (this.scoopProgress < SCOOP.secondsPerCu) return;
    this.scoopProgress = 0;

    if (
      !this.ship.cargo.stow({
        id: missionCargoId(mission.id),
        name: DERELICT_CARGO_NAME,
        cu: need,
      })
    ) {
      return;
    }
    best.remaining = 0;
    best.yieldId = null;
    this.lastScoopedDerelictDebris.set(this.local.poiId, best.id);
    mission.scanned = true;
    this.messages.push(
      `Scoop: +${need} CU ${DERELICT_CARGO_NAME} — return to ${mission.originStationName} to claim (+${mission.reward} cr).`,
    );
  }

  /**
   * Hold F near a main-sequence star with Fuel Scoop fitted — skim tank fuel.
   */
  private updateFuelScoop(dt: number): void {
    if (!this.ship.loadout.hasFuelScoop) {
      this.fuelScoopProgress = 0;
      return;
    }
    if (this.dock.kind !== "free" || !this.ship.alive || this.menuOpen()) {
      this.fuelScoopProgress = 0;
      return;
    }
    // Asteroid / derelict cargo scoop owns F in those focus views.
    if (
      this.local.focus.kind === "asteroidBelt" ||
      this.local.focus.kind === "derelict"
    ) {
      this.fuelScoopProgress = 0;
      return;
    }
    const holding = this.keyboard.state.scoop;
    if (!holding) {
      this.fuelScoopProgress = 0;
      return;
    }
    if (this.local.focus.kind !== "star" || !this.local.starClass) {
      this.fuelScoopProgress = 0;
      return;
    }
    const star = this.local.focus;
    const dist = Math.hypot(star.x - this.ship.x, star.y - this.ship.y);
    const reach = star.radius + FUEL.scoopRangePad;
    if (dist > reach) {
      this.fuelScoopProgress = 0;
      return;
    }
    if (this.ship.missingFuel <= 0) {
      this.fuelScoopProgress = 0;
      return;
    }
    this.fuelScoopProgress += dt;
    if (this.fuelScoopProgress < FUEL.scoopSecondsPerUnit) return;
    this.fuelScoopProgress = 0;
    const gained = this.ship.addFuel(1);
    if (gained > 0) {
      this.messages.push(
        `Fuel Scoop: +1 fuel (${Math.floor(this.ship.fuel)}/${this.ship.maxFuel}).`,
      );
    }
  }

  /**
   * Hold F at an exploration target POI with Survey Scanner fitted.
   * Lightweight — no range gate beyond being in the local view.
   */
  private updateExploreScan(dt: number): void {
    this.poiScanHintCooldown = Math.max(0, this.poiScanHintCooldown - dt);
    if (this.dock.kind !== "free" || !this.ship.alive || this.menuOpen()) {
      this.poiScanProgress = 0;
      return;
    }

    const mission = this.activeMissions.find(
      (m) =>
        isSurveyMissionKind(m.kind) &&
        !m.scanned &&
        m.targetPoiId === this.local.poiId,
    );
    if (!mission) {
      this.poiScanProgress = 0;
      return;
    }

    // Belt / derelict F scoop owns the key in those views.
    if (
      this.local.focus.kind === "asteroidBelt" ||
      this.local.focus.kind === "derelict"
    ) {
      this.poiScanProgress = 0;
      return;
    }

    if (!this.ship.loadout.hasPoiScan) {
      this.poiScanProgress = 0;
      if (this.poiScanHintCooldown <= 0) {
        this.messages.push(
          "Survey: Fit a Survey Scanner (Bay), then hold F to scan.",
        );
        this.poiScanHintCooldown = 4;
      }
      return;
    }

    if (!this.keyboard.state.scoop) {
      this.poiScanProgress = 0;
      return;
    }

    this.poiScanProgress += dt;
    if (this.poiScanProgress < QUEST.exploreScanSeconds) return;
    this.poiScanProgress = 0;

    mission.scanned = true;
    this.scannedPoiIds.add(this.local.poiId);
    this.messages.push(
      `Scan complete: ${mission.targetPoiName}. Return to ${mission.originStationName} to claim (+${mission.reward} cr).`,
    );
  }

  /**
   * Distress response delay. Runs even while menus / dock pause the world —
   * the beacon is already out. Spawning here is safe; AI ticks in updateDistress.
   */
  private tickDistressInbound(dt: number): void {
    if (!this.distressInbound) return;
    this.distressInbound.elapsed += dt;
    if (this.distressInbound.elapsed < this.distressInbound.delay) return;
    const kind = this.distressInbound.kind;
    this.distressInbound = null;
    if (kind === "pirates") {
      this.spawnDistressPirates();
    } else {
      this.spawnFuelRat();
    }
  }

  /**
   * 45s from distress-pirate arrival. Menus do not pause it. If that pack
   * is already gone, the timer was cleared and this does not spawn.
   */
  private tickDistressImperial(dt: number): void {
    if (this.distressImperialTimer === null || this.distressImperialTimer <= 0) {
      return;
    }
    this.distressImperialTimer -= dt;
    if (this.distressImperialTimer > 0) return;
    this.distressImperialTimer = null;
    if (this.distressPirates.some((p) => p.alive)) {
      this.spawnDistressImperial();
    }
  }

  /** Pirate taunt timer, stranded scoot, and fuel rat arrival / refuel. */
  private updateDistress(dt: number): void {
    if (this.distressPack && this.distressPirates.some((p) => p.alive)) {
      if (this.distressPack.phase === "comms") {
        this.distressPack.timer = Math.max(0, this.distressPack.timer - dt);
        for (const p of this.distressPirates) {
          if (p.alive) p.setPeaceful();
        }
        if (this.distressPack.timer <= 0) {
          this.distressPack.phase = "hostile";
          for (const p of this.distressPirates) {
            if (p.alive) p.goAggro();
          }
          this.messages.push(
            this.distressPack.shipCount > 1
              ? "Pirate pack: Enough talk — weapons free!"
              : "Pirate: Enough talk — die!",
            "pirate",
          );
        }
      }
    }

    if (this.baitPack && this.baitPirate?.alive) {
      if (this.baitPack.phase === "comms") {
        this.baitPack.timer = Math.max(0, this.baitPack.timer - dt);
        this.baitPirate.setPeaceful();
        if (this.baitPack.timer <= 0) {
          this.baitPack.phase = "hostile";
          this.baitPirate.goAggro();
          this.messages.push("Pirate: Weapons free!", "pirate");
        }
      }
    }

    if (this.strandedPilot?.alive) {
      this.strandedPilot.update(dt, this.ship.x, this.ship.y);
      if (this.strandedPilot.warpedAway) {
        this.strandedPilot = null;
      }
    }

    if (this.fuelRat && this.fuelRat.alive) {
      const rat = this.fuelRat;
      const prev = rat.phase;
      rat.update(dt, this.ship.x, this.ship.y);
      if (prev !== "comms" && rat.phase === "comms") {
        const reach = canReachNearestStation(
          this.galaxy,
          this.local.poiId,
          this.local.bodyId,
          this.ship.fuel,
          this.ship.jumpRange(),
        );
        if (reach.canReach) {
          const place = reach.target.poiName;
          this.messages.push(
            `Fuel Rat: Looks like you can make it to ${place}, don't abuse the distress signal.`,
            "fuelRat",
          );
          this.adjustFuelRatRep(REPUTATION.fuelRatAbuse);
          rat.beginDepart();
          this.distressPending = false;
        } else {
          this.messages.push(
            "Fuel Rat: Copy distress — holding position, running a hose.",
            "fuelRat",
          );
        }
      }
      if (rat.phase === "refuel" && !rat.didRefuel && !rat.refuseAssist) {
        rat.didRefuel = true;
        const target = nearestStationRefuel(
          this.galaxy,
          this.local.poiId,
          this.local.bodyId,
          this.ship.jumpRange(),
        );
        const needed = Math.max(target.fuelNeeded, supercruiseFuelCost());
        this.ship.ensureFuelAtLeast(needed);
        this.adjustFuelRatRep(REPUTATION.fuelRatGenuineRescue);
        this.messages.push(
          `Fuel Rat: Topped you to ${Math.floor(this.ship.fuel)} fuel. ${target.detail}`,
          "fuelRat",
        );
        this.distressPending = false;
      }
      if (rat.warpedAway) {
        this.fuelRat = null;
        this.distressPending = false;
        if (!rat.refuseAssist) {
          this.messages.push("Fuel Rat: Clear skies — we're out.", "fuelRat");
        }
      }
    }
  }

  /**
   * On local enter: if an active Fuel Rat distress-answer mission targets this
   * view, spawn either a stranded pilot or a no-fee pirate bait.
   */
  private spawnFactionDistressEncounter(): void {
    const mission = this.activeMissions.find(
      (m) =>
        m.kind === "distressAnswer" &&
        distressAnswerMatchesView(m, this.local.poiId, this.local.bodyId),
    );
    if (!mission) return;

    const ang = Math.random() * Math.PI * 2;
    const dist =
      FUEL.distressSpawnMin +
      Math.random() * (FUEL.distressSpawnMax - FUEL.distressSpawnMin);
    const x = this.ship.x + Math.cos(ang) * dist;
    const y = this.ship.y + Math.sin(ang) * dist;
    const heading = ang + Math.PI;

    if (mission.distressOutcome === "bait") {
      const bait = heatPirateFits(
        this.galaxy,
        this.local.poiId,
        Math.random,
        true,
      );
      const fit = bait.fits[0]!;
      this.baitPirate = new Pirate(x, y, heading, fit, bait.difficulty, 0);
      this.baitPirate.setPeaceful();
      this.baitPack = {
        phase: "comms",
        fee: 0,
        timer: QUEST.distressAnswerAggroSeconds,
        demanded: true,
        shipCount: 1,
      };
      this.messages.push(
        "Pirate: Took the bait- your cargo is mine!",
        "pirate",
      );
      return;
    }

    this.strandedPilot = new StrandedPilot(x, y, heading);
    this.messages.push(strandedRadioLine(), "station");
  }

  /** Left-click stranded pilot → donate fuel for nearest-station reach. */
  private tryHelpStrandedPilot(worldX: number, worldY: number): boolean {
    const pilot = this.strandedPilot;
    if (!pilot?.canHelp) return false;
    const hitR = pilot.radius + DOCK.clickPad;
    if (Math.hypot(worldX - pilot.x, worldY - pilot.y) > hitR) return false;

    const reach = canReachNearestStation(
      this.galaxy,
      this.local.poiId,
      this.local.bodyId,
      Number.POSITIVE_INFINITY,
    );
    const needed = Math.max(reach.needed, supercruiseFuelCost());
    if (this.ship.fuel < needed) {
      this.messages.push(
        `Stranded: Need ${needed} fuel for a jump out — you only have ${Math.floor(this.ship.fuel)}.`,
        "station",
      );
      return true;
    }
    if (!this.ship.consumeFuel(needed)) return true;

    // Scoot off then hyperspace (pirate escape pathing) — don't vanish instantly.
    pilot.beginDepart();
    this.messages.push(
      `Stranded: Bless you — ${needed} fuel should get me to ${reach.target.poiName}.`,
      "station",
    );
    this.completeDistressAnswerMission(true);
    return true;
  }

  /**
   * Finish (or void) an active Fuel Rat distress-answer contract in this view.
   * `helped` → Fuel Rat reputation only; bait kill/flee → nothing.
   */
  private completeDistressAnswerMission(helped: boolean): void {
    const idx = this.activeMissions.findIndex(
      (m) =>
        m.kind === "distressAnswer" &&
        distressAnswerMatchesView(m, this.local.poiId, this.local.bodyId),
    );
    if (idx < 0) return;
    const mission = this.activeMissions[idx]!;
    this.activeMissions.splice(idx, 1);
    if (helped) {
      this.adjustFuelRatRep(REPUTATION.fuelRatMissionComplete);
      this.messages.push(
        `Fuel Rats: Distress answered at ${mission.targetBodyName ?? mission.targetPoiName} — gratitude logged.`,
        "station",
      );
    } else {
      this.messages.push(
        "Fuel Rats: Site was pirate bait — contract void. No reward.",
        "station",
      );
    }
  }

  /**
   * Tick the one-shot intrusion timer while free-flying.
   * After the rolled delay, one extra-rare chance — then never again this visit.
   */
  private updatePirateIntrusion(dt: number): void {
    const state = this.intrusion;
    if (!state || state.resolved) return;
    // Docked / approaching time does not count — "mulling about" is free flight.
    if (this.dock.kind !== "free") return;

    state.elapsed += dt;
    if (state.elapsed < state.delay) return;

    state.resolved = true;
    if (this.pirates.some((p) => p.alive) || this.pack) return;
    if (Math.random() >= ENCOUNTERS.intrusion.chance) return;

    this.spawnPirateIntrusion();
  }

  /** Drop a difficulty pack for this system into the current local view. */
  private spawnPirateIntrusion(): void {
    const intrusion = heatPirateFits(this.galaxy, this.local.poiId, Math.random);
    const fits = intrusion.fits;
    const count = fits.length;
    const fee = ENCOUNTERS.feeByTemplate.scout;
    const angle = Math.random() * Math.PI * 2;
    const dist =
      COMBAT.pirateSpawnMin +
      Math.random() * (COMBAT.pirateSpawnMax - COMBAT.pirateSpawnMin);
    const anchorX = this.ship.x + Math.cos(angle) * dist;
    const anchorY = this.ship.y + Math.sin(angle) * dist;

    for (let i = 0; i < count; i += 1) {
      const offset =
        count === 1
          ? 0
          : ((i / count) * 2 - 1) * ENCOUNTERS.formationRadius * 0.5;
      const heading = Math.atan2(this.ship.y - anchorY, this.ship.x - anchorX);
      this.pirates.push(
        new Pirate(
          anchorX + Math.cos(heading + Math.PI / 2) * offset,
          anchorY + Math.sin(heading + Math.PI / 2) * offset,
          heading,
          fits[i]!,
          intrusion.difficulty,
          fee,
        ),
      );
    }

    this.pack = {
      phase: "idle",
      fee,
      timer: 0,
      demanded: false,
      shipCount: count,
    };
    this.messages.push(
      count > 1
        ? "Pirates drop out of the black — unexpected visitors."
        : "A pirate drops out of the black — unexpected visitor.",
      "pirate",
    );
  }

  /**
   * Passenger-fare jump intercept — taunt then aggro, no fee demand.
   * Difficulty scales with passengers aboard, with overlap.
   */
  private spawnPassengerIntercept(passengers: number): void {
    const difficulty = rollPassengerDifficulty(passengers, Math.random);
    const tiers = pirateRecipeFits(difficulty, Math.random);
    const angle = Math.random() * Math.PI * 2;
    const dist =
      COMBAT.pirateSpawnMin +
      Math.random() * (COMBAT.pirateSpawnMax - COMBAT.pirateSpawnMin);
    const anchorX = this.ship.x + Math.cos(angle) * dist;
    const anchorY = this.ship.y + Math.sin(angle) * dist;
    const count = tiers.length;

    for (let i = 0; i < count; i += 1) {
      const offset =
        count === 1
          ? 0
          : ((i / count) * 2 - 1) * ENCOUNTERS.formationRadius * 0.55;
      const heading = Math.atan2(this.ship.y - anchorY, this.ship.x - anchorX);
      this.pirates.push(
        new Pirate(
          anchorX + Math.cos(heading + Math.PI / 2) * offset,
          anchorY + Math.sin(heading + Math.PI / 2) * offset,
          heading,
          tiers[i]!,
          difficulty,
          0,
        ),
      );
    }

    for (const p of this.pirates) p.setPeaceful();
    this.pack = {
      phase: "comms",
      fee: 0,
      timer: QUEST.passengerInterceptAggroSeconds,
      demanded: true,
      shipCount: count,
      noFeeAggro: true,
    };
    this.messages.push(
      "Thought you'd hitch a ride unnoticed? I'll shred all of you!",
      "pirate",
    );
  }

  /**
   * ~10% chance to arm a passenger intercept when jumping away from a fare
   * destination (not on the final arrival jump to the dest POI).
   */
  private armPassengerInterceptIfNeeded(destPoiId: number): void {
    const fares = this.activeMissions.filter((m) => m.kind === "passenger");
    if (fares.length === 0) {
      this.pendingPassengerIntercept = null;
      return;
    }
    // Final arrival jump onto a fare destination POI — no intercept.
    if (fares.some((m) => m.destPoiId === destPoiId)) {
      this.pendingPassengerIntercept = null;
      return;
    }
    if (Math.random() >= QUEST.passengerInterceptChance) {
      this.pendingPassengerIntercept = null;
      return;
    }
    this.pendingPassengerIntercept = {
      passengers: occupiedPassengerBerths(this.activeMissions),
    };
  }

  private tickEnergyFlashes(dt: number): void {
    for (const flash of this.energyFlashes) flash.ttl -= dt;
    if (this.energyFlashes.length === 0) return;
    this.energyFlashes = this.energyFlashes.filter((flash) => flash.ttl > 0);
  }

  private energyDrawList(): { segments: BeamSegment[]; wide: boolean }[] {
    return [
      ...this.heldEnergy,
      ...this.energyFlashes.map((flash) => ({
        segments: flash.segments,
        wide: flash.wide,
      })),
    ];
  }

  /** Drop a held beam and start its restart cooldown. Safe to call every frame. */
  private releaseEnergyBeams(): void {
    if (this.beamingSlots.size === 0) {
      this.heldEnergy = [];
      return;
    }
    const slots = this.ship.loadout.slotsOfKind("weapon");
    for (const slot of slots) {
      if (!this.beamingSlots.has(slot.id)) continue;
      const weapon = slot.equipped;
      const cd = weapon && weapon.kind === "weapon" ? weapon.fireCooldown : 0;
      this.stopBeam(slot.id, cd);
    }
    this.beamingSlots.clear();
    this.heldEnergy = [];
  }

  private stopBeam(slotId: string, cooldown: number): void {
    this.beamingSlots.delete(slotId);
    this.weaponCooldowns.set(slotId, cooldown);
    this.clearBeamMarks(slotId);
  }

  /** Drop every target lock for one hardpoint. The next hold opens fresh. */
  private clearBeamMarks(slotId: string): void {
    const prefix = `${slotId}:`;
    for (const key of this.beamContact.keys()) {
      if (key.startsWith(prefix)) this.beamContact.delete(key);
    }
  }

  private updateBeams(dt: number): void {
    this.heldEnergy = [];
    if (this.dock.kind !== "free" || !this.ship.alive) {
      this.releaseEnergyBeams();
      return;
    }
    const slots = this.ship.loadout.slotsOfKind("weapon");
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i]!;
      const weapon = slot.equipped;
      if (!weapon || weapon.kind !== "weapon" || weapon.family !== "beam") {
        if (this.beamingSlots.has(slot.id)) this.stopBeam(slot.id, 0);
        continue;
      }
      const held = this.weaponTriggerHeld(i);
      const active = this.beamingSlots.has(slot.id);
      if (!held) {
        if (active) this.stopBeam(slot.id, weapon.fireCooldown);
        continue;
      }
      if (!active) {
        if ((this.weaponCooldowns.get(slot.id) ?? 0) > 0) continue;
        if (!this.ship.hasHeatRoom()) continue;
        this.ship.addHeat(weapon.heatCost ?? 0);
        this.clearBeamMarks(slot.id);
        this.beamingSlots.add(slot.id);
      }
      this.heldEnergy.push({
        segments: this.fireBeam(slot.id, weapon),
        wide: true,
      });
      if (this.ship.hasHeatRoom()) {
        this.ship.addHeat((weapon.heatPerSecond ?? 0) * dt);
      }
      if (!this.ship.hasHeatRoom()) this.stopBeam(slot.id, weapon.fireCooldown);
    }
  }

  private firePulse(weapon: WeaponModule): void {
    const targets = this.collectEnergyTargets();
    const segments = traceEnergyBeam({
      x: this.ship.x,
      y: this.ship.y,
      heading: this.ship.heading,
      range: weapon.range ?? 0,
      halfWidth: 0,
      falloff: 1,
      targets,
      stopAtFirst: true,
      onHit: (hit) => {
        const target = targets.find((entry) => entry.id === hit.id);
        if (target) this.applyEnergyHit(target, weapon.damage * hit.falloff, weapon);
        return { deflect: false, nose: 0 };
      },
    });
    this.energyFlashes.push({
      segments,
      wide: false,
      ttl: WEAPONS.pulse.flashSeconds,
    });
  }

  private fireBeam(slotId: string, weapon: WeaponModule): BeamSegment[] {
    const targets = this.collectEnergyTargets();
    return traceEnergyBeam({
      x: this.ship.x,
      y: this.ship.y,
      heading: this.ship.heading,
      range: weapon.range ?? WEAPONS.beam.range,
      halfWidth: WEAPONS.beam.halfWidth,
      falloff: WEAPONS.beam.falloff,
      targets,
      stopAtFirst: false,
      onHit: (hit) => {
        const target = targets.find((entry) => entry.id === hit.id);
        if (!target) return { deflect: false, nose: 0 };
        const listed = this.beamListedDamage(
          slotId,
          hit.id,
          weapon,
          hit.falloff,
        );
        const deflect =
          listed > 0
            ? this.applyEnergyHit(target, listed, weapon)
            : this.energyWouldBend(target);
        return { deflect, nose: target.heading };
      },
    });
  }

  /**
   * Opening hit the first time this activation damages the target, then
   * nothing until the mark interval passes. The next packet is the sustain
   * chunk. A gap in contact does not clear the mark. The mark is cleared
   * only when this hardpoint releases the beam.
   */
  private beamListedDamage(
    slotId: string,
    targetId: string,
    weapon: WeaponModule,
    falloff: number,
  ): number {
    const key = `${slotId}:${targetId}`;
    const step = nextBeamDamagePacket(
      this.beamContact.get(key),
      this.combatClock,
      weapon.timeOnTarget,
    );
    if (step.packet === "none") return 0;
    this.beamContact.set(key, step.mark);
    const listed =
      step.packet === "opening" ? weapon.damage : (weapon.chunkDamage ?? 0);
    return listed * falloff;
  }

  private collectEnergyTargets(): EnergyTarget[] {
    const list: EnergyTarget[] = [];
    const pushPirate = (pirate: Pirate, kind: EnergyTarget["kind"]) => {
      if (!pirate.alive) return;
      list.push({
        id: pirate.id,
        x: pirate.x,
        y: pirate.y,
        heading: pirate.heading,
        radius: pirate.radius,
        kind,
        pirate,
        patrol: null,
      });
    };
    for (const pirate of this.pirates) pushPirate(pirate, "pack");
    for (const pirate of this.distressPirates) pushPirate(pirate, "distress");
    if (this.baitPirate) pushPirate(this.baitPirate, "bait");
    for (const patrol of this.patrols) {
      if (!patrol.alive) continue;
      list.push({
        id: patrol.id,
        x: patrol.x,
        y: patrol.y,
        heading: patrol.heading,
        radius: patrol.radius,
        kind: "patrol",
        pirate: null,
        patrol,
      });
    }
    for (const patrol of this.distressRelief) {
      if (!patrol.alive) continue;
      list.push({
        id: patrol.id,
        x: patrol.x,
        y: patrol.y,
        heading: patrol.heading,
        radius: patrol.radius,
        kind: "patrol",
        pirate: null,
        patrol,
      });
    }
    return list;
  }

  /** Shields down and plating still up — a beam hit on this hull would bend. */
  private energyWouldBend(target: EnergyTarget): boolean {
    if (target.pirate) {
      return target.pirate.shield <= 0 && target.pirate.plating > 0;
    }
    if (target.patrol) {
      return target.patrol.shield <= 0 && target.patrol.plating > 0;
    }
    return false;
  }

  /**
   * Apply one energy hit and the same blame as a player projectile.
   * Returns true when the hit landed on hull plating (the beam bends).
   */
  private applyEnergyHit(
    target: EnergyTarget,
    amount: number,
    weapon: WeaponModule,
  ): boolean {
    if (amount <= 0) return false;
    const plating = weapon.platingMultiplier ?? 1;
    if (target.pirate) {
      const layer = target.pirate.takeDamage(
        amount,
        weapon.shieldMultiplier,
        true,
        plating,
      );
      if (target.kind === "pack" && this.pack) this.makePackHostile();
      if (
        target.kind === "distress" &&
        this.distressPack &&
        this.distressPack.phase === "comms"
      ) {
        this.distressPack.phase = "hostile";
        this.distressPack.timer = 0;
        for (const ship of this.distressPirates) {
          if (ship.alive) ship.goAggro();
        }
      }
      if (
        target.kind === "bait" &&
        this.baitPack &&
        this.baitPack.phase === "comms"
      ) {
        this.baitPack.phase = "hostile";
        this.baitPack.timer = 0;
        target.pirate.goAggro();
      }
      return layer === "plating";
    }
    if (target.patrol) {
      const layer = target.patrol.takeDamage(
        amount,
        weapon.shieldMultiplier,
        plating,
      );
      // Distress relief is not station law — player fire does not
      // turn them onto the ship or sour a station.
      if (this.distressRelief.includes(target.patrol)) {
        return layer === "plating";
      }
      if (!target.patrol.alive && !this.distressRelief.includes(target.patrol)) {
        this.notePatrolDestroyed(
          target.patrol.stationKey,
          target.patrol.stationName,
        );
      }
      if (!target.patrol.defending) {
        this.forceStationHostile(
          target.patrol.stationKey,
          target.patrol.stationName,
          `${target.patrol.stationName} patrol: Under attack — you are now Hostile.`,
        );
      }
      target.patrol.markDefending();
      this.patrolMenu.hide();
      return layer === "plating";
    }
    return false;
  }

  /**
   * Each weapon slot listens to its own input.
   * 0 Space, 1 left click, 2 right click.
   * Holding one input does not fire the other slots.
   * Beams are held in `updateBeams` — this path is shots and pulses.
   */
  private firePlayerWeapons(): void {
    if (this.dock.kind !== "free" || !this.ship.alive) return;
    const slots = this.ship.loadout.slotsOfKind("weapon");
    for (let i = 0; i < slots.length; i += 1) {
      if (!this.weaponTriggerHeld(i)) continue;
      const slot = slots[i]!;
      const weapon = slot.equipped;
      if (!weapon || weapon.kind !== "weapon") continue;
      if (weapon.family === "beam") continue;
      if ((this.weaponCooldowns.get(slot.id) ?? 0) > 0) continue;
      if (!this.ship.loadout.canFireSlot(slot.id)) continue;
      this.fireWeaponSlot(slot.id, weapon);
    }
  }

  /**
   * True while a click would be UI, not a shot. Read at pointerdown so the
   * press that closes a menu stays latched until the button is released.
   */
  private pointerUiOpen(): boolean {
    return (
      this.phase !== "playing" ||
      this.chartOpen ||
      this.panelOpen ||
      this.shipMenuOpen ||
      this.marketMenuOpen ||
      this.missionBoardOpen ||
      this.hangarMenuOpen ||
      this.stationMenu.open ||
      this.pirateMenu.open ||
      this.patrolMenu.open ||
      this.dock.kind === "docked" ||
      this.fuelWarnTravel !== null
    );
  }

  /**
   * Latch holds before a shot sets the next cooldown.
   * A key that goes down on an open window stays armed through the wait.
   * A key that goes down while cooling stays unarmed until the window opens.
   */
  private latchWeaponHolds(): void {
    const slots = this.ship.loadout.slotsOfKind("weapon");
    const next = new Set<string>();
    for (let i = 0; i < slots.length && i < WEAPON_HUD_INPUTS.length; i += 1) {
      const slot = slots[i];
      const weapon = slot?.equipped;
      if (!slot || !weapon || weapon.kind !== "weapon") continue;
      const ammo = this.ship.loadout.ammoIn(slot.id);
      const energy = weaponRowIsEnergy({
        input: "",
        name: "",
        family: weapon.family,
        ammoMax: weapon.ammoMax,
        ammo,
        held: false,
        holdArmed: false,
        cooldown: 0,
      });
      const heatBlocked =
        energy &&
        this.ship.heatSinkCapacity > 0 &&
        this.ship.heat >= this.ship.heatSinkCapacity;
      const canFire = (energy || ammo > 0) && !heatBlocked;
      const armed = weaponHoldArmedNext({
        held: this.weaponTriggerHeld(i),
        armed: this.weaponHoldArmed.has(slot.id),
        cooldown: Math.max(0, this.weaponCooldowns.get(slot.id) ?? 0),
        canFire,
      });
      if (armed) next.add(slot.id);
    }
    this.weaponHoldArmed = next;
  }

  /**
   * Three HUD columns: left click, Space, right click.
   * An empty or missing hardpoint is null. The HUD still draws that key.
   */
  private weaponHudRows(): (WeaponHudRow | null)[] {
    const slots = this.ship.loadout.slotsOfKind("weapon");
    const columnSlot = [1, 0, 2];
    return columnSlot.map((slotIndex, column) => {
      const slot = slots[slotIndex];
      const weapon = slot?.equipped;
      if (!slot || !weapon || weapon.kind !== "weapon") return null;
      return {
        input: WEAPON_HUD_INPUTS[column] ?? "SPACE",
        name: weaponCompleteName(weapon.name, weapon.tier),
        family: weapon.family,
        ammoMax: weapon.ammoMax,
        ammo: this.ship.loadout.ammoIn(slot.id),
        held: this.weaponTriggerHeld(slotIndex),
        holdArmed: this.weaponHoldArmed.has(slot.id),
        cooldown: Math.max(0, this.weaponCooldowns.get(slot.id) ?? 0),
      };
    });
  }

  private weaponTriggerHeld(index: number): boolean {
    if (index === 0) return this.keyboard.state.fire;
    const mouseBlocked =
      this.stationMenu.open || this.pirateMenu.open || this.patrolMenu.open;
    if (mouseBlocked) return false;
    if (index === 1) return this.pointer.fireLeft;
    if (index === 2) return this.pointer.fireRight;
    return false;
  }

  private fireWeaponSlot(slotId: string, weapon: WeaponModule): void {
    const muzzle = this.ship.hull.size;
    if (weapon.family === "gun") {
      const ammo = this.ship.loadout.ammoIn(slotId);
      if (ammo < 1) return;
      // One round. The cone is recoil: each shot lands somewhere inside it.
      const offset = (Math.random() * 2 - 1) * weapon.spread;
      this.projectiles.push(
        spawnPlayerShot(
          this.ship.x,
          this.ship.y,
          this.ship.heading + offset,
          muzzle,
          {
            family: "gun",
            speed: weapon.speed,
            radius: WEAPONS.gun.pelletRadius,
            damage: 0,
            shieldMultiplier: weapon.shieldMultiplier,
            gunSlotId: slotId,
            gunChunkDamage: weapon.damage,
            gunChunkInterval: weapon.timeOnTarget,
          },
        ),
      );
      this.ship.loadout.consumeSlotAmmo(slotId, 1);
    } else if (weapon.family === "cannon") {
      this.projectiles.push(
        spawnPlayerShot(this.ship.x, this.ship.y, this.ship.heading, muzzle, {
          family: "cannon",
          speed: weapon.speed,
          radius: WEAPONS.cannon.slugRadius,
          damage: weapon.damage,
          shieldMultiplier: weapon.shieldMultiplier,
        }),
      );
      this.ship.loadout.consumeSlotAmmo(slotId, 1);
    } else if (weapon.family === "pulse") {
      if (!this.ship.hasHeatRoom()) return;
      this.ship.addHeat(weapon.heatCost ?? 0);
      this.firePulse(weapon);
    } else if (weapon.family === "missile") {
      const lock = this.missileAimPoint();
      this.projectiles.push(
        spawnPlayerShot(this.ship.x, this.ship.y, this.ship.heading, muzzle, {
          family: "missile",
          speed: weapon.speed,
          radius: WEAPONS.missile.radius,
          damage: weapon.damage,
          shieldMultiplier: weapon.shieldMultiplier,
          turnRate: weapon.trackingTurn,
          trackSeconds: weapon.trackSeconds,
          lockId: lock?.id ?? null,
        }),
      );
      this.ship.loadout.consumeSlotAmmo(slotId, 1);
    }
    this.weaponCooldowns.set(slotId, weapon.fireCooldown);
  }

  /** Nearest living combatant to the cursor. Captured onto a missile at launch. */
  private missileAimPoint(): { id: string; x: number; y: number } | null {
    if (!this.ship.loadout.weapons().some((w) => w.family === "missile")) {
      return null;
    }
    const world = this.camera.screenToWorld(
      this.pointer.x,
      this.pointer.y,
      window.innerWidth,
      window.innerHeight,
    );
    let best: { id: string; x: number; y: number } | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const target of this.lockableTargets()) {
      if (!target.alive) continue;
      const d = Math.hypot(target.x - world.x, target.y - world.y);
      if (d < bestD) {
        bestD = d;
        best = target;
      }
    }
    return best;
  }

  private missileReticle(): { x: number; y: number } | null {
    if (this.phase !== "playing" || this.menuOpen() || this.dock.kind === "docked") {
      return null;
    }
    const aim = this.missileAimPoint();
    return aim ? { x: aim.x, y: aim.y } : null;
  }

  private lockableTargets(): Array<{
    id: string;
    x: number;
    y: number;
    alive: boolean;
  }> {
    const list: Array<{ id: string; x: number; y: number; alive: boolean }> = [];
    for (const pirate of this.pirates) list.push(pirate);
    for (const pirate of this.distressPirates) list.push(pirate);
    if (this.baitPirate) list.push(this.baitPirate);
    for (const patrol of this.patrols) list.push(patrol);
    for (const patrol of this.distressRelief) list.push(patrol);
    return list;
  }

  private lockPoint(id: string): { x: number; y: number } | null {
    if (id === PLAYER_LOCK_ID && this.ship.alive) {
      return { x: this.ship.x, y: this.ship.y };
    }
    for (const target of this.lockableTargets()) {
      if (target.id === id && target.alive) return target;
    }
    return null;
  }

  /**
   * Contact test. Gun pellets never deal their own damage — they extend the
   * stream timer and return a chunk only when time-on-target is met.
   * A broken gap resets that timer.
   */
  private shotImpact(
    p: Projectile,
    target: { id: string; x: number; y: number; radius: number; alive: boolean },
  ): { amount: number; shieldMultiplier: number } | null {
    if (!target.alive) return null;
    const dist = Math.hypot(p.x - target.x, p.y - target.y);
    if (dist > target.radius + p.radius) return null;
    if (p.family === "gun") {
      const chunks = this.accrueGunStream(
        p.gunSlotId,
        target.id,
        p.gunChunkInterval,
      );
      return {
        amount: chunks * p.gunChunkDamage,
        shieldMultiplier: p.shieldMultiplier,
      };
    }
    return { amount: p.damage, shieldMultiplier: p.shieldMultiplier };
  }

  private accrueGunStream(
    slotId: string,
    targetId: string,
    interval: number,
  ): number {
    if (interval <= 0) return 0;
    const key = `${slotId}:${targetId}`;
    const now = this.combatClock;
    const prev = this.gunStreams.get(key);
    if (!prev || now - prev.lastHit > WEAPONS.gunStreamBreakGap) {
      this.gunStreams.set(key, { accumulated: 0, lastHit: now });
      return 0;
    }
    const accumulated = prev.accumulated + (now - prev.lastHit);
    if (accumulated + 1e-6 >= interval) {
      this.gunStreams.set(key, {
        accumulated: Math.max(0, accumulated - interval),
        lastHit: now,
      });
      return 1;
    }
    this.gunStreams.set(key, { accumulated, lastHit: now });
    return 0;
  }

  private updateCombat(dt: number): void {
    this.combatClock += dt;
    for (const [id, cd] of this.weaponCooldowns) {
      if (cd > 0) this.weaponCooldowns.set(id, cd - dt);
    }
    this.latchWeaponHolds();
    this.updatePirateIntrusion(dt);
    this.firePlayerWeapons();
    this.updateBeams(dt);

    const pirateShots: Projectile[] = [];
    const justDemanded = this.updatePackEncounter(dt);
    if (justDemanded && this.pack) {
      const fee = this.pack.fee;
      const label =
        this.pack.shipCount > 1
          ? `Pirate pack demands ${fee} credits for safe passage — you have one minute.`
          : `Pirate: Pay ${fee} credits for safe passage — you have one minute.`;
      this.messages.push(label, "pirate");
    }

    const imperialPatrols = [...this.patrols, ...this.distressRelief];
    const hostile = this.pack?.phase === "hostile";
    for (const pirate of this.pirates) {
      pirate.update(
        dt,
        this.ship.x,
        this.ship.y,
        pirateShots,
        hostile === true,
        PLAYER_LOCK_ID,
        imperialPatrols,
      );
    }
    const distressHostile = this.distressPack?.phase === "hostile";
    for (const pirate of this.distressPirates) {
      pirate.update(
        dt,
        this.ship.x,
        this.ship.y,
        pirateShots,
        distressHostile === true,
        PLAYER_LOCK_ID,
        imperialPatrols,
      );
    }
    if (this.baitPirate?.alive) {
      this.baitPirate.update(
        dt,
        this.ship.x,
        this.ship.y,
        pirateShots,
        this.baitPack?.phase === "hostile",
        PLAYER_LOCK_ID,
        imperialPatrols,
      );
    }
    if (pirateShots.length > 0) {
      this.projectiles.push(...pirateShots);
    }

    const patrolShots: Projectile[] = [];
    const pirateThreats = this.localPirateThreats();
    for (const patrol of this.patrols) {
      const law = this.patrolLawFor(patrol.stationKey);
      const edge = patrol.update(
        dt,
        pirateThreats,
        this.ship.x,
        this.ship.y,
        patrolShots,
        law,
      );
      if (edge.justStartedScan) {
        this.scanCaught.set(patrol.stationKey, new Map());
        this.messages.push(
          `${patrol.stationName} patrol: Scanning your hold for illegal cargo — stand by (~${PATROL.scanSeconds}s).`,
          "station",
        );
      }
      if (edge.justCompletedScan) {
        this.resolvePatrolScan(patrol);
      }
      if (edge.justWarned) {
        const hasDebt = this.scanDebt.has(patrol.stationKey);
        // Comms only — Settle / fine UI opens on patrol click or station hail.
        this.messages.push(
          hasDebt
            ? `${patrol.stationName} patrol: Illegal cargo confirmed. Click us or hail the station to settle (hand over remaining + fee) — you have one minute.`
            : `${patrol.stationName} patrol: You are not exempt from violations. Click us or hail the station to settle — you have one minute.`,
          "station",
        );
      }
      if (edge.justAggroed) {
        // Ignoring the Violation window → same as attacking: force Hostile.
        this.forceStationHostile(
          patrol.stationKey,
          patrol.stationName,
          `${patrol.stationName} patrol: Window expired — you are now Hostile. Weapons free.`,
        );
        this.patrolMenu.hide();
      }
    }
    if (patrolShots.length > 0) {
      this.projectiles.push(...patrolShots);
    }

    const reliefShots: Projectile[] = [];
    for (const patrol of this.distressRelief) {
      patrol.engagePirates(dt, pirateThreats, reliefShots);
    }
    if (reliefShots.length > 0) {
      this.projectiles.push(...reliefShots);
    }

    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const p = this.projectiles[i]!;
      p.update(dt, (id) => this.lockPoint(id));

      if (p.isOffScreen(this.camera.x, this.camera.y, viewW, viewH)) {
        this.projectiles.splice(i, 1);
        continue;
      }

      if (p.hostile) {
        if (this.ship.alive) {
          const impact = this.shotImpact(p, {
            id: PLAYER_LOCK_ID,
            x: this.ship.x,
            y: this.ship.y,
            radius: COMBAT.playerHitRadius,
            alive: true,
          });
          if (impact) {
            if (impact.amount > 0) {
              this.ship.takeDamage(impact.amount, impact.shieldMultiplier);
            }
            this.projectiles.splice(i, 1);
          }
        }
        continue;
      }

      // Pirate defense fire at Imperial hulls. Not hostile, so it cannot hit
      // the player, blame them, or break a paid truce. It does not sour a station.
      if (p.source === "pirate") {
        let patrolHit = false;
        for (const group of [this.patrols, this.distressRelief]) {
          if (patrolHit) break;
          for (const patrol of group) {
            const impact = this.shotImpact(p, patrol);
            if (!impact) continue;
            if (impact.amount > 0) {
              patrol.takeDamage(impact.amount, impact.shieldMultiplier);
            }
            patrolHit = true;
            break;
          }
        }
        if (patrolHit) this.projectiles.splice(i, 1);
        continue;
      }

      // Player shots blame the player. Patrol shots damage pirate hulls only —
      // a paid truce stays with the player, and the station is not marked Hostile.
      const fromPlayer = p.source === "player";
      const retaliate = fromPlayer;
      let hit = false;
      for (const pirate of this.pirates) {
        const impact = this.shotImpact(p, pirate);
        if (!impact) continue;
        pirate.takeDamage(impact.amount, impact.shieldMultiplier, retaliate);
        // Sneak attack, or fire after tribute — one pack fight.
        if (fromPlayer && this.pack) {
          this.makePackHostile();
        }
        hit = true;
        break;
      }
      if (!hit) {
        for (const pirate of this.distressPirates) {
          const impact = this.shotImpact(p, pirate);
          if (!impact) continue;
          pirate.takeDamage(impact.amount, impact.shieldMultiplier, retaliate);
          if (
            fromPlayer &&
            this.distressPack &&
            this.distressPack.phase === "comms"
          ) {
            this.distressPack.phase = "hostile";
            this.distressPack.timer = 0;
            for (const d of this.distressPirates) {
              if (d.alive) d.goAggro();
            }
          }
          hit = true;
          break;
        }
      }
      if (!hit && this.baitPirate) {
        const pirate = this.baitPirate;
        const impact = this.shotImpact(p, pirate);
        if (impact) {
          pirate.takeDamage(impact.amount, impact.shieldMultiplier, retaliate);
          if (fromPlayer && this.baitPack && this.baitPack.phase === "comms") {
            this.baitPack.phase = "hostile";
            this.baitPack.timer = 0;
            pirate.goAggro();
          }
          hit = true;
        }
      }
      if (!hit && fromPlayer) {
        for (const patrol of this.patrols) {
          const impact = this.shotImpact(p, patrol);
          if (!impact) continue;
          if (impact.amount > 0) {
            patrol.takeDamage(impact.amount, impact.shieldMultiplier);
          }
          if (!patrol.alive) {
            this.notePatrolDestroyed(patrol.stationKey, patrol.stationName);
          }
          // First hit only — under-attack / Hostile comms once per combat.
          if (!patrol.defending) {
            this.forceStationHostile(
              patrol.stationKey,
              patrol.stationName,
              `${patrol.stationName} patrol: Under attack — you are now Hostile.`,
            );
          }
          patrol.markDefending();
          this.patrolMenu.hide();
          hit = true;
          break;
        }
      }
      if (!hit && fromPlayer) {
        for (const patrol of this.distressRelief) {
          const impact = this.shotImpact(p, patrol);
          if (!impact) continue;
          if (impact.amount > 0) {
            patrol.takeDamage(impact.amount, impact.shieldMultiplier);
          }
          hit = true;
          break;
        }
      }
      if (hit) this.projectiles.splice(i, 1);
    }

    const dying = this.pirates.filter((p) => !p.alive);
    if (dying.length > 0) {
      const survivors = this.pirates.filter((p) => p.alive).length;
      let anyKill = false;
      for (const pirate of dying) {
        const killed = pirate.health <= 0;
        if (killed) {
          this.pendingPirateKills += 1;
          anyKill = true;
          const next = this.reputation.adjust(
            PIRATE_FACTION_ID,
            REPUTATION.pirateKill,
          );
          this.pushRepChange("Pirates", next, REPUTATION.pirateKill);
        }
      }
      // One summary for the batch; clear the encounter only when empty.
      this.onPirateRemoved(anyKill, survivors);
    }
    this.pirates = this.pirates.filter((p) => p.alive);
    if (this.pirates.length === 0) {
      this.pack = null;
      this.pirateMenu.hide();
    }

    const distressDying = this.distressPirates.filter((p) => !p.alive);
    if (distressDying.length > 0) {
      for (const pirate of distressDying) {
        if (pirate.health <= 0) {
          this.pendingPirateKills += 1;
          const next = this.reputation.adjust(
            PIRATE_FACTION_ID,
            REPUTATION.pirateKill,
          );
          this.pushRepChange("Pirates", next, REPUTATION.pirateKill);
        }
      }
    }
    this.distressPirates = this.distressPirates.filter((p) => p.alive);
    if (this.distressPending && this.distressPack && this.distressPirates.length === 0) {
      this.distressPack = null;
      this.distressImperialTimer = null;
      // Pack is gone (destroyed or fled, including by a patrol). Scoot a Fuel
      // Rat in on the same assist path as a rat distress response. No second
      // broadcast and no response delay — the player is already stranded.
      if (!this.fuelRat) this.spawnFuelRat();
    }

    if (this.baitPirate && !this.baitPirate.alive) {
      if (this.baitPirate.health <= 0) {
        this.pendingPirateKills += 1;
        const next = this.reputation.adjust(
          PIRATE_FACTION_ID,
          REPUTATION.pirateKill,
        );
        this.pushRepChange("Pirates", next, REPUTATION.pirateKill);
      }
      this.baitPirate = null;
      this.baitPack = null;
      // Bait kill/flee voids the Fuel Rat contract — no credits, no Fuel Rat rep.
      this.completeDistressAnswerMission(false);
    }

    for (const patrol of this.patrols) {
      if (patrol.alive) continue;
      this.messages.push(
        `${patrol.stationName} patrol destroyed.`,
        "station",
      );
    }
    this.patrols = this.patrols.filter((p) => p.alive);

    for (const patrol of this.distressRelief) {
      if (patrol.alive) continue;
      this.messages.push("Imperial patrol destroyed.", "station");
    }
    this.distressRelief = this.distressRelief.filter((p) => p.alive);
  }

  /** Map host-station standing → how patrols treat the player. */
  private patrolLawFor(stationKey: string): PatrolPlayerLaw {
    const band = standingBand(this.reputation.stationStanding(stationKey));
    if (band === "hostile") return "aggro";
    if (band === "violation") return "warn";
    return "ignore";
  }

  /**
   * Force Hostile (attack patrol or expire Violation window).
   * Clears scan debt — unredeemable.
   */
  private forceStationHostile(
    stationKey: string,
    stationName: string,
    message: string,
  ): void {
    const before = this.reputation.stationStanding(stationKey);
    const next = this.reputation.markHostile(stationKey, stationName);
    this.scanDebt.clear(stationKey);
    this.scanCaught.delete(stationKey);
    this.messages.push(message, "station");
    if (before > REPUTATION.hostileAtOrBelow) {
      this.pushRepChange(stationName, next, next - before);
    }
  }

  /**
   * Resolve a completed illegal-cargo scan.
   * Clean / eject-all-uncaught → nothing. Positive → knownIllegalDebt + Violation.
   */
  private resolvePatrolScan(patrol: StationPatrol): void {
    const observed = new Map<string, IllegalDebtLine>();
    const aboard = illegalCargoByCommodity(this.ship.cargo);
    for (const [id, row] of aboard) {
      addObservedIllegal(observed, id, row.cu, row.name);
    }
    const caught = this.scanCaught.get(patrol.stationKey);
    if (caught) {
      for (const line of caught.values()) {
        addObservedIllegal(observed, line.commodityId, line.cu, line.name);
      }
    }
    this.scanCaught.delete(patrol.stationKey);

    const lines = [...observed.values()].filter((l) => l.cu > 0);
    if (lines.length === 0) {
      this.messages.push(
        `${patrol.stationName} patrol: Scan clear — no illegal cargo on record.`,
        "station",
      );
      return;
    }

    const debt = this.scanDebt.record(
      patrol.stationKey,
      patrol.stationName,
      lines,
    );
    if (!debt) return;

    const totalCu = debt.lines.reduce((n, l) => n + l.cu, 0);
    const before = this.reputation.stationStanding(patrol.stationKey);
    const band = standingBand(before);
    // Positive scan forces Violation (unless already Hostile).
    if (band !== "hostile") {
      const next = this.reputation.setStanding(
        patrol.stationKey,
        REPUTATION.scanViolationStanding,
        patrol.stationName,
      );
      this.pushRepChange(patrol.stationName, next, next - before);
    }

    this.messages.push(
      `${patrol.stationName} patrol: Illegal cargo found (${totalCu} CU). Settle the debt — turn in remaining + fee for any shortfall.`,
      "station",
    );
  }

  private updateGalaxyMenu(): void {
    if (!this.pointer.consumeClick()) return;
    const jumpRange = this.ship.jumpRange();
    const hints = this.chartHints();
    const result = this.chart.handleClick(
      this.galaxy,
      this.local.poiId,
      this.pointer.x,
      this.pointer.y,
      jumpRange,
      hints,
      !this.ship.jumpHeatFits(),
    );
    if (result === "close") {
      this.chartOpen = false;
      this.chart.selectedId = null;
    } else if (result === "jump" && this.chart.selectedId !== null) {
      this.beginTravel({ kind: "galaxy", poiId: this.chart.selectedId });
    }
  }

  private openShipView(): void {
    this.chartOpen = false;
    this.panelOpen = false;
    this.stationMenu.hide();
    this.pirateMenu.hide();
    this.patrolMenu.hide();
    this.marketMenuOpen = false;
    this.marketMenu.hide();
    this.missionBoardOpen = false;
    this.missionBoard.hide();
    this.hangarMenuOpen = false;
    this.hangarMenu.hide();
    const docked =
      this.dock.kind === "docked" ? this.dock.station : null;
    if (docked) {
      this.dockedMenu.hide();
    }
    this.shipMenu.openView(this.reputationListingForUi());
    this.shipMenuOpen = true;
  }

  private openBay(station: Landmark): void {
    const key =
      this.currentStationKey(station) ??
      `visit:${this.local.poiId}:${station.id}`;
    if (!stationHasMenu(key, "bay")) {
      this.messages.push("No outfit bay at this dock.", "station");
      return;
    }
    const context = this.stationStockContext();
    this.dockedMenu.hide();
    this.marketMenuOpen = false;
    this.marketMenu.hide();
    this.missionBoardOpen = false;
    this.missionBoard.hide();
    this.hangarMenuOpen = false;
    this.hangarMenu.hide();
    const discount = this.reputation.bayDiscountFraction(key);
    const stock = stationBayStock(key, context);
    this.shipMenu.openBay(
      stock,
      stationBayWealth(key, context),
      discount,
      this.reputationListingForUi(),
    );
    this.shipMenuOpen = true;
  }

  /** POI / host flavor used to gate bay module tiers. */
  private stationStockContext(): StationStockContext {
    let hostKind: HostKind = "rocky";
    if (this.local.bodyId !== null && this.local.systemBodies) {
      const body = this.local.systemBodies.find(
        (b) => b.id === this.local.bodyId,
      );
      if (body) hostKind = body.kind;
    } else if (this.local.focus.kind !== "station" && this.local.focus.kind !== "debris") {
      hostKind = this.local.focus.kind;
    }
    return {
      poiType: this.local.poiType,
      hostKind,
      starClass: this.local.starClass,
    };
  }


  private openHangar(station: Landmark): void {
    const key =
      this.currentStationKey(station) ??
      `visit:${this.local.poiId}:${station.id}`;
    if (!stationHasMenu(key, "hangar")) {
      this.messages.push("No hangar berths at this dock.", "station");
      return;
    }
    this.ship.stashActiveToFleet();
    this.dockedMenu.hide();
    this.shipMenuOpen = false;
    this.shipMenu.openView();
    this.marketMenuOpen = false;
    this.marketMenu.hide();
    this.missionBoardOpen = false;
    this.missionBoard.hide();
    this.hangarMenu.show(station.name);
    this.hangarMenuOpen = true;
  }

  private closeHangarMenu(): void {
    this.hangarMenuOpen = false;
    this.hangarMenu.hide();
    if (this.dock.kind === "docked") {
      this.showDockedUi(this.dock.station);
    }
  }

  private updateHangarMenu(): void {
    if (!this.pointer.consumeClick()) return;
    const result = this.hangarMenu.handleClick(
      this.ship.fleet,
      this.ship.credits,
      this.pointer.x,
      this.pointer.y,
    );
    if (result === "close") {
      this.closeHangarMenu();
      return;
    }
    if (!result || typeof result !== "object") return;

    if (result.action === "board") {
      if (result.instanceId !== this.ship.fleet.activeInstanceId) {
        const next = this.ship.fleet.get(result.instanceId);
        const cap = next
          ? next.loadout
              .utilities()
              .reduce((n, u) => n + u.passengerCapacity, 0)
          : 0;
        if (next && this.refuseIfBerthsTooSmall(cap)) return;
      }
      if (this.ship.boardOwned(result.instanceId)) {
        this.messages.push(
          `Hangar: Boarded ${this.ship.hull.name}.`,
          "station",
        );
      }
      return;
    }

    if (result.action === "buy") {
      const hull = hullById(result.hullId);
      if (!hull) return;
      const willBoard =
        !this.ship.fleet.ownsHullType(hull.id) &&
        this.ship.credits >= hull.price;
      if (
        willBoard &&
        this.refuseIfBerthsTooSmall(factoryPassengerCapacity(hull))
      ) {
        return;
      }
      const status = this.ship.buyHull(hull, true);
      if (status === "credits") {
        this.messages.push(
          `Hangar: Need ${hull.price} cr for ${hull.name}.`,
          "station",
        );
        return;
      }
      if (status === "owned") {
        this.messages.push(`Hangar: You already own a ${hull.name}.`, "station");
        return;
      }
      if (status === "ok") {
        this.messages.push(
          `Hangar: Purchased ${hull.name} (−${hull.price} cr). Now active.`,
          "station",
        );
      }
    }
  }

  private openMarket(station: Landmark): void {
    const key =
      this.currentStationKey(station) ??
      `visit:${this.local.poiId}:${station.id}`;
    if (!stationHasMenu(key, "market")) {
      this.messages.push("No commodity market at this dock.", "station");
      return;
    }
    if (!this.dockMarket) {
      this.dockMarket = createStationMarket(key, this.marketContext());
    }
    this.dockedMenu.hide();
    this.shipMenuOpen = false;
    this.shipMenu.openView();
    this.missionBoardOpen = false;
    this.missionBoard.hide();
    this.hangarMenuOpen = false;
    this.hangarMenu.hide();
    this.marketMenuKind = "legal";
    this.marketMenu.show(station.name, this.dockMarket, "Market");
    this.marketMenuOpen = true;
  }

  private openBlackMarket(station: Landmark): void {
    const key =
      this.currentStationKey(station) ??
      `visit:${this.local.poiId}:${station.id}`;
    if (!stationOffersBlackMarket(key)) {
      this.messages.push("No black market contact at this dock.", "station");
      return;
    }
    if (!this.dockBlackMarket) {
      this.dockBlackMarket = createBlackMarket(key, this.marketContext());
    }
    this.dockedMenu.hide();
    this.shipMenuOpen = false;
    this.shipMenu.openView();
    this.missionBoardOpen = false;
    this.missionBoard.hide();
    this.hangarMenuOpen = false;
    this.hangarMenu.hide();
    this.marketMenuKind = "black";
    this.marketMenu.show(station.name, this.dockBlackMarket, "Black Market");
    this.marketMenuOpen = true;
    this.ensureMissionBoardReplenished(station);
    this.refreshBlackMarketJobs();
  }

  private refreshBlackMarketJobs(): void {
    if (!this.marketMenuOpen || this.marketMenuKind !== "black") return;
    this.marketMenu.setRebelJobs(
      this.visibleRebelOffers(),
      this.missionsForBoardUi().filter((m) => isRebelMissionKind(m.kind)),
      {
        rebelSlotFree: this.rebelMissionCount() < QUEST.maxRebelActive,
        coverSlotFree: this.coverSlotsFree() >= 1,
        hasScoop: this.ship.loadout.scoopRange > 0,
        hasScanner: this.hasSurveyScanner(),
      },
    );
  }

  private closeMarketMenu(): void {
    this.marketMenuOpen = false;
    this.marketMenu.hide();
    this.marketMenuKind = "legal";
    if (this.dock.kind === "docked") {
      this.showDockedUi(this.dock.station);
    }
  }

  private updateMarketMenu(): void {
    if (!this.pointer.consumeClick()) return;
    const result = this.marketMenu.handleClick(
      this.ship.cargo,
      this.ship.credits,
      this.pointer.x,
      this.pointer.y,
    );
    if (result === "close") {
      this.closeMarketMenu();
      return;
    }
    if (!result || typeof result !== "object") return;
    if (result.action === "acceptMission") {
      this.acceptBoardMission(result.missionId);
      return;
    }
    if (result.action === "claimMission") {
      this.claimBoardMission(result.missionId);
      return;
    }

    const book =
      this.marketMenuKind === "black" ? this.dockBlackMarket : this.dockMarket;
    const label = this.marketMenuKind === "black" ? "Black Market" : "Market";
    const listing = book?.listing(result.commodityId);
    if (!listing) return;

    if (result.action === "buy") {
      if (listing.playerBuyPrice === null) return;
      // Sensitive Derelict Cargo is sell-only (Rebels fence kickoff).
      if (listing.commodityId === ABANDONED_DERELICT_CARGO_ID) {
        this.messages.push(`${label}: That lot is fence-only — not for sale.`, "station");
        return;
      }
      const cost = listing.playerBuyPrice * result.cu;
      if (result.cu > listing.stock) {
        this.messages.push(`${label}: Not enough stock.`, "station");
        return;
      }
      if (!this.ship.cargo.canStow(result.cu)) {
        this.messages.push(`${label}: Not enough cargo space.`, "station");
        return;
      }
      if (!this.ship.spendCredits(cost)) {
        this.messages.push(`${label}: Insufficient credits.`, "station");
        return;
      }
      if (
        !this.ship.cargo.stow({
          id: listing.commodityId,
          name: listing.name,
          cu: result.cu,
        })
      ) {
        this.ship.addCredits(cost);
        this.messages.push(`${label}: Cargo stow failed.`, "station");
        return;
      }
      listing.stock -= result.cu;
      this.messages.push(
        `${label}: Bought ${result.cu} CU ${listing.name} (−${cost} cr).`,
        "station",
      );
      return;
    }

    if (result.action === "sell") {
      if (listing.playerSellPrice === null) return;
      if (result.cu > listing.demand) {
        this.messages.push(`${label}: Demand filled.`, "station");
        return;
      }
      // Fence stolen lots first, then ordinary hold of the same commodity.
      const stolenId = stolenCargoId(listing.commodityId);
      let left = result.cu;
      left -= this.ship.cargo.remove(stolenId, left);
      if (left > 0) left -= this.ship.cargo.remove(listing.commodityId, left);
      const removed = result.cu - left;
      if (removed <= 0) {
        this.messages.push(`${label}: You are not carrying that.`, "station");
        return;
      }
      const payout = listing.playerSellPrice * removed;
      this.ship.addCredits(payout);
      listing.demand -= removed;
      this.messages.push(
        `${label}: Sold ${removed} CU ${listing.name} (+${payout} cr).`,
        "station",
      );

      // Sensitive Derelict Cargo fence → reveal Rebels + tunable standing.
      if (
        this.marketMenuKind === "black" &&
        listing.commodityId === ABANDONED_DERELICT_CARGO_ID
      ) {
        const delta = REPUTATION.rebelsSellDerelictCargo * removed;
        const next = this.reputation.adjust(REBELS_FACTION_ID, delta);
        this.pushRepChange("Rebels", next, delta);
        if (this.dock.kind === "docked") {
          this.ensureMissionBoardReplenished(this.dock.station);
          this.refreshBlackMarketJobs();
        }
      }
    }
  }

  /** Close without restoring docked UI (e.g. opening another full-screen menu). */
  private closeShipMenuUi(): void {
    this.shipMenuOpen = false;
    this.shipMenu.openView();
  }

  private closeShipMenu(): void {
    const dockedStation =
      this.dock.kind === "docked" ? this.dock.station : null;
    this.closeShipMenuUi();
    if (dockedStation) {
      this.showDockedUi(dockedStation);
    }
  }

  /**
   * Rebind two weapon hardpoints. The hull's slot count does not change.
   * Ammo stays with each module. The slot's input binding does not.
   */
  private trySwapWeaponSlots(slotId: string, otherSlotId: string): void {
    const slots = this.ship.loadout.slots;
    const a = slots.find((s) => s.id === slotId);
    const b = slots.find((s) => s.id === otherSlotId);
    if (!a || !b || a.kind !== "weapon" || b.kind !== "weapon") return;
    const aName = a.equipped ? moduleStockLabel(a.equipped) : null;
    const bName = b.equipped ? moduleStockLabel(b.equipped) : null;
    if (!this.ship.loadout.swapWeaponModules(slotId, otherSlotId)) return;
    const coolA = this.weaponCooldowns.get(slotId) ?? 0;
    const coolB = this.weaponCooldowns.get(otherSlotId) ?? 0;
    if (coolB > 0) this.weaponCooldowns.set(slotId, coolB);
    else this.weaponCooldowns.delete(slotId);
    if (coolA > 0) this.weaponCooldowns.set(otherSlotId, coolA);
    else this.weaponCooldowns.delete(otherSlotId);

    let line: string | null = null;
    if (aName && bName) {
      line = `Bay: Swapped ${aName} and ${bName}.`;
    } else if (aName) {
      const binding = weaponSlotBindingForId(slots, otherSlotId);
      line = binding
        ? `Bay: Moved ${aName} to ${binding}.`
        : `Bay: Moved ${aName}.`;
    } else if (bName) {
      const binding = weaponSlotBindingForId(slots, slotId);
      line = binding
        ? `Bay: Moved ${bName} to ${binding}.`
        : `Bay: Moved ${bName}.`;
    }
    if (line) this.messages.push(line, "station");
  }

  private tryInstallModule(module: EquipModule): void {
    const slot = this.ship.loadout.slots[this.shipMenu.selectedIndex];
    if (!slot || module.kind !== slot.kind) return;
    if (slot.equipped?.id === module.id) return;

    // Do not drop berth capacity below occupied fare passengers.
    if (module.kind === "utility") {
      const occupied = occupiedPassengerBerths(this.activeMissions);
      if (occupied > 0) {
        let nextCap = 0;
        for (const s of this.ship.loadout.slots) {
          if (s.kind !== "utility") continue;
          if (s.id === slot.id) {
            nextCap += module.passengerCapacity;
          } else if (s.equipped?.kind === "utility") {
            nextCap += s.equipped.passengerCapacity;
          }
        }
        if (nextCap < occupied) {
          this.messages.push(
            `Bay: ${occupied} passenger${occupied === 1 ? "" : "s"} aboard — need ${occupied} berths fitted.`,
            "station",
          );
          return;
        }
      }
    }

    const baseCost = swapCost(slot.equipped, module);
    const cost = applyBayDiscount(baseCost, this.shipMenu.bayDiscount);
    if (!this.ship.spendCredits(cost)) {
      this.messages.push(
        `Bay: Need ${cost} cr to install ${module.name}.`,
        "station",
      );
      return;
    }

    const previous = slot.equipped ? moduleStockLabel(slot.equipped) : "empty";
    const previousMaxPlating = this.ship.maxPlating;
    const previousMaxFuel = this.ship.maxFuel;
    this.ship.loadout.equip(slot.id, module);
    if (slot.kind === "utility" || slot.kind === "drive") {
      this.ship.syncDerivedStats({
        refillShield: slot.kind === "utility",
        previousMaxPlating: slot.kind === "utility" ? previousMaxPlating : undefined,
        previousMaxFuel,
      });
    }
    const fitted = moduleStockLabel(module);
    const discNote =
      this.shipMenu.bayDiscount > 0 && cost < baseCost
        ? ` (rep −${Math.round(this.shipMenu.bayDiscount * 100)}%)`
        : "";
    this.messages.push(
      cost > 0
        ? `Bay: Fitted ${fitted} (−${cost} cr${discNote}). Replaced ${previous}.`
        : `Bay: Fitted ${fitted}. Replaced ${previous}.`,
      "station",
    );
  }

  private updateShipMenu(): void {
    if (!this.pointer.consumeClick()) return;
    const result = this.shipMenu.handleClick(
      this.ship.loadout,
      this.pointer.x,
      this.pointer.y,
      this.ship.cargo,
    );
    if (result === "close") {
      this.closeShipMenu();
      return;
    }
    if (result && typeof result === "object" && result.action === "install") {
      this.tryInstallModule(result.module);
      return;
    }
    if (result && typeof result === "object" && result.action === "swapWeapons") {
      this.trySwapWeaponSlots(result.slotId, result.otherSlotId);
      return;
    }
    if (result && typeof result === "object" && result.action === "eject") {
      this.ejectCargo(result.commodityId, result.cu);
      return;
    }
    if (
      result &&
      typeof result === "object" &&
      result.action === "cancelMission"
    ) {
      this.cancelBoardMission(result.missionId);
      return;
    }
    if (result && typeof result === "object" && result.action === "distress") {
      this.broadcastDistress();
    }
  }

  /** L-menu distress beacon — pirates or a fuel rat respond in this local view. */
  private broadcastDistress(): void {
    if (this.dock.kind !== "free") {
      this.messages.push("Distress: Undock before broadcasting.");
      return;
    }
    if (
      this.distressPending ||
      this.distressInbound ||
      this.fuelRat ||
      this.distressPirates.some((p) => p.alive)
    ) {
      this.messages.push("Distress: Responder already inbound.");
      return;
    }
    this.closeShipMenuUi();
    const reach = canReachNearestStation(
      this.galaxy,
      this.local.poiId,
      this.local.bodyId,
      this.ship.fuel,
      this.ship.jumpRange(),
    );
    if (
      reach.canReach &&
      this.distressAnsweredWhileAble >= FUEL.distressAbuseAnswerLimit
    ) {
      this.messages.push(
        `Seems like no one is coming. . . have enough fuel to get to ${reach.target.stationName}.`,
      );
      return;
    }
    if (reach.canReach) this.distressAnsweredWhileAble += 1;
    const wantPirates = rollDistressWantsPirates(this.reputation.fuelRatsRep());
    const span =
      FUEL.distressResponseDelayMax - FUEL.distressResponseDelayMin;
    const delay =
      FUEL.distressResponseDelayMin + Math.random() * span;
    this.distressPending = true;
    this.distressInbound = {
      kind: wantPirates ? "pirates" : "rat",
      delay,
      elapsed: 0,
    };
    this.messages.push(
      wantPirates
        ? "Distress: Signal broadcast — unknown contacts inbound…"
        : "Distress: Signal broadcast — rescue craft inbound…",
    );
  }

  private spawnDistressPirates(): void {
    const plan = distressPiratePlan(this.reputation.fuelRatsRep());
    const difficulty = rollDistressDifficulty(plan.tierWeights, Math.random);
    const fits = pirateRecipeFits(difficulty, Math.random);
    const n = fits.length;
    const fee = plan.fee;
    const angle0 = Math.random() * Math.PI * 2;
    this.distressPirates = [];
    for (let i = 0; i < n; i += 1) {
      const ang = angle0 + (i / n) * Math.PI * 2;
      const dist =
        FUEL.distressSpawnMin +
        Math.random() * (FUEL.distressSpawnMax - FUEL.distressSpawnMin);
      this.distressPirates.push(
        new Pirate(
          this.ship.x + Math.cos(ang) * dist,
          this.ship.y + Math.sin(ang) * dist,
          ang + Math.PI,
          fits[i]!,
          difficulty,
          fee,
        ),
      );
    }
    this.distressPack = {
      phase: "comms",
      fee,
      timer: FUEL.distressTauntSeconds,
      demanded: true,
      shipCount: n,
    };
    this.messages.push(
      n > 1
        ? `Pirate pack: Easy pickings — ${n} ships on your beacon.`
        : "Pirate: Heard your whimper. Stay put.",
      "pirate",
    );
    this.armDistressImperial();
  }

  /**
   * One countdown per local view. A pair already here, or already inbound,
   * is not replaced and the clock is not restarted.
   */
  private armDistressImperial(): void {
    if (this.distressImperialSent) return;
    if (this.distressRelief.some((p) => p.alive)) return;
    if (this.distressImperialTimer !== null) return;
    this.distressImperialTimer = FUEL.distressImperialSeconds;
  }

  /** Bulwark + Hauler. Lawful shots at pirates in range, not the Fuel Rat. */
  private spawnDistressImperial(): void {
    if (this.distressImperialSent) return;
    if (this.distressRelief.some((p) => p.alive)) return;
    const fits = heavyPatrolFits();
    const angle0 = Math.random() * Math.PI * 2;
    this.distressImperialSent = true;
    this.distressRelief = [];
    for (let i = 0; i < fits.length; i += 1) {
      const ang = angle0 + (i / fits.length) * Math.PI * 2;
      const dist =
        FUEL.distressSpawnMin +
        Math.random() * (FUEL.distressSpawnMax - FUEL.distressSpawnMin);
      const fit = fits[i]!;
      this.distressRelief.push(
        new StationPatrol(
          this.ship.x + Math.cos(ang) * dist,
          this.ship.y + Math.sin(ang) * dist,
          ang + Math.PI,
          -1,
          "Imperial",
          "imperial-distress",
          this.ship.x,
          this.ship.y,
          fit,
        ),
      );
    }
    this.messages.push(
      "Imperial patrol: Distress pirates still live — engaging.",
      "station",
    );
  }

  private spawnFuelRat(): void {
    const ang = Math.random() * Math.PI * 2;
    const dist =
      FUEL.distressSpawnMin +
      Math.random() * (FUEL.distressSpawnMax - FUEL.distressSpawnMin);
    this.fuelRat = new FuelRat(
      this.ship.x + Math.cos(ang) * dist,
      this.ship.y + Math.sin(ang) * dist,
      ang + Math.PI,
    );
  }


  /** Dump CU from a cargo lot (L-menu eject with chosen amount). */
  private ejectCargo(commodityId: string, cu: number): void {
    if (cu <= 0) return;
    const held = this.ship.cargo.amountOf(commodityId);
    if (held <= 0) return;
    const lot = this.ship.cargo.list().find((l) => l.id === commodityId);
    const name = lot?.name ?? commodityId;
    const removed = this.ship.cargo.remove(commodityId, Math.min(cu, held));
    if (removed <= 0) return;
    this.messages.push(`Cargo: Ejected ${removed} CU ${name}.`);

    // Derelict mission freight: eject force-abandons the contract. Cargo is not
    // retained — do not start / hint a future alternate-mission chain.
    if (isMissionCargoId(commodityId)) {
      const mission = this.activeMissions.find(
        (m) => missionCargoId(m.id) === commodityId,
      );
      if (mission && isDerelictRetrievalKind(mission.kind)) {
        this.cancelBoardMission(mission.id, { discardCargo: true });
        return;
      }
    }

    // Mid-scan eject of illegal cargo — 50% chance the dump is noticed.
    if (isIllegalCommodityId(commodityId)) {
      const scanning = this.patrols.find((p) => p.alive && p.isScanning);
      if (scanning) {
        if (Math.random() < PATROL.scanEjectCaughtChance) {
          let caught = this.scanCaught.get(scanning.stationKey);
          if (!caught) {
            caught = new Map();
            this.scanCaught.set(scanning.stationKey, caught);
          }
          addObservedIllegal(caught, commodityId, removed, name);
          this.messages.push(
            `${scanning.stationName} patrol: Eject noted — that dump is on the record.`,
            "station",
          );
        } else {
          this.messages.push(
            `${scanning.stationName} patrol: …hold still reading. (Dump slipped past.)`,
            "station",
          );
        }
      }
    }

    // Dumping hot goods still looks bad locally when a station knows you.
    if (isStolenCargoId(commodityId) && this.lastDockedStation) {
      this.adjustStationRep(
        this.lastDockedStation.key,
        this.lastDockedStation.name,
        REPUTATION.ejectStolenCargo,
      );
    }
  }

  private updateSystemMenu(): void {
    if (!this.pointer.consumeClick()) return;
    const result = this.panel.handleClick(
      this.local,
      this.pointer.x,
      this.pointer.y,
      !this.ship.jumpHeatFits(),
    );
    if (result === "close") {
      this.panelOpen = false;
    } else if (result === "travel") {
      const body = this.panel.selectedBody(this.local.systemBodies);
      if (body && body.id !== this.local.bodyId) {
        this.beginTravel({ kind: "body", bodyId: body.id });
      }
    }
  }

  private travelFuelCost(travel: PendingTravel): number {
    if (travel.kind === "galaxy") {
      const current = this.galaxy.get(this.local.poiId);
      const target = this.galaxy.get(travel.poiId);
      return galacticFuelCost(this.galaxy.distance(current, target));
    }
    return supercruiseFuelCost();
  }

  private beginTravel(travel: PendingTravel, skipReturnWarn = false): void {
    if (travel.kind === "galaxy") {
      if (travel.poiId === this.local.poiId) return;
      const current = this.galaxy.get(this.local.poiId);
      const target = this.galaxy.get(travel.poiId);
      const jumpRange = this.ship.jumpRange();
      if (this.galaxy.distance(current, target) > jumpRange) return;
    }

    const cost = this.travelFuelCost(travel);
    if (this.ship.fuel < cost) {
      this.messages.push(
        travel.kind === "galaxy"
          ? `Fuel: Need ${cost} for this jump (have ${Math.floor(this.ship.fuel)}).`
          : `Fuel: Need ${cost} for supercruise (have ${Math.floor(this.ship.fuel)}).`,
      );
      return;
    }

    if (!this.ship.jumpHeatFits()) return;

    // Warn if the same trip back would be impossible after this burn.
    if (!skipReturnWarn && this.ship.fuel - cost < cost) {
      this.fuelWarnTravel = travel;
      this.chartOpen = travel.kind === "galaxy";
      this.panelOpen = travel.kind === "body";
      return;
    }

    if (!this.ship.consumeFuel(cost)) return;
    this.ship.addHeat(HEAT.jump);

    this.fuelWarnTravel = null;
    this.pending = travel;
    this.fadePhase = "fadeOut";
    this.fadeTimer = 0;
    this.chartOpen = false;
    this.panelOpen = false;
    this.closeShipMenuUi();
    this.chart.selectedId = null;
    this.rememberPaidPirates();
    this.armMissionRefillsOnLeavingView();
    if (travel.kind === "galaxy") {
      this.armPassengerInterceptIfNeeded(travel.poiId);
    } else {
      this.pendingPassengerIntercept = null;
    }
    this.clearDockState();
  }

  private updateFade(dt: number): void {
    this.fadeTimer += dt;
    const dur = JUMP.fadeSeconds;

    if (this.fadePhase === "fadeOut") {
      this.fadeAlpha = Math.min(1, this.fadeTimer / dur);
      if (this.fadeTimer >= dur) {
        this.applyTravel();
        this.fadePhase = "fadeIn";
        this.fadeTimer = 0;
        this.fadeAlpha = 1;
      }
      return;
    }

    if (this.fadePhase === "fadeIn") {
      this.fadeAlpha = 1 - Math.min(1, this.fadeTimer / dur);
      if (this.fadeTimer >= dur) {
        this.fadePhase = "idle";
        this.fadeAlpha = 0;
        this.pending = null;
      }
    }
  }

  private applyTravel(): void {
    const travel = this.pending;
    if (!travel) return;

    if (travel.kind === "galaxy") {
      const poi = this.galaxy.get(travel.poiId);
      const bodyId = poi.type === "starSystem" ? 0 : null;
      this.local = generateLocalView(this.galaxy, travel.poiId, bodyId);
      this.starfield.reseed(hash2(GALAXY.seed, travel.poiId + 1000));
    } else {
      this.local = generateLocalView(
        this.galaxy,
        this.local.poiId,
        travel.bodyId,
      );
      this.starfield.reseed(
        hash2(GALAXY.seed, this.local.poiId * 50 + travel.bodyId + 2000),
      );
    }

    this.enterLocal();
    const pose = this.ship.sample(1);
    this.camera.follow(pose.x, pose.y);
  }

  private render(alpha: number): void {
    if (this.phase === "title") {
      this.renderer.drawTitle(
        this.starfield,
        this.startScreen,
        this.pointer.x,
        this.pointer.y,
      );
      return;
    }

    if (this.fadePhase === "idle" && !this.menuOpen() && this.dock.kind !== "docked") {
      const pose = this.ship.sample(alpha);
      this.camera.follow(pose.x, pose.y);
    }

    this.renderer.draw({
      ship: this.ship,
      camera: this.camera,
      starfield: this.starfield,
      local: this.local,
      pirates: [
        ...this.pirates,
        ...this.distressPirates,
        ...(this.baitPirate ? [this.baitPirate] : []),
      ],
      fuelRat: this.fuelRat,
      strandedPilot: this.strandedPilot,
      fuelWarn: this.fuelWarnTravel
        ? {
            cost: this.travelFuelCost(this.fuelWarnTravel),
            fuel: this.ship.fuel,
            kind: this.fuelWarnTravel.kind,
          }
        : null,
      fuelWarnYes: this.fuelWarnYes,
      fuelWarnNo: this.fuelWarnNo,
      patrols: [...this.patrols, ...this.distressRelief],
      missileLock: this.missileReticle(),
      projectiles: this.projectiles,
      energyBeams: this.energyDrawList(),
      alpha,
      thrusting:
        !this.menuOpen() &&
        this.dock.kind === "free" &&
        this.ship.alive &&
        this.keyboard.state.thrust,
      chartOpen: this.chartOpen,
      panelOpen: this.panelOpen,
      shipMenuOpen: this.shipMenuOpen,
      marketMenuOpen: this.marketMenuOpen,
      missionBoardOpen: this.missionBoardOpen,
      hangarMenuOpen: this.hangarMenuOpen,
      chartHints: this.chartHints(),
      activeMissions: this.missionsForBoardUi(),
      reputationListing: this.reputationListingForUi(),
      panel: this.panel,
      galaxy: this.galaxy,
      chart: this.chart,
      shipMenu: this.shipMenu,
      marketMenu: this.marketMenu,
      missionBoard: this.missionBoard,
      hangarMenu: this.hangarMenu,
      messages: this.messages,
      stationMenu: this.stationMenu,
      dockedMenu: this.dockedMenu,
      pirateMenu: this.pirateMenu,
      patrolMenu: this.patrolMenu,
      pointerX: this.pointer.x,
      pointerY: this.pointer.y,
      fadeAlpha: this.fadeAlpha,
      weaponRows: this.weaponHudRows(),
    });

    if (this.phase === "gameover") {
      this.renderer.drawGameOver(
        this.gameOverScreen,
        this.pointer.x,
        this.pointer.y,
      );
    }
  }
}

