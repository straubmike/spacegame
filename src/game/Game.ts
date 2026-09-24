import { COMBAT, DOCK, ECONOMY, GALAXY, JUMP, LOCAL, QUEST, SHIP } from "./config";
import { Loop } from "./Loop";
import { hash2 } from "../galaxy/rng";
import { Galaxy } from "../galaxy/Galaxy";
import { generateLocalView } from "../galaxy/generateLocal";
import {
  listSystemPirateKeys,
  pickQuestGiverStation,
  pirateViewKey,
  stationKey,
  type SystemStationRef,
} from "../galaxy/pirates";
import { swapCost, type EquipModule } from "../ship/equipment";
import { stationBayStock } from "../ship/stationStock";
import { createStationMarket, type StationMarket } from "../ship/market";
import {
  generateStationMissions,
  missionCargoId,
  stationRefFromLocal,
  type ActiveMission,
  type MissionOffer,
} from "../ship/missions";
import type { Landmark, LocalView } from "../galaxy/types";
import { Keyboard } from "../input/Keyboard";
import { Pointer } from "../input/Pointer";
import { Ship } from "../entities/Ship";
import { Pirate } from "../entities/Pirate";
import { Projectile, spawnProjectile } from "../entities/Projectile";
import { Camera } from "../world/Camera";
import { Starfield } from "../world/Starfield";
import { Renderer } from "../render/Renderer";
import { GalaxyChart } from "../ui/GalaxyChart";
import { SystemPanel } from "../ui/SystemPanel";
import { MessageSidebar } from "../ui/MessageSidebar";
import { StationContextMenu } from "../ui/StationContextMenu";
import { DockedMenu, type DockedQuestUi } from "../ui/DockedMenu";
import { PirateFeeMenu } from "../ui/PirateFeeMenu";
import { ShipMenu } from "../ui/ShipMenu";
import { MarketMenu } from "../ui/MarketMenu";
import { MissionBoardMenu } from "../ui/MissionBoardMenu";

type FadePhase = "idle" | "fadeOut" | "fadeIn";

type PendingTravel =
  | { kind: "galaxy"; poiId: number }
  | { kind: "body"; bodyId: number };

type DockState =
  | { kind: "free" }
  | { kind: "approaching"; station: Landmark }
  | { kind: "docked"; station: Landmark };

/** Active system clearance contract. */
interface PirateQuest {
  poiId: number;
  stationKey: string;
  targets: string[];
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
  private readonly shipMenu = new ShipMenu();
  private readonly marketMenu = new MarketMenu();
  private readonly missionBoard = new MissionBoardMenu();
  /** Active market for the current dock session (mutated by trades). */
  private dockMarket: StationMarket | null = null;
  /** Offers posted at the current dock (seeded per station). */
  private dockMissionOffers: MissionOffer[] = [];
  /** Local views where the pirate fee has already been paid. */
  private readonly paidPirateViews = new Set<string>();
  /** Pirate slots permanently cleared (killed or driven off). */
  private readonly clearedPirateViews = new Set<string>();
  /** Eliminated pirates not yet cashed in at a station. */
  private pendingPirateKills = 0;
  /** One active clearance quest per star system. */
  private readonly pirateQuests = new Map<number, PirateQuest>();
  /** Systems whose clearance quest has already been claimed. */
  private readonly claimedPirateQuests = new Set<number>();
  /** Accepted board missions (cargo / explore). */
  private readonly activeMissions: ActiveMission[] = [];
  /** Offer ids already taken this session (hide from boards). */
  private readonly acceptedMissionIds = new Set<string>();

  /** Stations that have granted docking clearance this local visit. */
  private readonly dockClearance = new Set<number>();
  private local: LocalView;
  private pirates: Pirate[] = [];
  private projectiles: Projectile[] = [];
  private fireCooldown = 0;
  private dock: DockState = { kind: "free" };

