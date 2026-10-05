import { BODY_COLORS, COMBAT, LOCAL, SHIP, STARS } from "../game/config";
import { STAR_COLORS } from "../galaxy/generateLocal";
import type { Landmark, LocalView } from "../galaxy/types";
import type { Ship } from "../entities/Ship";
import type { Pirate } from "../entities/Pirate";
import type { FuelRat } from "../entities/FuelRat";
import type { StrandedPilot } from "../entities/StrandedPilot";
import type { StationPatrol } from "../entities/StationPatrol";
import type { Projectile } from "../entities/Projectile";
import type { Camera } from "../world/Camera";
import type { Starfield } from "../world/Starfield";
import { Hud, type WeaponHudRow } from "../ui/Hud";
import type { GameOverScreen, StartScreen } from "../ui/RunScreens";
import { FONT, FONT_TITLE, drawButton, drawPanel, hit, type Rect } from "../ui/menu";
import { galacticFuelCost } from "../ship/fuel";
import type { GalaxyChart, ChartPoiHints } from "../ui/GalaxyChart";
import type { SystemPanel } from "../ui/SystemPanel";
import type { MessageSidebar } from "../ui/MessageSidebar";
import type { StationContextMenu } from "../ui/StationContextMenu";
import type { DockedMenu } from "../ui/DockedMenu";
import type { PirateFeeMenu } from "../ui/PirateFeeMenu";
import type { PatrolFineMenu } from "../ui/PatrolFineMenu";
import type { ShipMenu } from "../ui/ShipMenu";
import type { MarketMenu } from "../ui/MarketMenu";
import type { MissionBoardMenu } from "../ui/MissionBoardMenu";
import type { HangarMenu } from "../ui/HangarMenu";
import type { ActiveMission } from "../ship/missions";
import { occupiedPassengerBerths } from "../ship/missions";
import type { ReputationListing } from "../ship/reputation";
import type { Galaxy } from "../galaxy/Galaxy";

