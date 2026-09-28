export class Hud {
  draw(
    ctx: CanvasRenderingContext2D,
    info: {
      health: number;
      maxHealth: number;
      shield: number;
      maxShield: number;
      fuel: number;
      maxFuel: number;
      cargoUsed: number;
      cargoCapacity: number;
      credits: number;
      poiName: string;
      locationName: string;
      poiType: string;
      starClass?: string;
      menuOpen: boolean;
      inBelt?: boolean;
      canProspect?: boolean;
      inDerelict?: boolean;
      hasScoop?: boolean;
      derelictScoopHint?: boolean;
    },
  ): void {
    if (info.menuOpen) return;

    const pad = 16;
    ctx.save();
    ctx.font = "13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillStyle = "rgba(200, 220, 255, 0.88)";
    ctx.textBaseline = "top";

    const title =
      info.poiType === "starSystem" && info.starClass
        ? `${info.poiName}  (${info.starClass})`
        : `${formatType(info.poiType)}  ${info.poiName}`;

    // Skip location when it repeats the system/star title (e.g. at the host star).
    const showLocation =
      info.locationName.length > 0 &&
      info.locationName !== info.poiName &&
      info.locationName !== `${info.poiName} (${info.starClass})`;

    const lines = [
      title,
      ...(showLocation ? [info.locationName] : []),
      "",
      `HP ${Math.ceil(info.health)}/${info.maxHealth}`,
      ...(info.maxShield > 0
        ? [`SH ${Math.ceil(info.shield)}/${info.maxShield}`]
        : []),
      ...(info.maxFuel > 0
        ? [`FU ${Math.floor(info.fuel)}/${info.maxFuel}`]
        : []),
      ...(info.cargoCapacity > 0
        ? [`CU ${info.cargoUsed}/${info.cargoCapacity}`]
        : []),
      `CR ${info.credits}`,
    ];

    let y = pad;
    for (const line of lines) {
      ctx.fillText(line, pad, y);
      y += 17;
    }

    if (info.inBelt && info.canProspect) {
      y += 8;
      ctx.fillStyle = "rgba(200, 210, 170, 0.8)";
      ctx.fillText("Belt · hold F to scoop ore", pad, y);
    } else if (info.inDerelict && info.derelictScoopHint && info.hasScoop) {
      // Same HUD band as belt prospecting (not floating on debris).
      y += 8;
      ctx.fillStyle = "rgba(220, 200, 150, 0.85)";
      ctx.fillText("Derelict · hold F to scoop cargo", pad, y);
    }

    ctx.fillStyle = "rgba(150, 170, 200, 0.55)";
    ctx.fillText("G  Galaxy", pad, window.innerHeight - 58);
    ctx.fillText("M  System", pad, window.innerHeight - 40);
    ctx.fillText("L  Ship", pad, window.innerHeight - 22);

    ctx.restore();
  }
}

function formatType(t: string): string {
  switch (t) {
    case "starSystem":
      return "System";
    case "blackHole":
      return "Black hole";
    case "derelict":
      return "Derelict";
    case "neutronStar":
      return "Neutron star";
    case "brownDwarf":
      return "Brown dwarf";
    case "roguePlanet":
      return "Rogue planet";
    case "nebula":
      return "Nebula";
    default:
      return "POI";
  }
}