  private chartOpen = false;
  private panelOpen = false;
  private shipMenuOpen = false;
  private marketMenuOpen = false;
  private missionBoardOpen = false;
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
    this.pirates = [];
    this.clearDockClearance();
    this.clearDockState();
    const key = this.pirateKey();
    if (this.local.pirate && !this.clearedPirateViews.has(key)) {
      const feePaid = this.paidPirateViews.has(key);
      this.pirates.push(
        new Pirate(
          this.local.pirate.x,
          this.local.pirate.y,
          this.local.pirate.heading,
          feePaid,
        ),
      );
    }
    this.checkExploreScanProgress();
  }

  private pirateKey(poiId = this.local.poiId, bodyId = this.local.bodyId): string {
    return pirateViewKey(poiId, bodyId);
  }

  private rememberPaidPirates(): void {
    for (const pirate of this.pirates) {
      if (pirate.feePaid) this.paidPirateViews.add(this.pirateKey());
    }
  }

  private clearDockState(): void {
    this.dock = { kind: "free" };
    this.stationMenu.hide();
    this.dockedMenu.hide();
    this.pirateMenu.hide();
    this.marketMenu.hide();
    this.marketMenuOpen = false;
    this.dockMarket = null;
    this.missionBoard.hide();
    this.missionBoardOpen = false;
    this.dockMissionOffers = [];
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
      this.missionBoardOpen
    );
  }

  private missionBoardHint(): string {
    const claimable = this.activeMissions.filter(
      (m) => m.status === "readyToClaim",
    ).length;
    if (claimable > 0) return `${claimable} ready`;
    const n = this.activeMissions.length;
    if (n > 0) return `${n} active`;
    const open = this.dockMissionOffers.filter(
      (o) => !this.acceptedMissionIds.has(o.id),
    ).length;
    return open > 0 ? `${open} open` : "";
  }

  private visibleMissionOffers(): MissionOffer[] {
    return this.dockMissionOffers.filter(
      (o) => !this.acceptedMissionIds.has(o.id),
    );
  }

  private missionsForBoardUi(): ActiveMission[] {
    if (this.dock.kind !== "docked") return [...this.activeMissions];
    const here = this.currentStationKey(this.dock.station);
    return this.activeMissions.map((m) => {
      if (m.kind !== "explore") return m;
      if (
        m.scanned &&
        here === m.originStationKey &&
        m.status !== "readyToClaim"
      ) {
        return { ...m, status: "readyToClaim" as const };
      }
      return m;
    });
  }

  private pirateAggroActive(): boolean {
    return this.pirates.some((p) => p.alive && p.mode === "aggro");
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

  private questGiverForCurrentSystem(): SystemStationRef | null {
    if (this.local.poiType !== "starSystem") return null;
    return pickQuestGiverStation(this.galaxy, this.local.poiId);
  }

  private unclearedPirateKeys(poiId: number): string[] {
    return listSystemPirateKeys(this.galaxy, poiId).filter(
      (k) => !this.clearedPirateViews.has(k),
    );
  }

  private dockedQuestUi(station: Landmark): DockedQuestUi {
    const empty: DockedQuestUi = {
      canOffer: false,
      inProgress: false,
      canClaim: false,
      remaining: 0,
    };
    if (this.local.poiType !== "starSystem") return empty;

    const poiId = this.local.poiId;
    const here = this.currentStationKey(station);
    const giver = this.questGiverForCurrentSystem();
    const quest = this.pirateQuests.get(poiId);
    const claimed = this.claimedPirateQuests.has(poiId);
    const remaining = this.unclearedPirateKeys(poiId).length;

    if (quest) {
      const atGiver = here !== null && here === quest.stationKey;
      const done = quest.targets.every((k) => this.clearedPirateViews.has(k));
      const canClaim = done && atGiver && !claimed;
      return {
        canOffer: false,
        /** Keep a status row until claimed (incl. “return with proof”). */
        inProgress: !canClaim,
        canClaim,
        remaining: quest.targets.filter((k) => !this.clearedPirateViews.has(k))
          .length,
      };
    }

    if (claimed || !giver || remaining === 0) return empty;
    const atGiver = here !== null && here === giver.key;
    return {
      canOffer: atGiver,
      inProgress: false,
      canClaim: false,
      remaining,
    };
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
   * Pirate left the sector — destroyed (kill) or warped away (escape).
   * Only kills credit the redemption counter; both clear the spawn slot.
   */
  private onPirateRemoved(killed: boolean): void {
    const key = this.pirateKey();
    if (this.clearedPirateViews.has(key)) return;
    this.clearedPirateViews.add(key);
    this.paidPirateViews.delete(key);
    if (killed) this.pendingPirateKills += 1;

    const quest = this.pirateQuests.get(this.local.poiId);
    if (quest && quest.targets.includes(key)) {
      const left = quest.targets.filter((k) => !this.clearedPirateViews.has(k))
        .length;
      if (left === 0) {
        this.messages.push(
          killed
            ? "Pirate destroyed. System clearance complete — return to the contracting station."
            : "Pirate escaped the sector. System clearance complete — return to the contracting station.",
        );
      } else if (killed) {
        this.messages.push(
          `Pirate destroyed. ${left} remaining for system clearance.`,
        );
      } else {
        this.messages.push(
          `Pirate escaped. ${left} remaining for system clearance.`,
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

  private acceptPirateQuest(station: Landmark): void {
    if (this.local.poiType !== "starSystem") return;
    const poiId = this.local.poiId;
    if (this.pirateQuests.has(poiId) || this.claimedPirateQuests.has(poiId)) {
      return;
    }
    const giver = this.questGiverForCurrentSystem();
    const here = this.currentStationKey(station);
    if (!giver || here !== giver.key) return;

    const targets = this.unclearedPirateKeys(poiId);
    if (targets.length === 0) return;

    this.pirateQuests.set(poiId, {
      poiId,
      stationKey: giver.key,
      targets,
    });
    this.messages.push(
      `${station.name}: Contract accepted — clear ${targets.length} pirate${targets.length === 1 ? "" : "s"} in this system (+${ECONOMY.pirateQuestReward} cr).`,
      "station",
    );
    this.dockedMenu.refreshQuest(
      this.dockedQuestUi(station),
      window.innerWidth,
      window.innerHeight,
      this.missionBoardHint(),
    );
  }

  private claimPirateQuest(station: Landmark): void {
    if (this.local.poiType !== "starSystem") return;
    const poiId = this.local.poiId;
    const quest = this.pirateQuests.get(poiId);
    if (!quest || this.claimedPirateQuests.has(poiId)) return;
    const here = this.currentStationKey(station);
    if (here !== quest.stationKey) return;
    if (!quest.targets.every((k) => this.clearedPirateViews.has(k))) return;

    this.ship.addCredits(ECONOMY.pirateQuestReward);
    this.pirateQuests.delete(poiId);
    this.claimedPirateQuests.add(poiId);
    this.messages.push(
      `${station.name}: System clearance confirmed (+${ECONOMY.pirateQuestReward} cr).`,
      "station",
    );
    this.dockedMenu.refreshQuest(
      this.dockedQuestUi(station),
      window.innerWidth,
      window.innerHeight,
      this.missionBoardHint(),
    );
  }

  /** On arriving in a local view — complete explore scans when at the target POI. */
  private checkExploreScanProgress(): void {
    for (const mission of this.activeMissions) {
      if (mission.kind !== "explore" || mission.scanned) continue;
      if (mission.targetPoiId !== this.local.poiId) continue;
      mission.scanned = true;
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
      if (mission.kind !== "explore") continue;
      if (!mission.scanned) continue;
      if (mission.originStationKey !== here) continue;
      mission.status = "readyToClaim";
    }
  }

  private acceptBoardMission(missionId: string): void {
    if (this.dock.kind !== "docked") return;
    if (this.activeMissions.length >= QUEST.maxActive) {
      this.messages.push(
        `Missions: Already holding ${QUEST.maxActive} contracts — complete one first.`,
        "station",
      );
      return;
    }
    const offer = this.dockMissionOffers.find((o) => o.id === missionId);
    if (!offer || this.acceptedMissionIds.has(missionId)) return;

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
      status: "inProgress",
      scanned: false,
    };
    this.activeMissions.push(active);
    this.acceptedMissionIds.add(offer.id);
    this.messages.push(
      offer.kind === "cargo"
        ? `Missions: Accepted — haul to ${offer.destStationName} (+${offer.reward} cr).`
        : `Missions: Accepted — scan ${offer.targetPoiName}, then return here (+${offer.reward} cr).`,
      "station",
    );
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
      this.messages.push(
        `${station.name}: Survey filed — ${mission.title} (+${mission.reward} cr).`,
        "station",
      );
      this.refreshMissionBoardUi();
      return;
    }

    // Cargo pays on delivery; claim button is unused for cargo.
    this.messages.push("Missions: Deliver the freight at the destination station.", "station");
  }

  private refreshMissionBoardUi(): void {
    if (!this.missionBoardOpen) return;
    this.missionBoard.refresh(
      this.visibleMissionOffers(),
      this.missionsForBoardUi(),
      this.ship.cargo.freeCu,
      this.activeMissions.length < QUEST.maxActive,
    );
  }

  private openMissionBoard(station: Landmark): void {
    this.dockedMenu.hide();
    this.marketMenuOpen = false;
    this.marketMenu.hide();
    this.shipMenuOpen = false;
    this.shipMenu.openView();
    this.syncExploreClaimableAtStation(station);
    this.missionBoard.show(
      station.name,
      this.visibleMissionOffers(),
      this.missionsForBoardUi(),
      this.ship.cargo.freeCu,
      this.activeMissions.length < QUEST.maxActive,
    );
    this.missionBoardOpen = true;
  }

  private closeMissionBoard(): void {
    this.missionBoardOpen = false;
    this.missionBoard.hide();
    if (this.dock.kind === "docked") {
      this.dockedMenu.show(
        this.dock.station.name,
        window.innerWidth,
        window.innerHeight,
        this.dockedQuestUi(this.dock.station),
        this.missionBoardHint(),
      );
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
    }
  }

  private update(dt: number): void {
    this.messages.update(dt);
    this.ship.tickDefense(dt);

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
      } else if (this.marketMenuOpen) {
        this.closeMarketMenu();
      } else if (this.shipMenuOpen) {
        this.closeShipMenu();
      } else if (this.stationMenu.open) {
        this.stationMenu.hide();
      } else if (this.pirateMenu.open) {
        this.pirateMenu.hide();
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
      }
      this.updateStationMenu();
    } else if (this.pirateMenu.open) {
      this.updatePirateMenu();
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
    }

    if (
      this.pirateMenu.open &&
      this.pirateMenu.pirate &&
      !this.pirateMenu.pirate.acceptingPayment
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

    for (const pirate of this.pirates) {
      if (!pirate.acceptingPayment) continue;
      const hitR = COMBAT.pirateRadius + DOCK.clickPad;
      const dist = Math.hypot(world.x - pirate.x, world.y - pirate.y);
      if (dist <= hitR) {
        this.pirateMenu.show(
          pirate,
          this.pointer.x,
          this.pointer.y,
          viewW,
          viewH,
        );
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

    const pirate = this.pirateMenu.pirate;
    if (!pirate || !pirate.acceptingPayment) {
      this.pirateMenu.hide();
      return;
    }

    if (!this.ship.spendCredits(ECONOMY.pirateFee)) {
      this.messages.push(
        `Pirate: Not enough credits. Need ${ECONOMY.pirateFee} cr.`,
        "pirate",
      );
      return;
    }

    pirate.acceptPayment();
    this.paidPirateViews.add(this.pirateKey());
    this.pirateMenu.hide();
    this.messages.push(
      `Pirate: Tribute received (${ECONOMY.pirateFee} cr). Safe passage granted.`,
      "pirate",
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

    if (action === "dock") {
      this.requestDock(station);
    }
  }

  /**
   * Future reputation gate — always clear for now.
   * Hail / dock both consult this so a rep system can plug in later.
   */
  private stationReputationAllowsDock(_station: Landmark): boolean {
    return true;
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
      this.messages.push(
        `${station.name}: Access denied — your standing is too low.`,
        "station",
      );
      return;
    }

    this.dockClearance.add(station.id);
    this.stationMenu.dockEnabled = true;
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
      this.messages.push(
        `${station.name}: Approach rejected — standing insufficient.`,
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
    this.dockMarket = createStationMarket(key);
    const ref = stationRefFromLocal(
      this.galaxy,
      this.local.poiId,
      this.local.bodyId,
      station.id,
      station.name,
    );
    this.dockMissionOffers = ref
      ? generateStationMissions(this.galaxy, ref)
      : [];
    this.dockedMenu.show(
      station.name,
      window.innerWidth,
      window.innerHeight,
      this.dockedQuestUi(station),
      this.missionBoardHint(),
    );
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
      if (this.ship.health >= this.ship.maxHull) {
        this.messages.push(`Repairs complete (−${cost} cr). Hull restored.`);
      } else {
        this.messages.push(
          `Partial repair: +${healed} HP (−${cost} cr). Need more credits for full restore.`,
        );
      }
      return;
    }
    if (action === "acceptQuest") {
      this.acceptPirateQuest(station);
      return;
    }
    if (action === "claimQuest") {
      this.claimPirateQuest(station);
      return;
    }
    if (action === "bay") {
      this.openBay(station);
      return;
    }
    if (action === "market") {
      this.openMarket(station);
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
    this.dockMarket = null;
    this.dockMissionOffers = [];
    this.dock = { kind: "free" };
    // Nudge clear of the station so the ship isn't buried in the hub
    const angle = this.ship.heading;
    this.ship.arriveAt(
      station.x + Math.cos(angle) * (station.radius + SHIP.size * 2),
      station.y + Math.sin(angle) * (station.radius + SHIP.size * 2),
      angle,
    );
    this.messages.push(`Launched from ${station.name}.`);
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
      this.projectiles.push(
        spawnProjectile(
          this.ship.x,
          this.ship.y,
          this.ship.heading,
          SHIP.size,
          false,
        ),
      );
      this.ship.loadout.consumeAmmo();
      this.fireCooldown = this.ship.loadout.fireCooldown();
    }

    const pirateShots: Projectile[] = [];
    for (const pirate of this.pirates) {
      const demanded = pirate.update(
        dt,
        this.ship.x,
        this.ship.y,
        pirateShots,
      );
      if (demanded) {
        this.messages.push(
          `Pirate: Pay ${ECONOMY.pirateFee} credits for safe passage — you have one minute.`,
          "pirate",
        );
      }
    }
    if (pirateShots.length > 0) {
      this.projectiles.push(...pirateShots);
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
            this.ship.takeDamage(COMBAT.projectileDamage);
            this.projectiles.splice(i, 1);
          }
        }
        continue;
      }

      let hit = false;
      for (const pirate of this.pirates) {
        if (!pirate.alive) continue;
        const dist = Math.hypot(p.x - pirate.x, p.y - pirate.y);
        if (dist <= COMBAT.pirateRadius + COMBAT.projectileRadius) {
          pirate.takeDamage(COMBAT.projectileDamage);
          hit = true;
          break;
        }
      }
      if (hit) this.projectiles.splice(i, 1);
    }

    for (const pirate of this.pirates) {
      if (!pirate.alive) {
        // Escape (warp) clears the slot but does not pay redemption.
        this.onPirateRemoved(pirate.health <= 0);
      }
    }
    this.pirates = this.pirates.filter((p) => p.alive);
  }

  private updateGalaxyMenu(): void {
    if (!this.pointer.consumeClick()) return;
    const jumpRange = this.ship.loadout.jumpRange();
    const result = this.chart.handleClick(
      this.galaxy,
      this.local.poiId,
      this.pointer.x,
      this.pointer.y,
      jumpRange,
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
    this.marketMenuOpen = false;
    this.marketMenu.hide();
    this.missionBoardOpen = false;
    this.missionBoard.hide();
    if (this.dock.kind === "docked") {
      this.dockedMenu.hide();
    }
    this.shipMenu.openView();
    this.shipMenuOpen = true;
  }

  private openBay(station: Landmark): void {
    const key =
      this.currentStationKey(station) ??
      `visit:${this.local.poiId}:${station.id}`;
    this.dockedMenu.hide();
    this.marketMenuOpen = false;
    this.marketMenu.hide();
    this.missionBoardOpen = false;
    this.missionBoard.hide();
    this.shipMenu.openBay(stationBayStock(key));
    this.shipMenuOpen = true;
  }

  private openMarket(station: Landmark): void {
    if (!this.dockMarket) {
      const key =
        this.currentStationKey(station) ??
        `visit:${this.local.poiId}:${station.id}`;
      this.dockMarket = createStationMarket(key);
    }
    this.dockedMenu.hide();
    this.shipMenuOpen = false;
    this.shipMenu.openView();
    this.missionBoardOpen = false;
    this.missionBoard.hide();
    this.marketMenu.show(station.name, this.dockMarket);
    this.marketMenuOpen = true;
  }

  private closeMarketMenu(): void {
    this.marketMenuOpen = false;
    this.marketMenu.hide();
    if (this.dock.kind === "docked") {
      this.dockedMenu.show(
        this.dock.station.name,
        window.innerWidth,
        window.innerHeight,
        this.dockedQuestUi(this.dock.station),
        this.missionBoardHint(),
      );
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

    const listing = this.dockMarket?.listing(result.commodityId);
    if (!listing) return;

    if (result.action === "buy") {
      if (listing.playerBuyPrice === null) return;
      const cost = listing.playerBuyPrice * result.cu;
      if (result.cu > listing.stock) {
        this.messages.push("Market: Not enough stock.", "station");
        return;
      }
      if (!this.ship.cargo.canStow(result.cu)) {
        this.messages.push("Market: Not enough cargo space.", "station");
        return;
      }
      if (!this.ship.spendCredits(cost)) {
        this.messages.push("Market: Insufficient credits.", "station");
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
        this.messages.push("Market: Cargo stow failed.", "station");
        return;
      }
      listing.stock -= result.cu;
      this.messages.push(
        `Market: Bought ${result.cu} CU ${listing.name} (−${cost} cr).`,
        "station",
      );
      return;
    }

    if (result.action === "sell") {
      if (listing.playerSellPrice === null) return;
      if (result.cu > listing.demand) {
        this.messages.push("Market: Demand filled.", "station");
        return;
      }
      const removed = this.ship.cargo.remove(listing.commodityId, result.cu);
      if (removed <= 0) {
        this.messages.push("Market: You are not carrying that.", "station");
        return;
      }
      const payout = listing.playerSellPrice * removed;
      this.ship.addCredits(payout);
      listing.demand -= removed;
      this.messages.push(
        `Market: Sold ${removed} CU ${listing.name} (+${payout} cr).`,
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
      this.dockedMenu.show(
        dockedStation.name,
        window.innerWidth,
        window.innerHeight,
        this.dockedQuestUi(dockedStation),
        this.missionBoardHint(),
      );
    }
  }

  private tryInstallModule(module: EquipModule): void {
    const slot = this.ship.loadout.slots[this.shipMenu.selectedIndex];
    if (!slot || module.kind !== slot.kind) return;
    if (slot.equipped?.id === module.id) return;

    const cost = swapCost(slot.equipped, module);
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
    this.messages.push(
      cost > 0
        ? `Bay: Fitted ${module.name} (−${cost} cr). Replaced ${previous}.`
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
    );
    if (result === "close") {
      this.closeShipMenu();
      return;
    }
    if (result && typeof result === "object" && result.action === "install") {
      this.tryInstallModule(result.module);
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
      const jumpRange = this.ship.loadout.jumpRange();
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
      panel: this.panel,
      galaxy: this.galaxy,
      chart: this.chart,
      shipMenu: this.shipMenu,
      marketMenu: this.marketMenu,
      missionBoard: this.missionBoard,
      messages: this.messages,
      stationMenu: this.stationMenu,
      dockedMenu: this.dockedMenu,
      pirateMenu: this.pirateMenu,
      pointerX: this.pointer.x,
      pointerY: this.pointer.y,
      fadeAlpha: this.fadeAlpha,
    });
  }
}
