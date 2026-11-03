// How a boss club's rule shows on the table (critique §6, idea 9), and the table events' tints (idea 10).
// Pure drawing: game.ts decides where and when. Every RuleView kind has a mark and a corner badge.
import { Container, Graphics } from "pixi.js";
import type { RuleView, TableEventId } from "../shared/engine.js";
import { txt } from "./figures.js";
import { COL, NUM, type Kit } from "./theme.js";

/** What each rule is called on its corner badge, short. */
export const RULE_LABEL: Keyed<RuleView["kind"], string> = {
  pulled: "Defence pulled",
  frozen: "Rod halted",
  locked: "Keeper locked",
  mirror: "Mirrored rods",
  drift: "Shots drift",
  cost2: "Slides cost 2",
  late: "Passes land late",
  short: "One touch fewer",
  check: "Stats to shoot",
  bell: "The final",
};

/** Table events: their name and tint. */
export const EVENT_LOOK: Keyed<TableEventId, { name: string; tint: number; text: string }> = {
  volatile: { name: "Volatile", tint: 0x9a5aff, text: "Off a wall, two lanes for one" },
  thin: { name: "Thin book", tint: 0xe8b04a, text: "A lane is sticky through midfield" },
  green: { name: "Green candle", tint: 0x3ddc97, text: "+1 touch on your first ball" },
  halfhalt: { name: "Halt on the half", tint: 0xff5a4f, text: "No long passes on the first ball" },
};

/** A club crest: a pentagon shield in the club's kit, its initial in the middle. `r` is the half-width. */
export function crest(name: string, kit: Kit, r: number): Container {
  const c = new Container();
  const g = new Graphics();
  const pts = (k: number) => [-r * k, -r * 1.05 * k, r * k, -r * 1.05 * k, r * k, r * 0.25 * k, 0, r * 1.15 * k, -r * k, r * 0.25 * k];
  g.poly(pts(1.12)).fill(COL.ink);
  g.poly(pts(1)).fill(kit.main);
  g.poly([-r, -r * 1.05, 0, -r * 1.05, 0, r * 1.15, -r, r * 0.25]).fill({ color: kit.hi, alpha: 0.35 });
  g.poly(pts(0.82)).stroke({ width: Math.max(2, r * 0.08), color: kit.trim === COL.ink ? kit.hi : kit.trim, alpha: 0.9 });
  const word = name.replace(/^(The|AC|FC|Real|Inter|Union|Racing|Rapid|Sporting|Athletic|Dynamo|Olympique|Borussia|Atletico|Deportivo|United)\s+/i, "");
  const t = txt((word[0] || "?").toUpperCase(), { fontFamily: NUM, fontSize: r * 1.25, fill: COL.cream, stroke: { color: COL.ink, width: Math.max(3, r * 0.12) } });
  t.anchor.set(0.5);
  t.position.set(0, -r * 0.05);
  c.addChild(g, t);
  return c;
}

/** The plaque that stays at the cabinet corner all match: crest, club, the rule in a few words. */
export function ruleBadge(club: string, kit: Kit, label: string, w: number, h: number, size: number): Container {
  const c = new Container();
  const g = new Graphics();
  g.roundRect(0, 0, w, h, 8).fill(COL.ink).stroke({ width: 2.5, color: COL.pink, alpha: 0.9 });
  g.roundRect(3, 3, h - 6, h - 6, 6).fill({ color: COL.pink, alpha: 0.16 });
  c.addChild(g);
  const cr = crest(club, kit, h * 0.3);
  cr.position.set(h / 2, h / 2 + 1);
  c.addChild(cr);
  const t1 = txt(club.toUpperCase(), { fontFamily: NUM, fontSize: size, fill: COL.pink, letterSpacing: 1 });
  t1.anchor.set(0, 1);
  t1.position.set(h + 2, h / 2 + 2);
  const t2 = txt(label, { fontFamily: NUM, fontSize: size * 0.95, fill: COL.cream });
  t2.anchor.set(0, 0);
  t2.position.set(h + 2, h / 2 + 1);
  c.addChild(t1, t2);
  return c;
}