export class Renderer {
  private readonly hud = new Hud();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
  ) {}

  resizeToDisplay(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(args: {
    ship: Ship;
    camera: Camera;
    starfield: Starfield;
    local: LocalView;
    pirates: Pirate[];
    fuelRat: FuelRat | null;
    strandedPilot?: StrandedPilot | null;
    fuelWarn: {
      cost: number;
      fuel: number;
      kind: "galaxy" | "body";
    } | null;
    fuelWarnYes: Rect;
    fuelWarnNo: Rect;
    patrols: StationPatrol[];
    /** World position of the missile cursor-lock, if a missile is equipped. */
    missileLock: { x: number; y: number } | null;
    projectiles: Projectile[];
    alpha: number;
    thrusting: boolean;
    chartOpen: boolean;
    panelOpen: boolean;
    shipMenuOpen: boolean;
    marketMenuOpen: boolean;
    missionBoardOpen: boolean;
    hangarMenuOpen: boolean;
    chartHints: ChartPoiHints;
    activeMissions: readonly ActiveMission[];
    reputationListing: ReputationListing;
    panel: SystemPanel;
    galaxy: Galaxy;
    chart: GalaxyChart;
    shipMenu: ShipMenu;
    marketMenu: MarketMenu;
    missionBoard: MissionBoardMenu;
    hangarMenu: HangarMenu;
    messages: MessageSidebar;
    stationMenu: StationContextMenu;
    dockedMenu: DockedMenu;
    pirateMenu: PirateFeeMenu;
    patrolMenu: PatrolFineMenu;
    pointerX: number;
    pointerY: number;
    fadeAlpha: number;
    weaponRows: readonly (WeaponHudRow | null)[];
  }): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ctx = this.ctx;

    ctx.fillStyle = "#05070c";
    ctx.fillRect(0, 0, w, h);

    args.starfield.draw(ctx, w, h);
    // Belts: Ore Scanner range + scan+scoop prospecting.
    // Derelict debris: Cargo Scoop range only (mission scoop; nearby ring like belts).
    const atDerelict = args.local.focus.kind === "derelict";
    this.drawLocal(
      args.local,
      args.camera,
      w,
      h,
      args.ship.x,
      args.ship.y,
      atDerelict
        ? args.ship.loadout.scoopRange
        : args.ship.loadout.mineralScanRange,
      atDerelict
        ? args.ship.loadout.scoopRange > 0
        : args.ship.loadout.canProspectBelts,
    );

    const pose = args.ship.sample(args.alpha);
    const shipScreen = args.camera.worldToScreen(pose.x, pose.y, w, h);

    for (const pirate of args.pirates) {
      if (!pirate.alive) continue;
      const p = args.camera.worldToScreen(pirate.x, pirate.y, w, h);
      if (this.isOnScreen(p.x, p.y, w, h)) {
        this.drawPirate(p.x, p.y, pirate);
      } else if (!args.chartOpen && !args.panelOpen && !args.shipMenuOpen && !args.marketMenuOpen && !args.missionBoardOpen && !args.hangarMenuOpen) {
        this.drawOffscreenPirateMarker(shipScreen.x, shipScreen.y, p.x, p.y, w, h);
      }
    }

    if (args.fuelRat && args.fuelRat.alive) {
      const p = args.camera.worldToScreen(args.fuelRat.x, args.fuelRat.y, w, h);
      if (this.isOnScreen(p.x, p.y, w, h)) {
        this.drawFuelRat(p.x, p.y, args.fuelRat);
      }
    }

    if (args.strandedPilot?.alive) {
      const p = args.camera.worldToScreen(
        args.strandedPilot.x,
        args.strandedPilot.y,
        w,
        h,
      );
      if (this.isOnScreen(p.x, p.y, w, h)) {
        this.drawStrandedPilot(p.x, p.y, args.strandedPilot);
      }
    }

    for (const patrol of args.patrols) {
      if (!patrol.alive) continue;
      const p = args.camera.worldToScreen(patrol.x, patrol.y, w, h);
      if (this.isOnScreen(p.x, p.y, w, h)) {
        this.drawPatrol(p.x, p.y, patrol);
      }
    }

    if (args.missileLock && !args.chartOpen && !args.panelOpen && !args.shipMenuOpen) {
      const p = args.camera.worldToScreen(
        args.missileLock.x,
        args.missileLock.y,
        w,
        h,
      );
      this.drawMissileReticle(p.x, p.y);
    }

    for (const shot of args.projectiles) {
      const p = args.camera.worldToScreen(shot.x, shot.y, w, h);
      this.drawProjectile(p.x, p.y, shot);
    }

    if (args.ship.alive) {
      this.drawShip(
        shipScreen.x,
        shipScreen.y,
        pose.heading,
        args.thrusting,
        args.ship.hull.size,
        args.ship.hull.fill,
        args.ship.hull.stroke,
      );
    }

    if (args.chartOpen) {
      {
        let costForSelected: number | null = null;
        if (args.chart.selectedId !== null) {
          const cur = args.galaxy.get(args.local.poiId);
          const sel = args.galaxy.get(args.chart.selectedId);
          costForSelected = galacticFuelCost(args.galaxy.distance(cur, sel));
        }
        args.chart.draw(
          ctx,
          args.galaxy,
          args.local.poiId,
          w,
          h,
          args.pointerX,
          args.pointerY,
          args.ship.jumpRange(),
          args.chartHints,
          { fuel: args.ship.fuel, costForSelected },
        );
      }
    } else if (args.panelOpen) {
      args.panel.draw(ctx, args.local, w, h, args.pointerX, args.pointerY);
    } else if (args.shipMenuOpen) {
      args.shipMenu.draw(
        ctx,
        args.ship.loadout,
        args.ship.credits,
        w,
        h,
        args.pointerX,
        args.pointerY,
        args.ship.hull.name,
        args.ship.cargo,
        args.activeMissions,
        args.reputationListing,
      );
    } else if (args.marketMenuOpen) {
      args.marketMenu.draw(
        ctx,
        args.ship.cargo,
        args.ship.credits,
        w,
        h,
        args.pointerX,
        args.pointerY,
      );
    } else if (args.missionBoardOpen) {
      args.missionBoard.draw(
        ctx,
        args.ship.credits,
        w,
        h,
        args.pointerX,
        args.pointerY,
      );
    } else if (args.hangarMenuOpen) {
      args.hangarMenu.draw(
        ctx,
        args.ship.fleet,
        args.ship.credits,
        args.ship.hull.name,
        w,
        h,
        args.pointerX,
        args.pointerY,
      );
    } else {
      this.hud.draw(ctx, {
        health: args.ship.health,
        maxHealth: args.ship.maxHull,
        plating: args.ship.plating,
        maxPlating: args.ship.maxPlating,
        shield: args.ship.shield,
        maxShield: args.ship.maxShield,
        shieldBreakRemaining: args.ship.shieldBreakRemaining,
        fuel: args.ship.fuel,
        maxFuel: args.ship.maxFuel,
        cargoUsed: args.ship.cargo.usedCu,
        cargoCapacity: args.ship.cargo.capacityCu,
        passengerUsed: occupiedPassengerBerths(args.activeMissions),
        passengerCapacity: args.ship.passengerCapacity,
        credits: args.ship.credits,
        weapons: args.weaponRows,
        heat: args.ship.heat,
        heatSinkCapacity: args.ship.heatSinkCapacity,
        poiName: args.local.poiName,
        locationName: args.local.locationName,
        poiType: args.local.poiType,
        starClass: args.local.starClass,
        menuOpen: false,
        inBelt: args.local.focus.kind === "asteroidBelt",
        canProspect: args.ship.loadout.canProspectBelts,
        inDerelict: args.local.focus.kind === "derelict",
        hasScoop: args.ship.loadout.scoopRange > 0,
        derelictScoopHint: args.local.beltRocks?.some(
          (r) => r.yieldId === "derelict_cargo" && r.remaining > 0,
        ),
        surveyScanHint: args.activeMissions.some(
          (m) =>
            (m.kind === "explore" || m.kind === "rebelScan") &&
            !m.scanned &&
            m.targetPoiId === args.local.poiId,
        ),
        hasSurveyScanner: args.ship.loadout.hasPoiScan,
      });
      args.messages.draw(ctx, w, h, args.pointerX, args.pointerY);
      args.stationMenu.draw(
        ctx,
        args.pointerX,
        args.pointerY,
        args.ship.credits,
      );
      args.pirateMenu.draw(
        ctx,
        args.pointerX,
        args.pointerY,
        args.ship.credits,
      );
      args.patrolMenu.draw(
        ctx,
        args.pointerX,
        args.pointerY,
        args.ship.credits,
      );
      args.dockedMenu.draw(ctx, args.pointerX, args.pointerY);
    }

    if (args.fuelWarn) {
      this.drawFuelWarn(
        ctx,
        w,
        h,
        args.fuelWarn,
        args.fuelWarnYes,
        args.fuelWarnNo,
        args.pointerX,
        args.pointerY,
      );
    }

    if (args.fadeAlpha > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, args.fadeAlpha)})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /** Starfield and title card. Flight world stays hidden until Begin. */
  drawTitle(
    starfield: Starfield,
    screen: StartScreen,
    pointerX: number,
    pointerY: number,
  ): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ctx = this.ctx;
    ctx.fillStyle = "#05070c";
    ctx.fillRect(0, 0, w, h);
    starfield.draw(ctx, w, h);
    ctx.fillStyle = "rgba(5, 7, 12, 0.62)";
    ctx.fillRect(0, 0, w, h);
    screen.draw(ctx, w, h, pointerX, pointerY);
  }

  /** Dim the frozen flight view and show the ship-destroyed card. */
  drawGameOver(
    screen: GameOverScreen,
    pointerX: number,
    pointerY: number,
  ): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(5, 7, 12, 0.55)";
    ctx.fillRect(0, 0, w, h);
    screen.draw(ctx, w, h, pointerX, pointerY);
  }

  private drawFuelWarn(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    warn: { cost: number; fuel: number; kind: "galaxy" | "body" },
    yesBtn: Rect,
    noBtn: Rect,
    pointerX: number,
    pointerY: number,
  ): void {
    const box: Rect = {
      x: Math.floor(w / 2 - 220),
      y: Math.floor(h / 2 - 90),
      w: 440,
      h: 180,
    };
    drawPanel(ctx, box);
    ctx.font = FONT_TITLE;
    ctx.fillStyle = "rgba(230, 210, 160, 0.95)";
    ctx.textBaseline = "top";
    ctx.fillText("Low fuel warning", box.x + 24, box.y + 20);
    ctx.font = FONT;
    ctx.fillStyle = "rgba(200, 210, 230, 0.92)";
    const trip = warn.kind === "galaxy" ? "jump" : "supercruise hop";
    ctx.fillText(
      `This ${trip} costs ${warn.cost} fuel (you have ${Math.floor(warn.fuel)}).`,
      box.x + 24,
      box.y + 58,
    );
    ctx.fillText(
      "You would not have enough left for the same trip back.",
      box.x + 24,
      box.y + 78,
    );
    yesBtn.x = box.x + 24;
    yesBtn.y = box.y + box.h - 52;
    yesBtn.w = 120;
    yesBtn.h = 34;
    noBtn.x = box.x + 160;
    noBtn.y = box.y + box.h - 52;
    noBtn.w = 120;
    noBtn.h = 34;
    drawButton(ctx, yesBtn, "Continue", {
      primary: true,
      hover: hit(yesBtn, pointerX, pointerY),
    });
    drawButton(ctx, noBtn, "Cancel", {
      hover: hit(noBtn, pointerX, pointerY),
    });
  }

  private drawFuelRat(x: number, y: number, rat: FuelRat): void {
    const size = rat.size;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rat.heading);
    ctx.beginPath();
    traceHull(ctx, rat.hullId, size);
    ctx.closePath();
    ctx.fillStyle = rat.fill;
    ctx.fill();
    ctx.strokeStyle = rat.stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  private drawStrandedPilot(x: number, y: number, pilot: StrandedPilot): void {
    const size = pilot.size;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(pilot.heading);
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.7, size * 0.55);
    ctx.lineTo(-size * 0.35, 0);
    ctx.lineTo(-size * 0.7, -size * 0.55);
    ctx.closePath();
    ctx.fillStyle = pilot.fill;
    ctx.fill();
    ctx.strokeStyle = pilot.stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  private drawProjectile(x: number, y: number, shot: Projectile): void {
    const ctx = this.ctx;
    if (shot.family === "cannon") {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(shot.heading);
      ctx.fillStyle = shot.hostile
        ? "rgba(255, 150, 90, 0.95)"
        : "rgba(255, 214, 140, 0.95)";
      ctx.fillRect(-7, -2.4, 14, 4.8);
      ctx.restore();
      return;
    }
    if (shot.family === "missile") {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(shot.heading);
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-5, 3.2);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-5, -3.2);
      ctx.closePath();
      ctx.fillStyle = shot.hostile
        ? "rgba(255, 170, 120, 0.95)"
        : "rgba(140, 220, 255, 0.95)";
      ctx.fill();
      ctx.restore();
      return;
    }
    const radius = shot.family === "gun" ? 1.6 : COMBAT.projectileRadius;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = shot.hostile
      ? "rgba(255, 140, 110, 0.95)"
      : shot.family === "gun"
        ? "rgba(210, 225, 245, 0.9)"
        : "rgba(220, 240, 255, 0.95)";
    ctx.fill();
  }

  private drawMissileReticle(x: number, y: number): void {
    const ctx = this.ctx;
    const s = 16;
    ctx.save();
    ctx.strokeStyle = "rgba(140, 220, 255, 0.95)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s + 5);
    ctx.lineTo(x - s, y - s);
    ctx.lineTo(x - s + 5, y - s);
    ctx.moveTo(x + s - 5, y - s);
    ctx.lineTo(x + s, y - s);
    ctx.lineTo(x + s, y - s + 5);
    ctx.moveTo(x + s, y + s - 5);
    ctx.lineTo(x + s, y + s);
    ctx.lineTo(x + s - 5, y + s);
    ctx.moveTo(x - s + 5, y + s);
    ctx.lineTo(x - s, y + s);
    ctx.lineTo(x - s, y + s - 5);
    ctx.stroke();
    ctx.restore();
  }

  private isOnScreen(x: number, y: number, w: number, h: number): boolean {
    const m = COMBAT.offscreenMargin;
    return x >= m && x <= w - m && y >= m && y <= h - m;
  }

  /**
   * Invisible player→pirate ray; place a chevron where it meets the screen edge.
   */
  private drawOffscreenPirateMarker(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    w: number,
    h: number,
  ): void {
    const edge = intersectScreenEdge(
      fromX,
      fromY,
      toX,
      toY,
      COMBAT.offscreenMargin,
      w,
      h,
    );
    if (!edge) return;

    const ctx = this.ctx;
    const size = 9;
    ctx.save();
    ctx.translate(edge.x, edge.y);
    ctx.rotate(edge.angle);
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.7, size * 0.75);
    ctx.lineTo(-size * 0.7, -size * 0.75);
    ctx.closePath();
    ctx.fillStyle = "rgba(220, 90, 70, 0.9)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 180, 160, 0.7)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  private drawPirate(x: number, y: number, pirate: Pirate): void {
    this.drawNpcHull(x, y, pirate);
  }

  /** Same hull silhouette as a pirate of that body, with a law-blue stroke. */
  private drawPatrol(x: number, y: number, patrol: StationPatrol): void {
    this.drawNpcHull(x, y, patrol);
  }

  private drawNpcHull(
    x: number,
    y: number,
    npc: {
      heading: number;
      hullId: string;
      size: number;
      fill: string;
      stroke: string;
      health: number;
      maxHealth: number;
      shield: number;
      maxShield: number;
      plating: number;
      maxPlating: number;
    },
  ): void {
    const size = npc.size;
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(npc.heading);
    ctx.beginPath();
    traceHull(ctx, npc.hullId, size);
    ctx.closePath();
    ctx.fillStyle = npc.fill;
    ctx.fill();
    ctx.strokeStyle = npc.stroke;
    ctx.lineWidth = npc.hullId === "bulwark" ? 2 : 1.5;
    ctx.stroke();
    ctx.restore();

    const barW = Math.max(18, size + 8);
    const left = x - barW / 2;
    let barY = y - size - 8;
    const banks: { max: number; value: number; color: string }[] = [
      { max: npc.maxHealth, value: npc.health, color: "#e07060" },
      { max: npc.maxPlating, value: npc.plating, color: "#d4c4a0" },
      { max: npc.maxShield, value: npc.shield, color: "#7ec8ff" },
    ];
    for (const bank of banks) {
      if (bank.max <= 0) continue;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(left, barY, barW, 3);
      ctx.fillStyle = bank.color;
      const ratio = Math.max(0, Math.min(1, bank.value / bank.max));
      ctx.fillRect(left, barY, barW * ratio, 3);
      barY -= 5;
    }
  }

  private drawLocal(
    local: LocalView,
    camera: Camera,
    width: number,
    height: number,
    shipX: number,
    shipY: number,
    scanRange: number,
    prospecting: boolean,
  ): void {
    this.drawLandmark(
      local.focus,
      local,
      camera,
      width,
      height,
      shipX,
      shipY,
      scanRange,
      prospecting,
    );
    for (const c of local.companions) {
      this.drawLandmark(
        c,
        local,
        camera,
        width,
        height,
        shipX,
        shipY,
        scanRange,
        prospecting,
      );
    }
  }

  private drawLandmark(
    body: Landmark,
    local: LocalView,
    camera: Camera,
    width: number,
    height: number,
    shipX: number,
    shipY: number,
    scanRange: number,
    prospecting: boolean,
  ): void {
    const p = camera.worldToScreen(body.x, body.y, width, height);
    const margin =
      body.kind === "asteroidBelt"
        ? body.radius + LOCAL.beltThickness + 80
        : body.kind === "derelict"
          ? body.radius * 10
          : 220;
    if (
      p.x < -margin ||
      p.y < -margin ||
      p.x > width + margin ||
      p.y > height + margin
    ) {
      return;
    }

    switch (body.kind) {
      case "star":
        this.drawStar(
          p.x,
          p.y,
          body.radius,
          STAR_COLORS[local.starClass ?? "G"],
        );
        break;
      case "molten":
        this.drawWorld(p.x, p.y, body.radius, BODY_COLORS.molten, true);
        break;
      case "habitable":
        this.drawHabitable(p.x, p.y, body.radius, body.id + local.poiId * 31);
        break;
      case "rocky":
        this.drawWorld(p.x, p.y, body.radius, BODY_COLORS.rocky, false);
        break;
      case "gasGiant":
        this.drawGasGiant(p.x, p.y, body.radius, body.id + local.poiId * 47);
        break;
      case "ice":
        this.drawWorld(p.x, p.y, body.radius, BODY_COLORS.ice, false);
        break;
      case "asteroidBelt":
        this.drawBeltRocks(
          local,
          camera,
          width,
          height,
          shipX,
          shipY,
          scanRange,
          prospecting,
        );
        break;
      case "station":
        this.drawStation(p.x, p.y, body.radius);
        break;
      case "debris":
        this.drawDebris(p.x, p.y, body.radius, local.poiType === "nebula");
        break;
      case "blackHole":
        this.drawBlackHole(p.x, p.y, body.radius);
        break;
      case "derelict":
        this.drawDerelict(
          p.x,
          p.y,
          body.radius,
          body.id + local.poiId * 23,
          local,
          camera,
          width,
          height,
          shipX,
          shipY,
          scanRange,
          prospecting,
        );
        break;
      case "neutronStar":
        this.drawNeutronStar(p.x, p.y, body.radius);
        break;
      case "brownDwarf":
        this.drawStar(p.x, p.y, body.radius, STARS.colors.M);
        break;
      case "roguePlanet":
        this.drawWorld(p.x, p.y, body.radius, "#6a7585", false);
        break;
      case "nebula":
        this.drawNebulaCore(p.x, p.y, body.radius);
        break;
    }
  }

  private drawStar(x: number, y: number, radius: number, color: string): void {
    const ctx = this.ctx;
    const glow = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius * 2.4);
    glow.addColorStop(0, color);
    glow.addColorStop(0.35, `${color}55`);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  private drawWorld(
    x: number,
    y: number,
    radius: number,
    color: string,
    glow: boolean,
  ): void {
    const ctx = this.ctx;
    if (glow) {
      const g = ctx.createRadialGradient(x, y, radius * 0.3, x, y, radius * 1.8);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  private drawHabitable(x: number, y: number, radius: number, seed: number): void {
    const ctx = this.ctx;

    // Thin atmosphere halo
    const atmo = ctx.createRadialGradient(x, y, radius * 0.92, x, y, radius * 1.28);
    atmo.addColorStop(0, "rgba(140, 190, 230, 0.0)");
    atmo.addColorStop(0.55, "rgba(120, 180, 230, 0.18)");
    atmo.addColorStop(1, "rgba(100, 160, 220, 0)");
    ctx.fillStyle = atmo;
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.28, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();

    // Ocean base
    const ocean = ctx.createRadialGradient(
      x - radius * 0.2,
      y - radius * 0.25,
      radius * 0.15,
      x,
      y,
      radius,
    );
    ocean.addColorStop(0, "#5a9ec8");
    ocean.addColorStop(0.55, "#2f6a9a");
    ocean.addColorStop(1, "#1a4068");
    ctx.fillStyle = ocean;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

    // Continents — soft irregular landmasses
    const landCount = 3 + ((hash2(seed, 1) * 3) | 0);
    for (let i = 0; i < landCount; i += 1) {
      const h1 = hash2(seed, i * 5 + 2);
      const h2 = hash2(seed, i * 5 + 3);
      const h3 = hash2(seed, i * 5 + 4);
      const cx = x + (h1 - 0.5) * radius * 1.35;
      const cy = y + (h2 - 0.5) * radius * 1.35;
      const rw = radius * (0.28 + h3 * 0.38);
      const rh = radius * (0.2 + hash2(seed, i * 5 + 5) * 0.32);
      const rot = h1 * Math.PI;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      // Layered ellipses for less blob-circular look
      ctx.fillStyle =
        h2 > 0.55 ? "rgba(62, 120, 72, 0.95)" : "rgba(78, 140, 85, 0.92)";
      ctx.beginPath();
      ctx.ellipse(0, 0, rw, rh, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(45, 95, 58, 0.55)";
      ctx.beginPath();
      ctx.ellipse(-rw * 0.2, rh * 0.1, rw * 0.55, rh * 0.45, 0.4, 0, Math.PI * 2);
      ctx.fill();
      // Dry / highland tint
      if (h3 > 0.6) {
        ctx.fillStyle = "rgba(150, 140, 95, 0.35)";
        ctx.beginPath();
        ctx.ellipse(rw * 0.15, -rh * 0.2, rw * 0.35, rh * 0.25, -0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Polar ice
    const iceN = ctx.createRadialGradient(x, y - radius * 0.75, 0, x, y - radius * 0.55, radius * 0.55);
    iceN.addColorStop(0, "rgba(235, 245, 255, 0.85)");
    iceN.addColorStop(1, "rgba(235, 245, 255, 0)");
    ctx.fillStyle = iceN;
    ctx.beginPath();
    ctx.ellipse(x, y - radius * 0.72, radius * 0.55, radius * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    const iceS = ctx.createRadialGradient(x, y + radius * 0.75, 0, x, y + radius * 0.55, radius * 0.5);
    iceS.addColorStop(0, "rgba(225, 238, 250, 0.7)");
    iceS.addColorStop(1, "rgba(225, 238, 250, 0)");
    ctx.fillStyle = iceS;
    ctx.beginPath();
    ctx.ellipse(x, y + radius * 0.74, radius * 0.48, radius * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();

    // Soft cloud streaks
    for (let i = 0; i < 4; i += 1) {
      const h = hash2(seed, 80 + i);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.08 + h * 0.1})`;
      ctx.beginPath();
      ctx.ellipse(
        x + (h - 0.5) * radius * 0.9,
        y + (hash2(seed, 90 + i) - 0.5) * radius * 0.8,
        radius * (0.25 + h * 0.3),
        radius * 0.06,
        h * 0.5,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // Limb darkening
    const limb = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius);
    limb.addColorStop(0, "rgba(0,0,0,0)");
    limb.addColorStop(1, "rgba(8, 20, 40, 0.4)");
    ctx.fillStyle = limb;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(180, 220, 240, 0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  private drawGasGiant(x: number, y: number, radius: number, seed: number): void {
    const ctx = this.ctx;
    const palette = GAS_GIANT_PALETTES[(hash2(seed, 1) * GAS_GIANT_PALETTES.length) | 0]!;
    const tilt = -0.12 + hash2(seed, 2) * 0.35;
    const hasDisc = hash2(seed, 3) < 0.14; // rare debris disc / ring

    if (hasDisc) {
      const ringA = `rgba(${palette.ring}, 0.35)`;
      const ringB = `rgba(${palette.ring}, 0.18)`;
      ctx.beginPath();
      ctx.ellipse(x, y, radius * 1.85, radius * 0.42, tilt, Math.PI, Math.PI * 2);
      ctx.strokeStyle = ringA;
      ctx.lineWidth = Math.max(1.5, radius * 0.06);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x, y, radius * 1.85, radius * 0.42, tilt, Math.PI, Math.PI * 2);
      ctx.strokeStyle = ringB;
      ctx.lineWidth = Math.max(3, radius * 0.12);
      ctx.stroke();
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();

    const base = ctx.createRadialGradient(
      x - radius * 0.25,
      y - radius * 0.3,
      radius * 0.1,
      x,
      y,
      radius * 1.15,
    );
    base.addColorStop(0, palette.hi);
    base.addColorStop(0.45, palette.mid);
    base.addColorStop(1, palette.lo);
    ctx.fillStyle = base;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

    for (let i = 0; i < palette.bands.length; i += 1) {
      const b = palette.bands[i]!;
      const yOff = -0.7 + hash2(seed, 10 + i) * 0.08 + i * 0.22;
      const h = 0.09 + hash2(seed, 20 + i) * 0.08;
      ctx.fillStyle = b;
      ctx.fillRect(x - radius, y + yOff * radius, radius * 2, h * radius);
    }

    const limb = ctx.createRadialGradient(x, y, radius * 0.55, x, y, radius);
    limb.addColorStop(0, "rgba(0,0,0,0)");
    limb.addColorStop(1, palette.limb);
    ctx.fillStyle = limb;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (hasDisc) {
      ctx.beginPath();
      ctx.ellipse(x, y, radius * 1.85, radius * 0.42, tilt, 0, Math.PI);
      ctx.strokeStyle = `rgba(${palette.ring}, 0.45)`;
      ctx.lineWidth = Math.max(1.5, radius * 0.06);
      ctx.stroke();
    }
  }

  private drawBeltRocks(
    local: LocalView,
    camera: Camera,
    width: number,
    height: number,
    shipX: number,
    shipY: number,
    scanRange: number,
    prospecting: boolean,
  ): void {
    const rocks = local.beltRocks;
    if (!rocks || rocks.length === 0) return;
    const ctx = this.ctx;
    const canScan = scanRange > 0;

    for (const rock of rocks) {
      const sp = camera.worldToScreen(rock.x, rock.y, width, height);
      if (
        sp.x < -20 ||
        sp.y < -20 ||
        sp.x > width + 20 ||
        sp.y > height + 20
      ) {
        continue;
      }

      const dist = Math.hypot(rock.x - shipX, rock.y - shipY);
      const isDerelictCargo = rock.yieldId === "derelict_cargo";
      // Same nearby rule as belt veins: ring only within scan/scoop range.
      const scanned =
        canScan &&
        rock.yieldId !== null &&
        rock.remaining > 0 &&
        dist <= scanRange;
      const scoopable = prospecting && scanned;

      const tone = 100 + ((rock.id * 37) % 55);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, rock.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${tone * 0.88}, ${tone * 0.85}, ${tone * 0.92})`;
      ctx.fill();

      if (scoopable) {
        const ring = isDerelictCargo
          ? "rgba(220, 170, 90, 0.9)"
          : rock.yieldId === "precious_metals"
            ? "rgba(230, 190, 80, 0.85)"
            : rock.yieldId === "alloys"
              ? "rgba(140, 200, 230, 0.8)"
              : "rgba(160, 180, 150, 0.7)";
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, rock.r + 3.5, 0, Math.PI * 2);
        ctx.strokeStyle = ring;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (scanned && !isDerelictCargo) {
        // Scanner alone (belts): dim ping, no scoop ring.
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, rock.r + 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(180, 200, 220, 0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  private drawAnnularDebris(
    x: number,
    y: number,
    inner: number,
    outer: number,
    count: number,
    seed: number,
  ): void {
    const ctx = this.ctx;
    const placed: { x: number; y: number; r: number }[] = [];
    let attempts = 0;
    const maxAttempts = count * 50;
    const minGap = 10;

    while (placed.length < count && attempts < maxAttempts) {
      const h1 = hash2(seed, attempts * 3 + 1);
      const h2 = hash2(seed, attempts * 3 + 2);
      const h3 = hash2(seed, attempts * 3 + 3);
      attempts += 1;

      const angle = h1 * Math.PI * 2;
      const dist = inner + (outer - inner) * Math.pow(h2, 0.65);
      const size = 1.2 + h3 * 3.5;
      const rx = x + Math.cos(angle) * dist;
      const ry = y + Math.sin(angle) * dist;

      let ok = true;
      for (const p of placed) {
        if (Math.hypot(rx - p.x, ry - p.y) < p.r + size + minGap) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      placed.push({ x: rx, y: ry, r: size });
      drawIrregularRock(
        ctx,
        rx,
        ry,
        size,
        h1 * Math.PI * 2,
        seed + attempts * 19,
        0.4 + h2 * 0.4,
      );
    }
  }

  private drawNeutronStar(x: number, y: number, radius: number): void {
    const ctx = this.ctx;
    const coreR = Math.max(3, radius * 0.35);
    const beamAngle = -0.55;
    const beamLen = radius * 5.5;

    // Soft magnetosphere
    const magnet = ctx.createRadialGradient(x, y, coreR, x, y, radius * 2.8);
    magnet.addColorStop(0, "rgba(180, 230, 255, 0.35)");
    magnet.addColorStop(0.35, "rgba(100, 170, 220, 0.12)");
    magnet.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = magnet;
    ctx.beginPath();
    ctx.arc(x, y, radius * 2.8, 0, Math.PI * 2);
    ctx.fill();

    // Pulsar beams (opposing cones along magnetic axis)
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(beamAngle);
    for (const dir of [1, -1]) {
      const beam = ctx.createLinearGradient(0, 0, 0, dir * beamLen);
      beam.addColorStop(0, "rgba(200, 245, 255, 0.55)");
      beam.addColorStop(0.25, "rgba(140, 210, 255, 0.18)");
      beam.addColorStop(1, "rgba(100, 180, 255, 0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(-coreR * 0.35, 0);
      ctx.lineTo(coreR * 0.35, 0);
      ctx.lineTo(coreR * 2.2, dir * beamLen);
      ctx.lineTo(-coreR * 2.2, dir * beamLen);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Hot polar caps hint
    ctx.fillStyle = "rgba(230, 250, 255, 0.5)";
    ctx.beginPath();
    ctx.ellipse(x, y - coreR * 0.15, coreR * 0.7, coreR * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // Compact remnant core
    const core = ctx.createRadialGradient(x, y, 0, x, y, coreR);
    core.addColorStop(0, "#ffffff");
    core.addColorStop(0.4, "#d8f0ff");
    core.addColorStop(1, "#6a9ec8");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, coreR, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawStation(x: number, y: number, radius: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "rgba(180, 210, 240, 0.85)";
    ctx.fillStyle = "rgba(40, 55, 75, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = Math.cos(a) * radius;
      const py = Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawDebris(x: number, y: number, radius: number, soft: boolean): void {
    const ctx = this.ctx;
    if (soft) {
      const g = ctx.createRadialGradient(x, y, 2, x, y, radius);
      g.addColorStop(0, "rgba(200, 120, 210, 0.35)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.5);
    ctx.fillStyle = "rgba(120, 125, 135, 0.85)";
    ctx.fillRect(-radius, -radius * 0.6, radius * 2, radius * 1.2);
    ctx.restore();
  }

  private drawBlackHole(x: number, y: number, radius: number): void {
    const ctx = this.ctx;
    const glow = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius * 3);
    glow.addColorStop(0, "rgba(0,0,0,1)");
    glow.addColorStop(0.4, "rgba(40, 20, 60, 0.5)");
    glow.addColorStop(0.7, "rgba(180, 120, 60, 0.35)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.strokeStyle = "rgba(220, 160, 80, 0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 2.2, radius * 0.55, -0.3, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawNebulaCore(x: number, y: number, radius: number): void {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius);
    g.addColorStop(0, "rgba(230, 180, 255, 0.55)");
    g.addColorStop(0.5, "rgba(120, 60, 160, 0.25)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawDerelict(
    x: number,
    y: number,
    radius: number,
    seed: number,
    local: LocalView,
    camera: Camera,
    width: number,
    height: number,
    shipX: number,
    shipY: number,
    scanRange: number,
    prospecting: boolean,
  ): void {
    const ctx = this.ctx;
    // Interactive debris (beltRocks) replaces the old draw-only annular cloud.
    if (!local.beltRocks || local.beltRocks.length === 0) {
      this.drawAnnularDebris(x, y, radius * 2.5, radius * 9.5, 55, seed);
    } else {
      this.drawBeltRocks(
        local,
        camera,
        width,
        height,
        shipX,
        shipY,
        scanRange,
        prospecting,
      );
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.4);
    ctx.fillStyle = "rgba(70, 78, 90, 0.95)";
    ctx.strokeStyle = "rgba(140, 150, 165, 0.8)";
    ctx.lineWidth = 2;
    ctx.fillRect(-radius, -radius * 0.45, radius * 2, radius * 0.9);
    ctx.strokeRect(-radius, -radius * 0.45, radius * 2, radius * 0.9);
    // Broken mid-section accent
    ctx.fillStyle = "rgba(40, 45, 55, 0.9)";
    ctx.fillRect(-radius * 0.15, -radius * 0.45, radius * 0.35, radius * 0.9);
    ctx.restore();
  }

  private drawShip(
    x: number,
    y: number,
    heading: number,
    thrusting: boolean,
    size: number = SHIP.size,
    fill = "#c8d6e8",
    stroke = "#6a8bb0",
  ): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);
    if (thrusting) {
      ctx.beginPath();
      ctx.moveTo(-size * 0.55, 0);
      ctx.lineTo(-size * 1.15, size * 0.35);
      ctx.lineTo(-size * 0.85, 0);
      ctx.lineTo(-size * 1.15, -size * 0.35);
      ctx.closePath();
      ctx.fillStyle = "rgba(120, 200, 255, 0.75)";
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.7, size * 0.65);
    ctx.lineTo(-size * 0.4, 0);
    ctx.lineTo(-size * 0.7, -size * 0.65);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * First hit of the ray from (px,py) toward (tx,ty) against an inset screen rect.
 */
function hash2(a: number, b: number): number {
  let n = (a * 374761393 + b * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return ((n >>> 0) % 10000) / 10000;
}

interface GasGiantPalette {
  hi: string;
  mid: string;
  lo: string;
  bands: string[];
  limb: string;
  edge: string;
  /** RGB triplet for ring strokes */
  ring: string;
}

const GAS_GIANT_PALETTES: GasGiantPalette[] = [
  {
    // Jupiter-like ochre
    hi: "#e8d4a0",
    mid: "#d4b878",
    lo: "#8a7040",
    bands: [
      "rgba(120, 90, 50, 0.3)",
      "rgba(240, 220, 170, 0.22)",
      "rgba(150, 110, 55, 0.28)",
      "rgba(110, 85, 45, 0.3)",
    ],
    limb: "rgba(20, 12, 4, 0.45)",
    edge: "rgba(255, 235, 190, 0.2)",
    ring: "200, 185, 150",
  },
  {
    // Pale Saturn gold
    hi: "#f0e6c8",
    mid: "#dcc89a",
    lo: "#9a8560",
    bands: [
      "rgba(160, 140, 100, 0.22)",
      "rgba(250, 240, 210, 0.2)",
      "rgba(140, 120, 85, 0.25)",
    ],
    limb: "rgba(30, 22, 10, 0.4)",
    edge: "rgba(255, 245, 210, 0.22)",
    ring: "210, 195, 160",
  },
  {
    // Uranus cyan
    hi: "#c8f0f0",
    mid: "#7ec8c8",
    lo: "#3a7a8a",
    bands: [
      "rgba(60, 120, 130, 0.25)",
      "rgba(200, 240, 240, 0.18)",
      "rgba(40, 90, 100, 0.28)",
    ],
    limb: "rgba(10, 30, 40, 0.45)",
    edge: "rgba(180, 240, 245, 0.25)",
    ring: "160, 200, 210",
  },
  {
    // Neptune blue
    hi: "#6a9ada",
    mid: "#3a5fbe",
    lo: "#1a2a70",
    bands: [
      "rgba(20, 40, 100, 0.3)",
      "rgba(120, 160, 220, 0.2)",
      "rgba(30, 50, 110, 0.28)",
      "rgba(80, 120, 200, 0.18)",
    ],
    limb: "rgba(5, 10, 40, 0.5)",
    edge: "rgba(140, 180, 255, 0.22)",
    ring: "140, 170, 210",
  },
  {
    // Warm rust / amber
    hi: "#e8a878",
    mid: "#c86840",
    lo: "#7a3020",
    bands: [
      "rgba(100, 40, 25, 0.3)",
      "rgba(230, 180, 120, 0.22)",
      "rgba(140, 55, 30, 0.28)",
    ],
    limb: "rgba(30, 8, 4, 0.45)",
    edge: "rgba(255, 200, 160, 0.2)",
    ring: "200, 150, 120",
  },
  {
    // Soft lavender-gray
    hi: "#d8d0e8",
    mid: "#9a90b8",
    lo: "#504868",
    bands: [
      "rgba(70, 60, 100, 0.28)",
      "rgba(210, 200, 230, 0.2)",
      "rgba(90, 80, 120, 0.25)",
    ],
    limb: "rgba(20, 15, 35, 0.45)",
    edge: "rgba(220, 210, 240, 0.22)",
    ring: "180, 170, 200",
  },
];

function drawIrregularRock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rot: number,
  seed: number,
  shade: number,
): void {
  const verts = 5 + ((hash2(seed, 7) * 5) | 0); // 5–9
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < verts; i += 1) {
    const t = i / verts;
    const a = t * Math.PI * 2;
    let r = size * (0.55 + hash2(seed, i + 11) * 0.55);
    // Occasional inward dent → concave silhouette
    if (hash2(seed, i + 40) > 0.62) {
      r *= 0.35 + hash2(seed, i + 55) * 0.25;
    }
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const g = 90 + shade * 70;
  ctx.fillStyle = `rgb(${g * 0.85}, ${g * 0.82}, ${g * 0.9})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${g * 0.45}, ${g * 0.42}, ${g * 0.5}, 0.7)`;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/** Purchasable hull silhouette. Nose points along +X before the caller rotates. */
function traceHull(ctx: CanvasRenderingContext2D, hullId: string, size: number): void {
  switch (hullId) {
    case "sparrow":
      ctx.moveTo(size, 0);
      ctx.lineTo(-size * 0.85, size * 0.42);
      ctx.lineTo(-size * 0.4, 0);
      ctx.lineTo(-size * 0.85, -size * 0.42);
      return;
    case "pathfinder":
      ctx.moveTo(size * 1.15, 0);
      ctx.lineTo(size * 0.15, size * 0.22);
      ctx.lineTo(-size * 0.7, size * 0.55);
      ctx.lineTo(-size * 0.45, 0);
      ctx.lineTo(-size * 0.7, -size * 0.55);
      ctx.lineTo(size * 0.15, -size * 0.22);
      return;
    case "courier":
      ctx.moveTo(size * 1.2, 0);
      ctx.lineTo(-size * 0.9, size * 0.28);
      ctx.lineTo(-size * 0.55, 0);
      ctx.lineTo(-size * 0.9, -size * 0.28);
      return;
    case "prospector":
      ctx.moveTo(size * 0.7, 0);
      ctx.lineTo(size * 0.2, size * 0.55);
      ctx.lineTo(-size * 0.85, size * 0.7);
      ctx.lineTo(-size * 0.55, 0);
      ctx.lineTo(-size * 0.85, -size * 0.7);
      ctx.lineTo(size * 0.2, -size * 0.55);
      return;
    case "hauler":
      ctx.moveTo(size * 0.85, 0);
      ctx.lineTo(size * 0.35, size * 0.45);
      ctx.lineTo(-size * 0.95, size * 0.55);
      ctx.lineTo(-size * 0.95, -size * 0.55);
      ctx.lineTo(size * 0.35, -size * 0.45);
      return;
    case "liner":
      ctx.moveTo(size * 1.25, 0);
      ctx.lineTo(size * 0.2, size * 0.32);
      ctx.lineTo(-size * 1.05, size * 0.28);
      ctx.lineTo(-size * 0.7, 0);
      ctx.lineTo(-size * 1.05, -size * 0.28);
      ctx.lineTo(size * 0.2, -size * 0.32);
      return;
    case "interceptor":
      ctx.moveTo(size * 1.05, 0);
      ctx.lineTo(-size * 0.2, size * 0.22);
      ctx.lineTo(-size * 0.75, size * 0.85);
      ctx.lineTo(-size * 0.45, size * 0.15);
      ctx.lineTo(-size * 0.9, 0);
      ctx.lineTo(-size * 0.45, -size * 0.15);
      ctx.lineTo(-size * 0.75, -size * 0.85);
      ctx.lineTo(-size * 0.2, -size * 0.22);
      return;
    case "bulwark":
      ctx.moveTo(size, 0);
      ctx.lineTo(-size * 0.35, size * 0.9);
      ctx.lineTo(-size * 0.15, size * 0.4);
      ctx.lineTo(-size * 0.75, 0);
      ctx.lineTo(-size * 0.15, -size * 0.4);
      ctx.lineTo(-size * 0.35, -size * 0.9);
      return;
    default:
      // Raider — classic chevron.
      ctx.moveTo(size, 0);
      ctx.lineTo(-size * 0.7, size * 0.65);
      ctx.lineTo(-size * 0.35, 0);
      ctx.lineTo(-size * 0.7, -size * 0.65);
  }
}

function intersectScreenEdge(
  px: number,
  py: number,
  tx: number,
  ty: number,
  margin: number,
  w: number,
  h: number,
): { x: number; y: number; angle: number } | null {
  const dx = tx - px;
  const dy = ty - py;
  if (dx === 0 && dy === 0) return null;

  const left = margin;
  const right = w - margin;
  const top = margin;
  const bottom = h - margin;
  const angle = Math.atan2(dy, dx);

  let bestT = Infinity;

  const consider = (t: number, x: number, y: number): void => {
    if (t <= 0 || t >= bestT) return;
    if (x < left - 0.5 || x > right + 0.5 || y < top - 0.5 || y > bottom + 0.5) {
      return;
    }
    bestT = t;
  };

  if (dx !== 0) {
    const tR = (right - px) / dx;
    consider(tR, right, py + tR * dy);
    const tL = (left - px) / dx;
    consider(tL, left, py + tL * dy);
  }
  if (dy !== 0) {
    const tB = (bottom - py) / dy;
    consider(tB, px + tB * dx, bottom);
    const tT = (top - py) / dy;
    consider(tT, px + tT * dx, top);
  }

  if (!Number.isFinite(bestT)) return null;
  return { x: px + bestT * dx, y: py + bestT * dy, angle };
}
