// The live side of a figure, made visible: the data tag, the coach highlights and the dressing room's squad line.
// Everything here reads the same fields and thresholds the engine plays by (Run.statSources in engine.ts),
// so what the table shows is what the match does.
import { PAIRS, STAT, type Launch } from "./data.js";
import { COACH } from "./content.js";

export interface FigFacts {
  title: string;
  lines: [string, string][];
}

const pct = (bps: number) => `${(bps / 100).toFixed(bps < 1000 ? 1 : 0)}%`;

export function ageLabel(hours: number): string {
  const h = Math.max(0, hours);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} days`;
}

type Sources = Keyed<"power" | "pace" | "grip", string[]>;

const why = (src: string[], own: string) =>
  src.length ? `yes (${src.map((s) => (s === "base" ? own : COACH[s]?.name || s)).join(", ")})` : "no";

/** The tag: the launch's numbers, and which stat each one gives this figure. `sources` is Run.statSources(launch). */
export function figureFacts(l: Launch, ageHours: number, sources?: Sources): FigFacts {
  const price = l.x === null ? "no trades to compare yet" : l.x < 0 ? `down ${pct(-l.x)} (latest window)` : l.x > 0 ? `up ${pct(l.x)} (latest window)` : "flat";
  const lines: [string, string][] = [
    ["Launch", l.n],
    ["Pair", `${PAIRS[l.u].name}, paired with ${l.q}`],
    ["Curve", `${pct(l.p)}${l.g ? ", the whole curve flown" : ""}`],
    ["Trades 24h", l.k.toLocaleString("en-US")],
    ["Holders", l.h.toLocaleString("en-US")],
    ["Age", `launched ${ageLabel(ageHours)} before the cut`],
    ["Price", price],
    ["Gift list", l.d ? "yes" : "no"],
  ];
  if (sources) {
    lines.push(["Power", why(sources.power, `curve ${pct(STAT.power.at)}+`)]);
    lines.push(["Pace", why(sources.pace, `${STAT.pace.at}+ trades`)]);
    lines.push(["Grip", why(sources.grip, `${STAT.grip.at}+ holders`)]);
  }
  return { title: `$${l.s}`, lines };
}

// ------------------------------------------------------------ the dressing room's line about your squad
interface Fact {
  coach: string;
  count: number;
  line: (n: number, total: number) => string;
}

/** True facts about your squad, each tied to the coach it feeds. Zero counts never make a line. */
export function squadFacts(squad: Launch[], ageOf: (l: Launch) => number): Fact[] {
  const n = (f: (l: Launch) => boolean) => squad.filter(f).length;
  const many = (k: number, t: number) => k * 3 >= t;
  const figs = (k: number) => `${k} ${k === 1 ? "figure" : "figures"}`;
  const is = (k: number) => (k === 1 ? "is" : "are");
  const has = (k: number) => (k === 1 ? "has" : "have");
  const runs = (k: number) => (k === 1 ? "runs" : "run");
  const facts: Fact[] = [
    { coach: "early", count: n((l) => ageOf(l) < 6), line: (k, t) => `${many(k, t) ? "A young squad: " : ""}${k} of ${t} launched under 6 h before the cut.` },
    { coach: "oldmoney", count: n((l) => ageOf(l) >= 24), line: (k, t) => `${many(k, t) ? "Old heads: " : ""}${k} of ${t} ${is(k)} more than a day old.` },
    { coach: "dip", count: n((l) => l.x !== null && l.x < 0), line: (k, t) => `${many(k, t) ? "Lots of red: " : ""}${figs(k)} ${is(k)} down.` },
    { coach: "volume", count: n((l) => l.k >= 3 && l.k < STAT.pace.at), line: (k) => `${figs(k)} trade 3 to ${STAT.pace.at - 1} times a day: one short of Pace.` },
    { coach: "whale", count: n((l) => l.h >= 2 && l.h < STAT.grip.at), line: (k) => `${figs(k)} ${has(k)} 2 to ${STAT.grip.at - 1} holders: just short of Grip.` },
    { coach: "moonboy", count: n((l) => l.p >= 300 && l.p < STAT.power.at), line: (k) => `${figs(k)} ${is(k)} 3% to 10% along the curve: almost Power.` },
    { coach: "snob", count: n((l) => l.s.length <= 3), line: (k) => `${figs(k)} ${has(k)} a ticker of 3 letters or fewer.` },
    { coach: "airdrop", count: n((l) => l.d), line: (k) => `${figs(k)} ${runs(k)} a gift list.` },
    { coach: "pumpchaser", count: n((l) => l.x !== null && l.x >= 1500), line: (k) => `${figs(k)} ${is(k)} up 15% or more.` },
    { coach: "maxi0", count: n((l) => l.u === 0), line: (k) => `${figs(k)} ${is(k)} paired with Ether.` },
    { coach: "maxi1", count: n((l) => l.u === 1), line: (k) => `${figs(k)} ${is(k)} paired with a stock.` },
    { coach: "maxi2", count: n((l) => l.u === 2), line: (k) => `${figs(k)} ${is(k)} paired with VIBEVIBE.` },
    { coach: "maxi3", count: n((l) => l.u === 3), line: (k) => `${figs(k)} ${is(k)} paired with a private token or a dollar.` },
  ];
  return facts.filter((f) => f.count > 0);
}

/**
 * One dry line for the dressing room. Prefers a fact about a coach on offer (the one that touches the most figures);
 * with none on offer, the strongest fact, naming who would like it.
 */
export function roomHint(squad: Launch[], ageOf: (l: Launch) => number, offerIds: string[]): { text: string; coach: string; count: number } | null {
  const facts = squadFacts(squad, ageOf).sort((a, b) => b.count - a.count);
  if (!facts.length) return null;
  const onOffer = facts.find((f) => offerIds.includes(f.coach));
  const f = onOffer || facts[0];
  const name = COACH[f.coach]?.name || f.coach;
  const text = `${f.line(f.count, squad.length)} ${name} ${onOffer ? "likes that" : "would like that"}.`;
  return { text, coach: f.coach, count: f.count };
}
