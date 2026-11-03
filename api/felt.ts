// GET /api/felt?id=<id>            -> 1200x630 PNG challenge image for X (CDN-cached for good). Since 3.0 it also
//                                     draws the best goal's move, played again from the posted trail: nothing new is stored
// GET /api/felt?id=<id>&view=page  -> /c/<id>: tiny page whose og:image is that image, then into the game
import { readFile } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import sharp from "sharp";
import { FIXTURE_NAME, MOUTH, ROUNDS, ROUNDS_R3 } from "../shared/content.js";
import { dayLabel } from "../shared/daily.js";
import { parseTrail, rerun, type FigInfo, type Step } from "../shared/engine.js";
import { getResult, type Result } from "./_runs.js";
import { getEdition } from "./_cut.js";
import { buildSquad, ghostSquad, type Edition, type Launch } from "../shared/data.js";

const SITE = "https://kickerhq.vercel.app";
const C = {
  ink: "#1a0816",
  wine: "#3a0b2b",
  teal: "#0c3b40",
  felt: "#0c3438",
  cream: "#fff1dc",
  cyan: "#27c4e8",
  pink: "#ff3d7f",
  gold: "#ffc23d",
  dim: "#c9a9bd",
  kit: "#a3245f",
  kitHi: "#e0538f",
  brass: "#c9a24a",
};
const PAIR = ["#5ad7ff", "#ff7a3d", "#ff4fb4", "#ffd43b"];

type Node = { type: string; props: Keyed<string, unknown> };
const h = (type: string, style: Keyed<string, unknown>, ...children: (Node | string | null | false)[]): Node => ({
  type,
  props: { style: { display: "flex", ...style }, children: children.filter((c) => c !== null && c !== false) },
});
const img = (src: string, style: Keyed<string, unknown>): Node => ({ type: "img", props: { src, style } });

let fonts: { name: string; data: ArrayBuffer; weight: 400; style: "normal" }[] | null = null;
async function loadFonts() {
  if (fonts) return fonts;
  const ab = (x: Buffer) => x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength) as ArrayBuffer;
  const j = await readFile(new URL("./_fonts/Jersey10.ttf", import.meta.url));
  fonts = [{ name: "Jersey", data: ab(j), weight: 400, style: "normal" }];
  return fonts;
}

