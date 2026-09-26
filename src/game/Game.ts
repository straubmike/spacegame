import { COMBAT, DOCK, ECONOMY, GALAXY, JUMP, LOCAL, PATROL, QUEST, REPUTATION, SCOOP } from "./config";
import { Loop } from "./Loop";
import { hash2 } from "../galaxy/rng";
import { Galaxy } from "../galaxy/Galaxy";
import { generateLocalView } from "../galaxy/generateLocal";
import { rockYieldLabel } from "../galaxy/beltRocks";
import {
  listSystemPirateKeys,
  pickQuestGiverStation,
  pirateViewKey,
  stationKey,
  type SystemStationRef,
} from "../galaxy/pirates";
import { swapCost, type EquipModule } from "../ship/equipment";
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
  stationOffersBlackMarket,
  type StationMarket,
} from "../ship/market";
import type { MarketContext } from "../ship/economy";
import {
  applyBayDiscount,
  formatStanding,
  PIRATE_FACTION_ID,
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
import type { HostKind, Landmark, LocalView } from "../galaxy/types";
import { Keyboard } from "../input/Keyboard";
import { Pointer } from "../input/Pointer";
import { Ship } from "../entities/Ship";
import { Pirate } from "../entities/Pirate";
import {
  StationPatrol,
  type PatrolPlayerLaw,
} from "../entities/StationPatrol";
import { Projectile, spawnProjectile } from "../entities/Projectile";
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
import { hullById } from "../ship/hulls";
import {
  generateStationMissions,
  isStolenCargoId,
  makeClearanceOffer,
  missionCargoId,
  questChartPoiIds,
  stolenCargoId,
  stationRefFromLocal,
  type ActiveMission,
  type MissionOffer,
} from "../ship/missions";

type FadePhase = "idle" | "fadeOut" | "fadeIn";

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
  /** Systems whose clearance contract has already been claimed. */
  private readonly claimedClearanceSystems = new Set<number>();
  /** POIs the player has entered this session. */
  private readonly visitedPoiIds = new Set<number>();
  /** POIs scanned via exploration contracts. */
  private readonly scannedPoiIds = new Set<number>();
  /** Per-station + pirate faction standing (session). */
  private readonly reputation = new ReputationTracker();
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
  private local: LocalView;
  private pirates: Pirate[] = [];
  /** Local station patrols (host-station tied). */
  private patrols: StationPatrol[] = [];
  /** Shared fee/combat event for the current local pirate group (null = none). */
  private pack: PackEncounter | null = null;
  private projectiles: Projectile[] = [];
  private fireCooldown = 0;
  private dock: DockState = { kind: "free" };
  /** Progress toward the next scooped CU while holding F. */
  private scoopProgress = 0;
  private scoopHintCooldown = 0;

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

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not get 2D canvas context");
    }

    this.keyboard = new Keyboard();
    this.pointer = new Pointer(canvas);
    this.ship = new Ship();
    this.camera = new Camera();
    this.galaxy = new Galaxy();
    this.starfield = new Starfield(hash2(GALAXY.seed, GALAXY.startPoiId));
    this.renderer = new Renderer(canvas, ctx);

    this.local = generateLocalView(this.galaxy, GALAXY.startPoiId, 0);
    this.visitedPoiIds.add(GALAXY.startPoiId);
    this.enterLocal();

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

  private enterLocal(): void {
    const angle = -Math.PI / 2;
    this.ship.arriveAt(
      Math.cos(angle) * LOCAL.arrivalDistance,
      Math.sin(angle) * LOCAL.arrivalDistance,
      angle + Math.PI,
    );
    this.panel.selectedBodyId = this.local.bodyId;
    this.projectiles = [];
    this.fireCooldown = 0;
    this.scoopProgress = 0;
    this.pirates = [];
    this.patrols = [];
    this.pack = null;
    this.clearDockClearance();
    this.clearDockState();
    const key = this.pirateKey();
    if (this.local.pirate && !this.clearedPirateViews.has(key)) {
      const feePaid = this.paidPirateViews.has(key);
      const encounter = this.local.pirate;
      for (const ship of encounter.ships) {
        this.pirates.push(
          new Pirate(ship.x, ship.y, ship.heading, ship.tier, encounter.fee),
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
    this.spawnStationPatrols();
    this.checkExploreScanProgress();
  }

  /** Seeded chance: some stations get one patrol loitering nearby. */
  private spawnStationPatrols(): void {
    for (const station of this.stations()) {
      const key = this.currentStationKey(station);
      if (!key) continue;
      const roll =
        (hash2(GALAXY.seed ^ 0x9a71, hashStationKey(key)) % 1000) / 1000;
      if (roll > PATROL.spawnChance) continue;
      const angle =
        ((hash2(GALAXY.seed ^ 0xc0ff, hashStationKey(key)) % 360) * Math.PI) /
        180;
      const dist = PATROL.spawnDistance;
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

  private pirateAggroActive(): boolean {
    return this.pack?.phase === "hostile";
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
    return this.pack?.phase === "comms";
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
        if (inRange) {
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

  /** Sneak attack or timeout fight — whole pack goes hostile once. */
  private makePackHostile(): void {
    if (!this.pack || this.pack.phase === "paid") return;
    this.pack.phase = "hostile";
    this.pack.demanded = true;
    this.pack.timer = 0;
    this.pirateMenu.hide();
    for (const p of this.pirates) {
      if (p.alive) p.goAggro();
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
    const claimable = this.activeMissions.filter(
      (m) => m.status === "readyToClaim",
    ).length;
    if (claimable > 0) return `${claimable} ready`;
    const n = this.activeMissions.length;
    if (n > 0) return `${n} active`;
    const open = this.visibleMissionOffers().length;
    return open > 0 ? `${open} open` : "";
  }

  private visibleMissionOffers(): MissionOffer[] {
    return this.dockMissionOffers.filter(
      (o) => !this.acceptedMissionIds.has(o.id),
    );
  }

  private chartHints(): ChartPoiHints {
    const questPoiIds = questChartPoiIds(this.activeMissions);
    const selectableOutOfRange = new Set<number>([
      ...this.visitedPoiIds,
      ...this.scannedPoiIds,
      ...questPoiIds,
    ]);
    return { selectableOutOfRange, questPoiIds };
  }

  private missionsForBoardUi(): ActiveMission[] {
    const here =
      this.dock.kind === "docked"
        ? this.currentStationKey(this.dock.station)
        : null;
    return this.activeMissions.map((m) => {
      if (m.kind === "explore") {
        if (
          m.scanned &&
          here === m.originStationKey &&
          m.status !== "readyToClaim"
        ) {
          return { ...m, status: "readyToClaim" as const };
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
        giver,
        targets,
        this.local.poiName,
      );
      if (clearance) offers.unshift(clearance);
    }
    return offers;
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

  /** On arriving in a local view — complete explore scans when at the target POI. */
  private checkExploreScanProgress(): void {
    this.visitedPoiIds.add(this.local.poiId);
    for (const mission of this.activeMissions) {
      if (mission.kind !== "explore" || mission.scanned) continue;
      if (mission.targetPoiId !== this.local.poiId) continue;
      mission.scanned = true;
      this.scannedPoiIds.add(this.local.poiId);
      this.messages.push(
        `Scan complete: ${mission.targetPoiName}. Return to ${mission.originStationName} to claim (+${mission.reward} cr).`,
      );
    }
  }

  private tryCompleteCargoDelivery(station: Landmark): void {
    const here = this.currentStationKey(station);
    if (!here) return;

    const delivered: ActiveMission[] = [];
    for (const mission of this.activeMissions) {
      if (mission.kind !== "cargo") continue;
      if (mission.destStationKey !== here) continue;
      const lotId = missionCargoId(mission.id);
      const need = mission.cu ?? 0;
      if (this.ship.cargo.amountOf(lotId) < need) {
        this.messages.push(
          `${station.name}: Missing ${need} CU mission freight for "${mission.title}".`,
          "station",
        );
        continue;
      }
      this.ship.cargo.remove(lotId, need);
      this.ship.addCredits(mission.reward);
      delivered.push(mission);
      this.adjustStationRep(
        mission.destStationKey!,
        mission.destStationName ?? station.name,
        REPUTATION.missionComplete,
      );
      this.messages.push(
        `${station.name}: Cargo delivered — ${mission.title} (+${mission.reward} cr).`,
        "station",
      );
    }
    for (const m of delivered) {
      const i = this.activeMissions.indexOf(m);
      if (i >= 0) this.activeMissions.splice(i, 1);
    }
  }

  private syncExploreClaimableAtStation(station: Landmark): void {
    const here = this.currentStationKey(station);
    if (!here) return;
    for (const mission of this.activeMissions) {
      if (mission.kind === "explore") {
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
    } else if (this.activeMissions.length >= QUEST.maxActive) {
      this.messages.push(
        `Missions: Already holding ${QUEST.maxActive} contracts — complete one first.`,
        "station",
      );
      return;
    }

    if (offer.kind === "cargo") {
      const cu = offer.cu ?? 0;
      const name = offer.commodityName ?? "Freight";
      if (!this.ship.cargo.canStow(cu)) {
        this.messages.push(
          `Missions: Need ${cu} free CU (equip a cargo rack in the Bay).`,
          "station",
        );
        return;
      }
      if (
        !this.ship.cargo.stow({
          id: missionCargoId(offer.id),
          name: `Contract: ${name}`,
          cu,
        })
      ) {
        this.messages.push("Missions: Could not load freight.", "station");
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

    let msg: string;
    if (offer.kind === "cargo") {
      msg = `Missions: Accepted — haul to ${offer.destStationName} (+${offer.reward} cr).`;
    } else if (offer.kind === "clearance") {
      const n = offer.pirateTargets?.length ?? 0;
      msg = `Missions: Accepted — clear ${n} pirate${n === 1 ? "" : "s"} in this system (+${offer.reward} cr).`;
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

    if (mission.kind === "explore") {
      if (!mission.scanned || here !== mission.originStationKey) {
        this.messages.push(
          `Missions: Finish the scan and return to ${mission.originStationName}.`,
          "station",
        );
        return;
      }
      this.ship.addCredits(mission.reward);
      this.activeMissions.splice(idx, 1);
      this.adjustStationRep(
        mission.originStationKey,
        mission.originStationName,
        REPUTATION.missionComplete,
      );
      this.messages.push(
        `${station.name}: Survey filed — ${mission.title} (+${mission.reward} cr).`,
        "station",
      );
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

    // Cargo pays on delivery; claim button is unused for cargo.
    this.messages.push(
      "Missions: Deliver the freight at the destination station.",
      "station",
    );
  }

  private refreshMissionBoardUi(): void {
    if (!this.missionBoardOpen) return;
    this.missionBoard.refresh(
      this.visibleMissionOffers(),
      this.missionsForBoardUi(),
      this.ship.cargo.freeCu,
      this.activeMissions.filter((m) => m.kind !== "clearance").length <
        QUEST.maxActive,
    );
  }

  private openMissionBoard(station: Landmark): void {
    this.dockedMenu.hide();
    this.marketMenuOpen = false;
    this.marketMenu.hide();
    this.shipMenuOpen = false;
    this.shipMenu.openView();
    this.hangarMenuOpen = false;
    this.hangarMenu.hide();
    this.syncExploreClaimableAtStation(station);
    this.missionBoard.show(
      station.name,
      this.visibleMissionOffers(),
      this.missionsForBoardUi(),
      this.ship.cargo.freeCu,
      this.activeMissions.filter((m) => m.kind !== "clearance").length <
        QUEST.maxActive,
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
   * Offer stays in acceptedMissionIds so it does not reappear on that station's board.
   */
  private cancelBoardMission(
    missionId: string,
    opts: { fromBoard?: boolean } = {},
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
    if (mission.kind === "cargo") {
      const lotId = missionCargoId(mission.id);
      const held = this.ship.cargo.amountOf(lotId);
      if (held > 0) {
        this.ship.cargo.remove(lotId, held);
        if (atOriginBoard) {
          // Abort at giver: cargo returned — do not keep as stolen.
          returnedCu = held;
        } else {
          const commodityId = mission.commodityId ?? "goods";
          const name = mission.commodityName ?? "Freight";
          this.ship.cargo.stow({
            id: stolenCargoId(commodityId),
            name,
            cu: held,
          });
          stoleCu = held;
        }
      }
    }

    this.activeMissions.splice(idx, 1);
    // Keep missionId in acceptedMissionIds — cancel consumes the offer for this station.

    if (stoleCu > 0) {
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
    } else if (mission.kind !== "cargo" || returnedCu > 0) {
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
    this.messages.push(
      `Standing — ${label}: ${formatStanding(next)} (${signed})`,
      label === "Pirates" ? "pirate" : "station",
    );
  }

  private dockStandingLine(station: Landmark): string {
    const key = this.currentStationKey(station);
    if (!key) return "";
    return `Rep ${formatStanding(this.reputation.stationStanding(key))}`;
  }

  private reputationListingForUi(): ReputationListing {
    return {
      factions: [
        {
          id: PIRATE_FACTION_ID,
          label: "Pirates",
          score: this.reputation.pirateRep(),
        },
        { id: "merchants", label: "Merchants guild", score: 0 },
        { id: "cartographers", label: "Cartographers", score: 0 },
      ],
      stations: this.reputation.nonzeroStations(),
    };
  }

  private showDockedUi(station: Landmark): void {
    const key =
      this.currentStationKey(station) ??
      `visit:${this.local.poiId}:${station.id}`;
    this.dockedMenu.show(
      station.name,
      window.innerWidth,
      window.innerHeight,
      this.missionBoardHint(),
      this.dockStandingLine(station),
      stationOffersBlackMarket(key, this.local.poiId),
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
    this.messages.update(dt);
    this.ship.tickDefense(dt);

    // Drain wheel every frame so deltas don't pile up while menus are closed.
    const wheel = this.pointer.consumeWheel();
    if (wheel !== 0) {
      if (this.marketMenuOpen) {
        this.marketMenu.handleWheel(wheel, this.pointer.x, this.pointer.y);
      } else if (this.shipMenuOpen) {
        this.shipMenu.handleWheel(wheel, this.pointer.x, this.pointer.y);
      }
    }

    if (this.fadePhase !== "idle") {
      this.updateFade(dt);
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
      this.updateGalaxyMenu();
      return;
    }

    if (this.panelOpen) {
      this.updateSystemMenu();
      return;
    }

    if (this.shipMenuOpen) {
      this.updateShipMenu();
      return;
    }

    if (this.marketMenuOpen) {
      this.updateMarketMenu();
      return;
    }

    if (this.missionBoardOpen) {
      this.updateMissionBoard();
      const pose = this.ship.sample(1);
      this.camera.follow(pose.x, pose.y);
      return;
    }

    if (this.hangarMenuOpen) {
      this.updateHangarMenu();
      const pose = this.ship.sample(1);
      this.camera.follow(pose.x, pose.y);
      return;
    }

    if (this.dock.kind === "docked") {
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
      if (arrived) {
        this.completeDock(this.dock.station);
      }
    } else {
      this.ship.update(dt, this.keyboard.state);
      this.updateCombat(dt);
      this.updateScoop(dt);
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
    this.redeemPendingKills(station.name);
    this.tryCompleteCargoDelivery(station);
    this.syncExploreClaimableAtStation(station);
    const key =
      this.currentStationKey(station) ??
      `visit:${this.local.poiId}:${station.id}`;
    this.lastDockedStation = { key, name: station.name };
    this.dockMarket = createStationMarket(key, this.marketContext());
    this.dockBlackMarket = stationOffersBlackMarket(key, this.local.poiId)
      ? createBlackMarket(key, this.marketContext())
      : null;
    this.dockMissionOffers = this.buildDockMissionOffers(station);
    this.showDockedUi(station);
    this.messages.push(`Docked at ${station.name}.`);
  }

  private updateDockedMenu(): void {
    if (!this.pointer.consumeClick()) return;
    if (this.dock.kind !== "docked") return;
    const station = this.dock.station;
    const action = this.dockedMenu.handleClick(this.pointer.x, this.pointer.y);
    if (action === "repair") {
      const missing = this.ship.missingHealth;
      if (missing <= 0) {
        this.messages.push("Hull already at full integrity.");
        return;
      }
      if (this.ship.credits < ECONOMY.repairCostPerHp) {
        this.messages.push("Insufficient credits for repairs.");
        return;
      }
      const { healed, cost } = this.ship.repairWithCredits();
      if (healed <= 0) {
        this.messages.push("Insufficient credits for repairs.");
        return;
      }
      const key = this.currentStationKey(station);
      if (key) {
        this.adjustStationRep(
          key,
          station.name,
          REPUTATION.repairGoodwill,
        );
      }
      if (this.ship.health >= this.ship.maxHull) {
        this.messages.push(`Repairs complete (−${cost} cr). Hull restored.`);
      } else {
        this.messages.push(
          `Partial repair: +${healed} HP (−${cost} cr). Need more credits for full restore.`,
        );
      }
      return;
    }
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
    if (!rocks || this.local.focus.kind !== "asteroidBelt") {
      this.scoopProgress = 0;
      return;
    }

    const holding = this.keyboard.state.scoop;
    if (!holding) {
      this.scoopProgress = 0;
      return;
    }

    if (!this.ship.loadout.canProspectBelts) {
      this.scoopProgress = 0;
      if (this.scoopHintCooldown <= 0) {
        const hasScan = this.ship.loadout.mineralScanRange > 0;
        const hasScoop = this.ship.loadout.scoopRange > 0;
        if (!hasScan && !hasScoop) {
          this.messages.push(
            "Scoop: Fit Ore Scanner + Cargo Scoop (or Prospecting Rig) to farm.",
          );
        } else if (!hasScan) {
          this.messages.push("Scoop: Ore Scanner required to lock veins.");
        } else {
          this.messages.push("Scoop: Cargo Scoop required to collect ore.");
        }
        this.scoopHintCooldown = 4;
      }
      return;
    }

    const scanRange = this.ship.loadout.mineralScanRange;
    const scoopRange = this.ship.loadout.scoopRange;
    const reach = scoopRange + SCOOP.rangePad;

    let best: (typeof rocks)[number] | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const rock of rocks) {
      if (!rock.yieldId || rock.remaining <= 0) continue;
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

  private updateCombat(dt: number): void {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    const canFire =
      this.dock.kind === "free" &&
      this.keyboard.state.fire &&
      this.fireCooldown <= 0 &&
      this.ship.alive &&
      this.ship.loadout.canFire();

    if (canFire) {
      const shots = this.ship.loadout.fireWeaponCount();
      const size = this.ship.hull.size;
      const spread =
        shots > 1 ? (8 * Math.PI) / 180 / Math.max(1, shots - 1) : 0;
      const start = shots > 1 ? -spread * ((shots - 1) / 2) : 0;
      for (let i = 0; i < shots; i += 1) {
        this.projectiles.push(
          spawnProjectile(
            this.ship.x,
            this.ship.y,
            this.ship.heading + start + spread * i,
            size,
            false,
          ),
        );
      }
      this.ship.loadout.consumeAmmo(shots);
      this.fireCooldown = this.ship.loadout.fireCooldown();
    }

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

    const hostile = this.pack?.phase === "hostile";
    for (const pirate of this.pirates) {
      pirate.update(
        dt,
        this.ship.x,
        this.ship.y,
        pirateShots,
        hostile === true,
      );
    }
    if (pirateShots.length > 0) {
      this.projectiles.push(...pirateShots);
    }

    const patrolShots: Projectile[] = [];
    for (const patrol of this.patrols) {
      const law = this.patrolLawFor(patrol.stationKey);
      const edge = patrol.update(
        dt,
        this.pirates,
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

    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const p = this.projectiles[i]!;
      p.update(dt);

      if (p.isOffScreen(this.camera.x, this.camera.y, viewW, viewH)) {
        this.projectiles.splice(i, 1);
        continue;
      }

      if (p.hostile) {
        if (this.ship.alive) {
          const dist = Math.hypot(p.x - this.ship.x, p.y - this.ship.y);
          if (dist <= COMBAT.playerHitRadius + COMBAT.projectileRadius) {
            this.ship.takeDamage(p.damage);
            this.projectiles.splice(i, 1);
          }
        }
        continue;
      }

      let hit = false;
      for (const pirate of this.pirates) {
        if (!pirate.alive) continue;
        const dist = Math.hypot(p.x - pirate.x, p.y - pirate.y);
        if (dist <= pirate.radius + COMBAT.projectileRadius) {
          pirate.takeDamage(p.damage);
          // Sneak attack during fee window → one pack fight, not per-ship fees.
          if (this.pack && this.pack.phase !== "paid") {
            this.makePackHostile();
          }
          hit = true;
          break;
        }
      }
      if (!hit) {
        for (const patrol of this.patrols) {
          if (!patrol.alive) continue;
          const dist = Math.hypot(p.x - patrol.x, p.y - patrol.y);
          if (dist <= patrol.radius + COMBAT.projectileRadius) {
            patrol.takeDamage(p.damage);
            // Attacking a station patrol → immediate Hostile + return fire.
            this.forceStationHostile(
              patrol.stationKey,
              patrol.stationName,
              `${patrol.stationName} patrol: Under attack — you are now Hostile.`,
            );
            patrol.markDefending();
            this.patrolMenu.hide();
            hit = true;
            break;
          }
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

    for (const patrol of this.patrols) {
      if (patrol.alive) continue;
      this.messages.push(
        `${patrol.stationName} patrol destroyed.`,
        "station",
      );
    }
    this.patrols = this.patrols.filter((p) => p.alive);
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
    const context = this.stationStockContext();
    this.dockedMenu.hide();
    this.marketMenuOpen = false;
    this.marketMenu.hide();
    this.missionBoardOpen = false;
    this.missionBoard.hide();
    this.hangarMenuOpen = false;
    this.hangarMenu.hide();
    const discount = this.reputation.bayDiscountFraction(key);
    this.shipMenu.openBay(
      stationBayStock(key, context),
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
    if (!this.dockMarket) {
      const key =
        this.currentStationKey(station) ??
        `visit:${this.local.poiId}:${station.id}`;
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
    if (!stationOffersBlackMarket(key, this.local.poiId)) {
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

    const book =
      this.marketMenuKind === "black" ? this.dockBlackMarket : this.dockMarket;
    const label = this.marketMenuKind === "black" ? "Black Market" : "Market";
    const listing = book?.listing(result.commodityId);
    if (!listing) return;

    if (result.action === "buy") {
      if (listing.playerBuyPrice === null) return;
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

  private tryInstallModule(module: EquipModule): void {
    const slot = this.ship.loadout.slots[this.shipMenu.selectedIndex];
    if (!slot || module.kind !== slot.kind) return;
    if (slot.equipped?.id === module.id) return;

    const baseCost = swapCost(slot.equipped, module);
    const cost = applyBayDiscount(baseCost, this.shipMenu.bayDiscount);
    if (!this.ship.spendCredits(cost)) {
      this.messages.push(
        `Bay: Need ${cost} cr to install ${module.name}.`,
        "station",
      );
      return;
    }

    const previous = slot.equipped?.name ?? "empty";
    const previousMaxHull = this.ship.maxHull;
    this.ship.loadout.equip(slot.id, module);
    if (slot.kind === "utility") {
      this.ship.syncDerivedStats({
        refillShield: true,
        previousMaxHull,
      });
    }
    const discNote =
      this.shipMenu.bayDiscount > 0 && cost < baseCost
        ? ` (rep −${Math.round(this.shipMenu.bayDiscount * 100)}%)`
        : "";
    this.messages.push(
      cost > 0
        ? `Bay: Fitted ${module.name} (−${cost} cr${discNote}). Replaced ${previous}.`
        : `Bay: Fitted ${module.name}. Replaced ${previous}.`,
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
    }
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

  private beginTravel(travel: PendingTravel): void {
    if (travel.kind === "galaxy") {
      if (travel.poiId === this.local.poiId) return;
      const current = this.galaxy.get(this.local.poiId);
      const target = this.galaxy.get(travel.poiId);
      const jumpRange = this.ship.jumpRange();
      if (this.galaxy.distance(current, target) > jumpRange) return;
      if (!this.ship.loadout.canJump()) {
        this.messages.push("Drive: No warp charges remaining — repair to refill.");
        return;
      }
      this.ship.loadout.consumeWarp();
    }

    this.pending = travel;
    this.fadePhase = "fadeOut";
    this.fadeTimer = 0;
    this.chartOpen = false;
    this.panelOpen = false;
    this.closeShipMenuUi();
    this.chart.selectedId = null;
    this.rememberPaidPirates();
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
    if (this.fadePhase === "idle" && !this.menuOpen() && this.dock.kind !== "docked") {
      const pose = this.ship.sample(alpha);
      this.camera.follow(pose.x, pose.y);
    }

    this.renderer.draw({
      ship: this.ship,
      camera: this.camera,
      starfield: this.starfield,
      local: this.local,
      pirates: this.pirates,
      patrols: this.patrols,
      projectiles: this.projectiles,
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
    });
  }
}
