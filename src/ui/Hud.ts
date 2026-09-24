export class Hud {
  draw(
    ctx: CanvasRenderingContext2D,
    info: {
      health: number;
      maxHealth: number;
      shield: number;
      maxShield: number;
      cargoUsed: number;
      cargoCapacity: number;
      credits: number;
      poiName: string;
      locationName: string;
      poiType: string;
      starClass?: string;
      menuOpen: boolean;
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
