// Palette and type. Wine and deep teal felt, cyan, hot pink and amber accents, brass rods.
export const COL = {
  ink: 0x1a0816,
  ink2: 0x2a0f24,
  panel: 0x22091c,
  panelHi: 0x34112b,
  edge: 0x5a2048,
  felt: 0x0c3438,
  feltHi: 0x14494e,
  cream: 0xfff1dc,
  cream2: 0xf1dcc0,
  dim: 0xc9a9bd,
  cyan: 0x27c4e8,
  pink: 0xff3d7f,
  money: 0xffc23d,
  good: 0x3ddc97,
  bad: 0xff5a4f,
  play: 0x1aa7c9,
  danger: 0xd8336d,
  neutral: 0x6b3a5e,
};
export const CSS = {
  ink: "#1a0816",
  cream: "#fff1dc",
  cyan: "#27c4e8",
  pink: "#ff3d7f",
  money: "#ffc23d",
  dim: "#c9a9bd",
};
/** Pair-kind colours, bright for the dark table. */
export const PAIR_BRIGHT = [0x5ad7ff, 0xff7a3d, 0xff4fb4, 0xffd43b];
export const FONT = "Jersey 10";
export const NUM = "Jersey 10";
/** The rival clubs always play in turquoise. */
export const THEM = { main: 0x1aa7c9, hi: 0x7fe3f5, trim: 0x0c3b40 };
/** Brass rods and the table's wooden rail. */
export const BRASS = { bar: 0xc9a24a, hi: 0xf2d98c, lo: 0x7a5a1c, rail: 0x2a0f24, wood: 0x4a1a3a };

// ---------------------------------------------------------------- club kits (3.0)
export interface Kit {
  main: number;
  hi: number;
  trim: number;
}
/**
 * Each rival club's kit on the table, keyed by the club's name as the engine gives it (`Match.club`), boss clubs and
 * the Haunted clubs included. Shared with the match-day crests through CSS vars.
 * None of them is wine or hot pink, so your side always reads as yours. A club missing here plays in turquoise.
 */
export const CLUB_KIT: Keyed<string, Kit> = {
  "Floor Price FC": { main: 0xe8742a, hi: 0xffb26e, trim: 0x3a1a08 },
  "Liquidity Town": { main: 0x2f8fe0, hi: 0x9ad0ff, trim: 0x0b2a4a },
  "Real Mempool": { main: 0xdfe4ec, hi: 0xffffff, trim: 0x2a3550 },
  "Sporting Slippage": { main: 0x2fae5a, hi: 0x9ff0b8, trim: 0x0b3a1c },
  "Dynamo Dip": { main: 0x3150d6, hi: 0x8fa2ff, trim: 0x0d1640 },
  "Athletic Bagholders": { main: 0xe0502a, hi: 0xffa07a, trim: 0x3a0f06 },
  "Inter Testnet": { main: 0x1f2a6e, hi: 0x5f86ff, trim: 0x5f86ff },
  "AC Airdrop": { main: 0x2a2a30, hi: 0xff6a4a, trim: 0xe04a3a },
  "Olympique Oracle": { main: 0x6fc6e8, hi: 0xd2f4ff, trim: 0x123a52 },
  "Borussia Bridge": { main: 0xf2c81c, hi: 0xfff09a, trim: 0x1a1408 },
  "Rapid Rebase": { main: 0x1f8a4c, hi: 0x7fe0a6, trim: 0xf4fbf6 },
  "Union Unlock": { main: 0xe8b83a, hi: 0xffe39a, trim: 0x1d3fae },
  "Racing Rollup": { main: 0x8fd0f0, hi: 0xe6f8ff, trim: 0x16405a },
  "Atletico Allowlist": { main: 0xd23a3a, hi: 0xff9a8a, trim: 0xf4f0ea },
  "Deportivo Degen": { main: 0x2459c8, hi: 0x86b0ff, trim: 0xf2f6ff },
  "United Validators": { main: 0x7a3fd0, hi: 0xc4a2ff, trim: 0x1a0c38 },
  // boss clubs
  "The Rug": { main: 0x8a5a2a, hi: 0xd9a46a, trim: 0x2a1406 },
  "Trading Halt": { main: 0xd83030, hi: 0xff8a80, trim: 0xf4f0ea },
  "Vibe Check": { main: 0x9ad83a, hi: 0xe2ff9a, trim: 0x223a06 },
  "The Depeg": { main: 0x3ad8b0, hi: 0xb0ffe8, trim: 0x0a3a30 },
  "Gas Spike": { main: 0xff7a1a, hi: 0xffc080, trim: 0x3a1600 },
  "Mempool Jam": { main: 0x5a6a8a, hi: 0xb0c0e0, trim: 0x141c2e },
  "Max Slippage": { main: 0x9ab8d8, hi: 0xe4f0ff, trim: 0x1c2c40 },
  Lockup: { main: 0x6a7480, hi: 0xc4ccd4, trim: 0x16191d },
  "Wash Trade": { main: 0x8a4ad8, hi: 0xc9a8ff, trim: 0x1e0c3a },
  "Closing Bell": { main: 0x1a1408, hi: 0xffd25a, trim: 0xffc23d },
  // the Haunted table
  "Crypt Rovers": { main: 0xcfe3ee, hi: 0xf4fbff, trim: 0x8fb6c8 },
  "Graveyard United": { main: 0xcfe3ee, hi: 0xf4fbff, trim: 0x8fb6c8 },
  "The Haunted XI": { main: 0xcfe3ee, hi: 0xf4fbff, trim: 0x8fb6c8 },
};
/** A club's kit, or the turquoise every club wore before 3.0. */
export const kitOf = (club: string | null | undefined): Kit => (club && CLUB_KIT[club]) || THEM;
/** CSS colour from a hex number. */
export const cssHex = (n: number) => "#" + n.toString(16).padStart(6, "0");
/** Pair-kind tape colours for the goal (ETH, Stocks, Vibe, Private), plus gold. */
export const TAPE = [0x5ad7ff, 0xff7a3d, 0xff4fb4, 0xffd43b, 0xfff1dc];
/** A club's kit as inline CSS vars, for a crest or a tile in the DOM: `style={kitVars(club)}`. */
export function kitVars(club: string | null | undefined): Keyed<string, string> {
  const k = kitOf(club);
  return { "--club-main": cssHex(k.main), "--club-hi": cssHex(k.hi), "--club-trim": cssHex(k.trim) };
}