async function art(cid: string | null): Promise<string | null> {
  if (!cid || !/^[A-Za-z0-9]{40,100}$/.test(cid)) return null;
  try {
    const res = await fetch(`https://testnet.vibevibe.fun/media/${cid}.thumb.webp`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > 600_000) return null;
    // the renderer can't read webp: decode, and pixelate the same way the game does (32px, nearest)
    const small = await sharp(buf).resize(32, 32, { fit: "cover" }).png().toBuffer();
    const png = await sharp(small).resize(128, 128, { kernel: "nearest" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

/** One figure from above: kit shoulders along the rod, the boot towards the goal, the launch's picture as the head. */
function figure(f: FigInfo, pic: string | null): Node {
  return h(
    "div",
    { flexDirection: "column", alignItems: "center", width: 116, position: "relative" },
    h(
      "div",
      { width: 116, height: 132, alignItems: "center", justifyContent: "center", position: "relative" },
      h("div", { position: "absolute", left: 44, top: 0, width: 28, height: 30, background: C.gold, border: `4px solid ${C.ink}`, borderRadius: 8 }),
      h("div", { position: "absolute", left: 0, top: 46, width: 116, height: 40, background: C.ink, borderRadius: 16 }),
      h("div", { position: "absolute", left: 5, top: 51, width: 106, height: 30, background: C.kit, borderRadius: 12 }),
      h("div", { position: "absolute", left: 5, top: 51, width: 106, height: 10, background: C.kitHi, borderRadius: 8, opacity: 0.6 }),
      h(
        "div",
        { width: 92, height: 92, borderRadius: 46, background: C.ink, alignItems: "center", justifyContent: "center", border: `5px solid ${C.gold}` },
        pic ? img(pic, { width: 76, height: 76, borderRadius: 38 }) : h("div", { width: 76, height: 76, borderRadius: 38, background: C.kitHi }),
      ),
    ),
    h("div", { marginTop: 4, fontSize: 24, color: PAIR[f.u] || C.cream, background: C.ink, padding: "2px 10px", borderRadius: 6 }, "$" + f.s.slice(0, 8)),
  );
}

/** The small mark a $KICKER holder gets next to their name. Cosmetic only. */
function houseMark(size: number): Node {
  return h(
    "div",
    { width: size, height: size, background: C.ink, border: `3px solid ${C.gold}`, borderRadius: 6, alignItems: "center", justifyContent: "center", marginRight: 12, fontSize: size * 0.72, color: C.gold, lineHeight: 1 },
    "K",
  );
}

// ------------------------------------------------------------ the best goal's move, drawn on the felt (3.0)
/** The move of a posted season's best goal, played again from its trail (the post already stores it; nothing new is kept). */
interface Move {
  path: Step[][];
  scorer: FigInfo | null;
}
async function moveOf(rec: Result, ed: Edition | null): Promise<Move | null> {
  if (!ed || !rec.best) return null;
  try {
    const t = parseTrail(rec.trail);
    const run = rerun(ed, rec.seed, t.actions, t.mode, t.rules);
    const b = run.s.best;
    if (!b || !b.path || !b.path.length) return null;
    const l = run.s.squad[b.scorer];
    return { path: b.path.filter((s) => s.length > 1), scorer: l ? { t: l.t, s: l.s, c: l.c, u: l.u } : null };
  } catch {
    return null;
  }
}

/**
 * The move as an SVG picture: the felt seen from above (your goal left, theirs right), the passes dashed in cream,
 * the shot in gold, a ring where the ball came off a wall. Returns where the move ends, for the scorer's head.
 */
function moveSvg(path: Step[][], W: number, H: number, haunt: boolean): { uri: string; end: { x: number; y: number } | null } {
  const pad = 22;
  const cx = (x: number) => pad + ((x + 0.5) * (W - 2 * pad)) / 10;
  const cy = (l: number) => pad + ((l + 0.5) * (H - 2 * pad)) / 10;
  const felt = haunt ? "#0a1d22" : C.felt;
  const line = haunt ? "#cfe3ee" : C.cream;
  const gold = haunt ? "#ffb35c" : C.gold;
  const laneH = (H - 2 * pad) / 10;
  const out: string[] = [];
  out.push(`<rect x="0" y="0" width="${W}" height="${H}" rx="18" fill="${haunt ? "#1c0b18" : "#4a1a3a"}"/>`);
  out.push(`<rect x="${pad / 2}" y="${pad / 2}" width="${W - pad}" height="${H - pad}" rx="10" fill="${felt}"/>`);
  for (let i = 0; i < 5; i++) out.push(`<rect x="${pad / 2 + ((W - pad) / 5) * i}" y="${pad / 2}" width="${(W - pad) / 10}" height="${H - pad}" fill="#ffffff" fill-opacity="0.03"/>`);
  out.push(`<line x1="${W / 2}" y1="${pad / 2}" x2="${W / 2}" y2="${H - pad / 2}" stroke="${line}" stroke-opacity="0.2" stroke-width="3"/>`);
  out.push(`<circle cx="${W / 2}" cy="${H / 2}" r="${H * 0.14}" fill="none" stroke="${line}" stroke-opacity="0.2" stroke-width="3"/>`);
  for (const x of [1, 2, 4, 6, 8, 7, 5, 3]) out.push(`<line x1="${cx(x)}" y1="${pad / 2}" x2="${cx(x)}" y2="${H - pad / 2}" stroke="${C.brass}" stroke-opacity="0.22" stroke-width="4"/>`);
  out.push(`<rect x="${pad / 2 - 8}" y="${cy(MOUTH[0]) - laneH / 2}" width="10" height="${laneH * (MOUTH[1] - MOUTH[0] + 1)}" fill="${line}" fill-opacity="0.5"/>`);
  out.push(`<rect x="${W - pad / 2 - 2}" y="${cy(MOUTH[0]) - laneH / 2}" width="10" height="${laneH * (MOUTH[1] - MOUTH[0] + 1)}" fill="${gold}"/>`);
  let end: { x: number; y: number } | null = null;
  for (let i = 0; i < path.length; i++) {
    const seg = path[i];
    const shot = i === path.length - 1;
    const d = seg.map((p, j) => `${j ? "L" : "M"}${cx(p.x).toFixed(1)} ${cy(p.lane).toFixed(1)}`).join(" ");
    out.push(`<path d="${d}" fill="none" stroke="${C.ink}" stroke-opacity="0.75" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`);
    out.push(`<path d="${d}" fill="none" stroke="${shot ? gold : line}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"${shot ? "" : ' stroke-dasharray="12 9"'}/>`);
    out.push(`<circle cx="${cx(seg[0].x)}" cy="${cy(seg[0].lane)}" r="8" fill="${line}" stroke="${C.ink}" stroke-width="3"/>`);
    for (let k = 1; k < seg.length - 1; k++) {
      const a = seg[k - 1];
      const b = seg[k];
      const c = seg[k + 1];
      const turn = (b.lane - a.lane) * (c.lane - b.lane) < 0;
      const wall = (b.lane === 0 || b.lane === 9) && a.lane !== b.lane;
      if (turn || wall) out.push(`<circle cx="${cx(b.x)}" cy="${cy(b.lane)}" r="12" fill="none" stroke="${gold}" stroke-width="4"/>`);
    }
    const last = seg[seg.length - 1];
    end = { x: cx(last.x), y: cy(last.lane) };
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${out.join("")}</svg>`;
  return { uri: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, end };
}

/** The move on its felt, with the scorer's head waiting in the net and a small label. */
function movePanel(mv: Move | null, pic: string | null, style: string, box: { right: number; top: number; w: number; h: number }, haunt: boolean): Node | null {
  if (!mv || !mv.path.length) return null;
  const { uri, end } = moveSvg(mv.path, box.w, box.h, haunt);
  const R = 30;
  const ring = haunt ? "#ffb35c" : C.gold;
  return h(
    "div",
    { position: "absolute", right: box.right, top: box.top, width: box.w, height: box.h },
    img(uri, { position: "absolute", left: 0, top: 0, width: box.w, height: box.h }),
    end
      ? h(
          "div",
          { position: "absolute", left: end.x - R, top: end.y - R, width: R * 2, height: R * 2, borderRadius: R, background: C.ink, border: `5px solid ${ring}`, alignItems: "center", justifyContent: "center" },
          pic ? img(pic, { width: R * 2 - 14, height: R * 2 - 14, borderRadius: R }) : null,
        )
      : null,
    h(
      "div",
      { position: "absolute", left: 18, top: -18, background: C.ink, border: `3px solid ${ring}`, borderRadius: 8, padding: "2px 12px", fontSize: 22, color: ring },
      `The move · ${style}${mv.scorer ? ` · $${mv.scorer.s.slice(0, 8)}` : ""}`,
    ),
  );
}

const isNew = (rec: unknown): rec is Result => !!rec && (rec as { v?: number }).v === 2;

/** "Daily Match · Nov 1 · 2,140" */
export const dailyLine = (rec: Result) => `Daily Match · ${dayLabel(rec.daily || "")}${rec.best ? ` · ${rec.best.total.toLocaleString("en-US")}` : ""}`;

function frame(...children: (Node | null)[]): Node {
  return h(
    "div",
    {
      width: 1200,
      height: 630,
      background: `radial-gradient(circle at 30% 30%, #5b1243 0%, ${C.wine} 38%, #160611 100%)`,
      fontFamily: "Jersey",
      color: C.cream,
      position: "relative",
      overflow: "hidden",
    },
    h("div", { position: "absolute", left: -200, top: 400, width: 1700, height: 110, background: C.teal, transform: "rotate(-10deg)", opacity: 0.85 }),
    h("div", { position: "absolute", left: -200, top: 530, width: 1700, height: 36, background: C.pink, transform: "rotate(-10deg)", opacity: 0.45 }),
    ...children.filter((c): c is Node => !!c),
    h("div", { position: "absolute", left: 64, bottom: 30, fontSize: 26, color: C.cream }, "kickerhq.vercel.app"),
  );
}

/** A ghost from above: a pale sheet with hollow eyes, the dead launch's picture showing through. */
function ghostFig(l: Launch, pic: string | null, size: number): Node {
  return h(
    "div",
    { flexDirection: "column", alignItems: "center", width: size + 20, opacity: 0.78 },
    h(
      "div",
      {
        width: size,
        height: size * 1.18,
        borderRadius: `${size / 2}px ${size / 2}px 10px 10px`,
        background: "#dcebf3",
        border: `4px solid ${C.ink}`,
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      },
      pic ? img(pic, { width: size * 0.7, height: size * 0.7, borderRadius: size * 0.35, opacity: 0.55 }) : null,
      h("div", { position: "absolute", left: size * 0.26, top: size * 0.3, width: size * 0.13, height: size * 0.2, borderRadius: 8, background: C.ink }),
      h("div", { position: "absolute", right: size * 0.26, top: size * 0.3, width: size * 0.13, height: size * 0.2, borderRadius: 8, background: C.ink }),
    ),
    h("div", { marginTop: 4, fontSize: 18, color: "#cfe3ee", background: C.ink, padding: "1px 8px", borderRadius: 6 }, "$" + l.s.slice(0, 7)),
  );
}

/** The Haunted table's share image: night felt, a pumpkin ball, the goal's figures, and the ghost club behind them. */
async function hauntPng(rec: Result): Promise<Node> {
  const figs = (rec.best?.figs || []).slice(0, 5);
  const ed = await getEdition(rec.edition);
  const ghosts = ed ? ghostSquad(ed, rec.seed, buildSquad(ed, rec.seed), 1, Math.min(2, rec.fixture)).slice(8, 11) : [];
  const mv = await moveOf(rec, ed);
  const [pics, gpics, spic] = await Promise.all([Promise.all(figs.map((f) => art(f.c))), Promise.all(ghosts.map((g) => art(g.c))), mv?.scorer ? art(mv.scorer.c) : Promise.resolve(null)]);
  // with the move to draw, the ghosts, the figures and the felt each move up to make room for it
  const top = mv ? { ghosts: 14, gsize: 64, felt: 112, rod: 196, figs: 140 } : { ghosts: 40, gsize: 86, felt: 200, rod: 296, figs: 237 };
  const reached = rec.won ? "Beat all three ghost clubs" : `Won ${rec.cleared} of 3 ghost matches`;
  return h(
    "div",
    {
      width: 1200,
      height: 630,
      background: "radial-gradient(circle at 70% 40%, #15343e 0%, #0a1d22 45%, #05090b 100%)",
      fontFamily: "Jersey",
      color: C.cream,
      position: "relative",
      overflow: "hidden",
    },
    // mist low across the picture
    h("div", { position: "absolute", left: -200, top: 560, width: 1600, height: 140, background: "#cfe3ee", opacity: 0.05, borderRadius: 70 }),
    h(
      "div",
      { position: "absolute", left: 64, top: 46, flexDirection: "column", width: 540 },
      h("div", { fontSize: 112, lineHeight: 1, color: C.cream, letterSpacing: 4 }, "KICKER"),
      h("div", { fontSize: 40, color: "#ffb35c", marginTop: 6, lineHeight: 1 }, "Haunted table"),
      h("div", { fontSize: 24, color: "#cfe3ee", marginTop: 8, width: 500 }, "ghost clubs made of the quietest launches on vibe/vibe"),
      h(
        "div",
        { marginTop: 24, background: C.ink, border: "4px solid #cfe3ee", borderRadius: 10, padding: "10px 18px", alignSelf: "flex-start", fontSize: 30, color: "#cfe3ee", alignItems: "center" },
        rec.house && rec.name ? houseMark(30) : null,
        rec.name ? `${rec.name} dares you: same ghosts` : "Same seed, same ghosts",
      ),
      h("div", { marginTop: 18, fontSize: 54, color: C.cream, lineHeight: 1 }, rec.seed),
      h("div", { marginTop: 8, fontSize: 24, color: C.dim }, `cut #${rec.edition} · ${reached}`),
      rec.best
        ? h(
            "div",
            { marginTop: 20, alignItems: "center" },
            h("div", { background: "#f07a12", color: C.ink, borderRadius: 8, padding: "6px 14px", fontSize: 28 }, rec.best.style),
            h("div", { marginLeft: 16, fontSize: 58, color: "#ffb35c", lineHeight: 1 }, rec.best.total.toLocaleString("en-US")),
            h("div", { marginLeft: 10, fontSize: 22, color: C.dim }, "best goal"),
          )
        : null,
    ),
    // the ghost club hangs back over the felt
    h("div", { position: "absolute", right: 40, top: top.ghosts, alignItems: "flex-start", justifyContent: "flex-end", width: 520 }, ...ghosts.map((g, i) => ghostFig(g, gpics[i], top.gsize))),
    h("div", { position: "absolute", right: 30, top: top.felt, width: 620, height: mv ? 210 : 270, background: "#071a1e", borderRadius: 26, border: "10px solid #1c0b18" }),
    h("div", { position: "absolute", right: 0, top: top.rod, width: 680, height: 14, background: C.brass, borderRadius: 7 }),
    h("div", { position: "absolute", right: 40, top: top.figs, width: 600, alignItems: "flex-start", justifyContent: "center" }, ...figs.map((f, i) => figure(f, pics[i]))),
    mv
      ? movePanel(mv, spic, rec.best?.style || "", { right: 30, top: 352, w: 620, h: 236 }, true)
      : h("div", { position: "absolute", right: 80, top: 466, width: 120, height: 10, background: "#ff7a1c", opacity: 0.35, borderRadius: 5 }),
    // the pumpkin ball
    h(
      "div",
      { position: "absolute", right: mv ? 44 : 32, top: mv ? 326 : 444, width: 58, height: 52, borderRadius: 29, background: "radial-gradient(circle at 35% 35%, #ffb35c, #f07a12 60%, #a84a06)", border: `4px solid ${C.ink}` },
      h("div", { position: "absolute", left: 23, top: -14, width: 7, height: 13, background: "#3d7a2a" }),
    ),
    h("div", { position: "absolute", left: 64, bottom: 30, fontSize: 26, color: "#cfe3ee" }, "kickerhq.vercel.app"),
  );
}

/** How far a posted run got, in the words of the rules it was played under. */
function reachedOf(rec: Result): string {
  let rules = 2;
  try {
    rules = parseTrail(rec.trail).rules;
  } catch {
    /* a legacy trail */
  }
  if (rec.mode === "daily") return rec.won ? "Won the match day" : `Out in fixture ${rec.fixture + 1} of 3`;
  if (rules < 3) return rec.won ? `Won all ${ROUNDS} rounds` : `Out in round ${rec.round} · ${FIXTURE_NAME[rec.fixture] || ""}`;
  if (rec.won) return "Won the final";
  if (rec.fixture === 2) return rec.round >= ROUNDS_R3 ? "Lost the final" : `Out in round ${rec.round} · Cup tie`;
  return `Out on the table in round ${rec.round}`;
}

async function imagePng(rec: Result | null): Promise<Buffer> {
  let tree: Node;
  if (rec && rec.mode === "haunt") {
    tree = await hauntPng(rec);
  } else if (!rec) {
    tree = frame(
      h(
        "div",
        { position: "absolute", left: 64, top: 70, flexDirection: "column", width: 900 },
        h("div", { fontSize: 140, lineHeight: 1, letterSpacing: 4 }, "KICKER"),
        h("div", { fontSize: 34, color: C.dim, marginTop: 12 }, "Turn-based table football. Live vibe/vibe launches on the rods."),
        h("div", { fontSize: 30, color: C.gold, marginTop: 40 }, "A season from an older version of KICKER."),
      ),
    );
  } else {
    const figs = (rec.best?.figs || []).slice(0, 5);
    const mv = await moveOf(rec, await getEdition(rec.edition));
    const [pics, spic] = await Promise.all([Promise.all(figs.map((f) => art(f.c))), mv?.scorer ? art(mv.scorer.c) : Promise.resolve(null)]);
    const top = mv ? { felt: 62, rod: 146, figs: 88 } : { felt: 160, rod: 260, figs: 201 };
    const reached = reachedOf(rec);
    tree = frame(
      h(
        "div",
        { position: "absolute", left: 64, top: 46, flexDirection: "column", width: 560 },
        h("div", { fontSize: 120, lineHeight: 1, color: C.cream, letterSpacing: 4 }, "KICKER"),
        h("div", { fontSize: 27, color: C.dim, marginTop: 4, width: 460 }, "turn-based table football with live vibe/vibe launches on the rods"),
        h(
          "div",
          { marginTop: 28, background: C.ink, border: `4px solid ${C.gold}`, borderRadius: 10, padding: "10px 18px", alignSelf: "flex-start", fontSize: 30, color: C.gold, alignItems: "center" },
          rec.house && rec.name ? houseMark(30) : null,
          rec.daily ? (rec.name ? `${rec.name} dares you` : "Beat this match") : rec.name ? `${rec.name} dares you: beat my seed` : "Beat my seed",
        ),
        rec.daily
          ? h("div", { marginTop: 20, fontSize: 56, color: C.cream, lineHeight: 1 }, `Daily Match · ${dayLabel(rec.daily)}`)
          : h("div", { marginTop: 20, fontSize: 62, color: C.cream, lineHeight: 1 }, rec.seed),
        h("div", { marginTop: 10, fontSize: 24, color: C.dim }, rec.daily ? `seed ${rec.seed} · ${reached.toLowerCase()}` : `cut #${rec.edition} · ${reached}`),
        rec.best
          ? h(
              "div",
              { marginTop: 24, alignItems: "center" },
              h("div", { background: C.cyan, color: C.ink, borderRadius: 8, padding: "6px 14px", fontSize: 28 }, rec.best.style),
              h("div", { marginLeft: 16, fontSize: 58, color: C.pink, lineHeight: 1 }, rec.best.total.toLocaleString("en-US")),
              h("div", { marginLeft: 10, fontSize: 22, color: C.dim }, "best goal"),
            )
          : null,
      ),
      // the five figures of the best goal on a brass rod, over a strip of felt
      h("div", { position: "absolute", right: 30, top: top.felt, width: 620, height: mv ? 226 : 280, background: C.felt, borderRadius: 26, border: `10px solid #4a1a3a` }),
      h("div", { position: "absolute", right: 0, top: top.rod, width: 680, height: 14, background: C.brass, borderRadius: 7 }),
      h("div", { position: "absolute", right: 40, top: top.figs, width: 600, alignItems: "flex-start", justifyContent: "center" }, ...figs.map((f, i) => figure(f, pics[i]))),
      movePanel(mv, spic, rec.best?.style || "", { right: 30, top: 340, w: 620, h: 240 }, false),
    );
  }
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], { width: 1200, height: 630, fonts: await loadFonts() });
  return new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(rec: Result | null, id: string): string {
  const title = !rec
    ? "A season on KICKER"
    : rec.mode === "haunt"
      ? `Beat ${rec.name ? esc(rec.name) + "'s" : "this"} Haunted table ${rec.seed} on KICKER`
      : rec.daily
      ? `${esc(dailyLine(rec))} on KICKER`
      : `Beat ${rec.name ? esc(rec.name) + "'s" : "this"} seed ${rec.seed} on KICKER`;
  const desc = !rec
    ? "Turn-based table football with live vibe/vibe launches on the rods."
    : rec.best
      ? `${rec.won ? `Won all ${ROUNDS} rounds` : `Round ${rec.round}`} with a best goal of ${rec.best.total.toLocaleString("en-US")} (${rec.best.style}). Same squad, same rivals: your turn.`
      : "Same squad, same rivals: your turn.";
  const imgUrl = `${SITE}/api/felt?id=${id}`;
  const to = `/?c=${id}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:url" content="${SITE}/c/${id}"><meta property="og:title" content="${title}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${imgUrl}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@kyriektnrv"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${imgUrl}">
<meta http-equiv="refresh" content="0;url=${to}"><style>body{background:#160611;color:#fff1dc;font-family:monospace;display:grid;place-items:center;height:100vh;margin:0}a{color:#ffc23d}</style>
</head><body><a href="${to}">Take the challenge</a><script>location.replace(${JSON.stringify(to)})</script></body></html>`;
}

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const id = q.get("id") || "";
  const raw = await getResult(id);
  if (!raw) {
    if (q.get("view") === "page") return Response.redirect(`${SITE}/`, 302);
    return new Response("not found", { status: 404, headers: { "cache-control": "public, max-age=30" } });
  }
  const rec = isNew(raw) ? raw : null;
  if (q.get("view") === "page") {
    return new Response(page(rec, id), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=31536000" } });
  }
  try {
    const png = await imagePng(rec);
    return new Response(new Uint8Array(png), {
      headers: { "content-type": "image/png", "cache-control": "public, max-age=86400, s-maxage=31536000, immutable" },
    });
  } catch (e) {
    return new Response("render failed: " + String((e as Error)?.message || e), { status: 500, headers: { "cache-control": "no-store" } });
  }
}
