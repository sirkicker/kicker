// The Daily Deal on the server: the day's deck is pinned once (the first deck cut after 00:00 UTC)
// and never moves, even as the hourly decks roll on. Its board keeps one line per name: their best.
import { editionNow } from "../shared/data.js";
import { dailySeed, dayStartHour, prevDay, utcDay, type DailyPin } from "../shared/daily.js";
import { currentEdition, getEdition } from "./_deck.js";
import { load, loadFresh, save, saveOver, Taken } from "./_store.js";
import type { HallEntry } from "./_runs.js";

export const pinPath = (day: string) => `daily/${day}/pin.json`;
export const boardPath = (day: string) => `daily/${day}/board.json`;
export const BOARD_SIZE = 50;
const MAX_NAMES = 20000;

export async function loadPin(day: string): Promise<DailyPin | null> {
  return load<DailyPin>(pinPath(day));
}

/**
 * The day's pinned deal. The first call of the day pins the earliest stored deck of that day,
 * cutting one if there is none yet. A race between two first calls is settled by the store:
 * the pin can't be overwritten, so the loser reads the winner's.
 */
export async function dailyPin(day = utcDay(), now = Date.now(), cut: () => Promise<{ id: number }> = currentEdition): Promise<DailyPin> {
  const have = await loadPin(day);
  if (have) return have;
  if (day !== utcDay(new Date(now))) throw new Error("no deal for that day");
  const start = dayStartHour(day);
  let edition: number | null = null;
  for (let id = start; id <= Math.min(editionNow(now), start + 23); id++) {
    if (await getEdition(id)) {
      edition = id;
      break;
    }
  }
  if (edition === null) {
    const ed = await cut();
    // the index is down and only yesterday's deck came back: don't pin it, wait for a fresh cut
    if (ed.id < start) throw new Error("today's deck is not cut yet");
    edition = ed.id;
  }
  const pin: DailyPin = { day, seed: dailySeed(day), edition, at: new Date(now).toISOString() };
  try {
    await save(pinPath(day), pin);
  } catch (e) {
    if (e instanceof Taken) return (await loadPin(day)) || pin;
    throw e;
  }
  return pin;
}

/** Which day's Daily Deal this (seed, deck) is, if any. Today, or yesterday for a run started before midnight. */
export async function dailyDayOf(seed: string, edition: number, now = Date.now()): Promise<string | null> {
  const today = utcDay(new Date(now));
  for (const day of [today, prevDay(today)]) {
    if (dailySeed(day) !== seed) continue;
    const pin = await loadPin(day);
    if (pin && pin.edition === edition) return day;
  }
  return null;
}

export interface DailyBoard {
  day: string;
  seed: string;
  edition: number | null;
  players: number;
  names: string[]; // lowercase, everyone who posted a verified daily run (never served)
  entries: HallEntry[];
}

export async function getBoard(day: string): Promise<DailyBoard> {
  const b = await loadFresh<DailyBoard>(boardPath(day));
  return b || { day, seed: dailySeed(day), edition: null, players: 0, names: [], entries: [] };
}

/** Public view: the top 50 and a player count, without the name list. */
export async function publicBoard(day: string) {
  const b = await getBoard(day);
  const pin = await loadPin(day);
  return { day, seed: b.seed, edition: pin?.edition ?? b.edition, players: b.players, entries: b.entries };
}

/** One counted line per name per day: a better hand replaces it, a worse one is ignored. */
export async function addToBoard(day: string, edition: number, entry: HallEntry): Promise<boolean> {
  const b = await getBoard(day);
  b.edition = edition;
  const who = entry.name.toLowerCase();
  let changed = false;
  if (!b.names.includes(who) && b.names.length < MAX_NAMES) {
    b.names.push(who);
    b.players = b.names.length;
    changed = true;
  }
  const mine = b.entries.find((e) => e.name.toLowerCase() === who);
  let placed = false;
  if (!mine || entry.total > mine.total || (entry.total === mine.total && entry.house && !mine.house)) {
    const next = [...b.entries.filter((e) => e.name.toLowerCase() !== who), entry]
      .sort((x, y) => y.total - x.total || x.at.localeCompare(y.at))
      .slice(0, BOARD_SIZE);
    if (next.some((e) => e.id === entry.id)) {
      b.entries = next;
      placed = changed = true;
    }
  }
  if (changed) await saveOver(boardPath(day), b);
  return placed;
}
