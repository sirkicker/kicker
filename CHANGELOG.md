# Changelog

## 1.1.0 · House colours (2026-10-14)

### Daily Deal
- One deal per UTC day, the same for everybody. The seed is plain arithmetic on the date; the deck is pinned once, the first deck cut after 00:00 UTC, and stays put while the hourly decks roll on.
- A **Daily Deal** button on the title screen, with the date and how many players have posted the day's deal.
- A **Daily Deal** tab in the Hall of hands: the top 50 of the UTC day, one line per name, best run counts. Runs get in the same way challenges do: the server replays every move, so a forged move list is rejected.
- Daily share cards and links: "Daily Deal · Oct 14 · 41,250".
- A streak on your device for finishing the Daily Deal on consecutive days.

### House colours
- `$KICKER` holders can sign a plain text message (no gas, no transaction) to switch on house colours for the day: three card backs and felts (Closing Bell, Ticker Tape, Pink Sheets) and a small house mark next to their name in the Hall of hands and on share cards.
- Cosmetic only. It never changes the cards, the score or the odds. Without a wallet the game plays exactly as before.
- Wallets are found through EIP-6963 discovery. No SDKs, and the site never asks for a seed phrase or a private key.

### Also
- A what's-new note, shown once per device and kept in the menu.
- Fixed a race where the title screen could keep saying "Cutting the deck..." after the deck had arrived.
- Hall rows stack on narrow phones instead of squeezing the hand.
- `npm test` runs unit tests for the daily seed, the deck pin, the Daily board and the house checks.

## 1.0.0 (2026-10-07)

First release: a poker roguelike dealt from live vibe/vibe launches, seeds and challenge links, the Hall of hands.