/** A table event's plaque, in its tint. */
export function eventBadge(id: TableEventId, w: number, h: number, size: number): Container {
  const e = EVENT_LOOK[id];
  const c = new Container();
  const g = new Graphics();
  g.roundRect(0, 0, w, h, 8).fill(COL.ink).stroke({ width: 2.5, color: e.tint, alpha: 0.9 });
  g.circle(h / 2, h / 2, h * 0.28).fill(e.tint);
  const t1 = txt(e.name.toUpperCase(), { fontFamily: NUM, fontSize: size, fill: e.tint, letterSpacing: 1 });
  t1.anchor.set(0, 1);
  t1.position.set(h + 2, h / 2 + 2);
  const t2 = txt(e.text, { fontFamily: NUM, fontSize: size * 0.85, fill: COL.cream });
  t2.anchor.set(0, 0);
  t2.position.set(h + 2, h / 2 + 1);
  c.addChild(g, t1, t2);
  return c;
}

/** Red-and-white HALTED tape wound round a rod, `len` long, centred on 0 (drawn along y). */
export function haltTape(len: number): Graphics {
  const g = new Graphics();
  const w = 22;
  g.rect(-w / 2, -len / 2, w, len).fill({ color: 0xffffff, alpha: 0.9 });
  for (let y = -len / 2; y < len / 2; y += 24) g.poly([-w / 2, y, w / 2, y + 12, w / 2, y + 24, -w / 2, y + 12]).fill(0xd83030);
  g.rect(-w / 2, -len / 2, w, len).stroke({ width: 2, color: COL.ink, alpha: 0.8 });
  return g;
}

/** A padlock, `s` high. */
export function padlock(s: number): Graphics {
  const g = new Graphics();
  const u = s / 24;
  g.roundRect(-7 * u, -14 * u, 14 * u, 14 * u, 7 * u).stroke({ width: 4 * u, color: 0xc4ccd4 });
  g.roundRect(-11 * u, -4 * u, 22 * u, 18 * u, 3 * u).fill(COL.money).stroke({ width: 2.5 * u, color: COL.ink });
  g.circle(0, 3 * u, 2.6 * u).fill(COL.ink);
  g.rect(-1 * u, 3 * u, 2 * u, 6 * u).fill(COL.ink);
  return g;
}

/** The pulled rod's rug: a fringed cloth crumpled where the handle was. */
export function rug(w: number): Graphics {
  const g = new Graphics();
  const h = w * 0.5;
  g.poly([-w / 2, -h / 2, w / 2, -h / 2 + 4, w / 2 - 6, h / 2, -w / 2 + 4, h / 2 - 3]).fill(0x8a3a2a).stroke({ width: 2, color: COL.ink });
  for (let i = 0; i < 4; i++) g.rect(-w / 2 + 6 + i * (w / 4), -h / 2 + 6, w / 6, 4).fill({ color: COL.money, alpha: 0.7 });
  for (let x = -w / 2 + 4; x < w / 2 - 4; x += 5) g.moveTo(x, h / 2 - 2).lineTo(x + 1, h / 2 + 6);
  g.stroke({ width: 1.5, color: COL.money, alpha: 0.8 });
  return g;
}

/** A small market bell. */
export function bellIcon(s: number): Graphics {
  const g = new Graphics();
  const u = s / 24;
  g.poly([-10 * u, 8 * u, -8 * u, -4 * u, -4 * u, -10 * u, 4 * u, -10 * u, 8 * u, -4 * u, 10 * u, 8 * u]).fill(COL.money).stroke({ width: 2 * u, color: COL.ink });
  g.rect(-12 * u, 8 * u, 24 * u, 3 * u).fill(COL.money);
  g.circle(0, 13 * u, 2.5 * u).fill(COL.ink);
  g.circle(0, -12 * u, 2.5 * u).fill(COL.money);
  return g;
}

/** A goalkeeper's glove: the tight-lane mark. `s` high, drawn upright. */
export function glove(s: number, color = COL.ink): Graphics {
  const g = new Graphics();
  const u = s / 24;
  g.roundRect(-7 * u, -2 * u, 14 * u, 12 * u, 4 * u).fill(color);
  for (let i = 0; i < 4; i++) g.roundRect((-7 + i * 3.6) * u, -11 * u + Math.abs(i - 1.5) * 1.5 * u, 3 * u, 10 * u, 1.5 * u).fill(color);
  g.roundRect(5 * u, -4 * u, 4 * u, 8 * u, 2 * u).fill(color);
  g.rect(-7 * u, 7 * u, 14 * u, 3 * u).fill({ color: 0xffffff, alpha: 0.35 });
  return g;
}
