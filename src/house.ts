// House colours: team kits and felts for $KICKER holders. Cosmetic only: nothing in here is read by the engine,
// so it never changes a figure, a goal or a result. Without a sign-in, the house kit stays.
import { HOUSE_CHAIN } from "../shared/house.js";
import { local } from "./store.js";

export interface Look {
  id: string;
  name: string;
  blurb: string;
  kit: number; // your figures' shirts
  kitHi: number;
  trim: number; // boots, collar, pair mark
  felt: number;
  feltHi: number;
  swirl: [number, number, number];
}

/** Team kits. The house kit is everybody's; the other three come with $KICKER, for the look only. */
export const LOOKS: Look[] = [
  { id: "house", name: "House", blurb: "Wine shirts on teal felt. Everybody's kit.", kit: 0xa3245f, kitHi: 0xe0538f, trim: 0xffc23d, felt: 0x0c3438, feltHi: 0x14494e, swirl: [0x3a0a2c, 0x0e5257, 0xb01a66] },
  { id: "bell", name: "Closing Bell", blurb: "Black and gold, for after the last trade.", kit: 0x241018, kitHi: 0x5b3a1a, trim: 0xffc23d, felt: 0x2b1d08, feltHi: 0x6b4a10, swirl: [0x22100a, 0x3d2a0c, 0x9a6a12] },
  { id: "tape", name: "Ticker Tape", blurb: "Navy with a cyan collar, on deep water.", kit: 0x1d2f6e, kitHi: 0x3f5bb5, trim: 0x27c4e8, felt: 0x0a2638, feltHi: 0x1a6a86, swirl: [0x0a1428, 0x0b4a5c, 0x1aa7c9] },
  { id: "sheets", name: "Pink Sheets", blurb: "Hot pink, unlisted, unbothered.", kit: 0xd42a6f, kitHi: 0xff7aa8, trim: 0x1a0816, felt: 0x3a0b2b, feltHi: 0x8a2058, swirl: [0x2a0620, 0x5b1243, 0xd42a6f] },
];

export interface HouseState {
  claim: string;
  name: string;
  day: string;
  expires: number;
  address: string;
}

export const house = {
  get(): HouseState | null {
    const h = local.get<HouseState | null>("kk.house", null);
    return h && typeof h.expires === "number" && h.expires > Date.now() ? h : null;
  },
  set(h: HouseState | null) {
    if (h) local.set("kk.house", h);
    else local.del("kk.house");
  },
};

/** The look on the table now: a holder's pick while their claim lasts, otherwise the house one. */
export function look(): Look {
  if (!house.get()) return LOOKS[0];
  const id = local.get<string>("kk.look", "house");
  return LOOKS.find((l) => l.id === id) || LOOKS[0];
}

// The claim itself comes with the day's sign-in (src/me.ts): one signed plain message, through Para.

export const CHAIN_NAME = HOUSE_CHAIN.name;
