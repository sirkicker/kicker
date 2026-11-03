// KICKER Club boot: fonts, Pixi, the table, then the club screens over it.
import { Application } from "pixi.js";
import { unlock } from "../audio.js";
import { ClubTable } from "./table.js";
import { mountClub } from "./app.js";
import "../style.css";

async function boot() {
  const app = new Application();
  await Promise.all([
    app.init({
      preference: "webgl",
      background: 0x12060f,
      antialias: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
      width: window.innerWidth,
      height: window.innerHeight,
    }),
    document.fonts.load('32px "Jersey 10"').catch(() => null),
  ]);
  document.getElementById("stage")!.appendChild(app.canvas);
  const table = new ClubTable(app);
  const first = () => {
    unlock();
    window.removeEventListener("pointerdown", first);
  };
  window.addEventListener("pointerdown", first);
  await mountClub(document.getElementById("ui")!, table);
}
void boot();
