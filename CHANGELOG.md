# Changelog

## 1.2.0 · Sign in, sit down (2026-10-21)

### The cards are live, and now you can see it
- Hover a card (or hold it on a phone) for its data tag: holders, 24h trades, age at the deal, price direction, curve progress behind the rank, graduated, gift list and badge. These are the exact numbers the Insiders read, plus what your Insiders would pay for that card right now.
- Small dots down a card's left edge mark each held Insider that would score it, in that Insider's colour. Hover an Insider and its cards get a frame. The check is the engine's own scoring condition, so what lights up is what scores.
- The shop says one true thing about your deck that matters to an Insider on offer ("This deck is young: 14 of 52 launched under 6 h before the deal. Early Bird likes that.").
- How to play has a new section, "The cards are live".

### A title that fits
- One screen on every size, no scrolling: the logo, a fan of five real cards from today's deck, two rows of buttons and a slim footer. The rest moved into a small "More" sheet and the in-game Menu.
- Sign in sits top right as a plain gold pill; Music and Sound are two small icon toggles top left.
- On desktop, two panels fill the sides: today's Daily board (top 10, seed and deck, your best and streak, the countdown to the next Daily) and today's deck (suits, curve, the busiest launches, youngest and oldest, the red and the graduated, stock pairs, the next cut), each fact tagged with the Insider it feeds.

### Sign in
- Sign in with email, Google, X, Discord or a browser wallet (MetaMask, Coinbase Wallet and others), all through Para's own modal. A Para wallet is made for you if you have none; it starts with no `$KICKER`.
- The page itself never calls a wallet: no `window.ethereum`, no EIP-6963 discovery, no `eth_requestAccounts`. The old injected-wallet connect is gone.
- Para loads only when you open sign-in, or hover, focus or touch the button. The first load doesn't carry it.
- Optional. Signed out, every hand plays exactly the same.

### Your name is yours
- One plain signed message a day (no gas, no transaction) ties your Hall of hands name to your address. After that, nobody else can post a run under it, in any case.
- A name someone posted in the last 7 days can't be grabbed by somebody else; the device that posted it can still claim it.
- Claimed names get a small ✓ in the Hall of hands and on the Daily board. It is not the house mark.

### Your table
- Signed in, your Daily streak, your best hand of each day and your last 30 posted runs follow you to any device, with replay and same-seed links.
- Signed out, Your table shows this device's record, as before.

### House colours
- Same sign-in, same signature: holders of `$KICKER` get the card backs, felts and house mark for the day. Cosmetic only, as before.
- Smart-account wallets are checked too (ERC-1271, one read call on Robinhood Chain testnet).

### The table
- Card corners like a real deck: rank with the suit stacked under it, top left, readable in a fanned hand. The full pair sits on the face, under the picture.
- A centre for the felt: a faint woven KICKER mark, and a live read of the selected hand ("Pair · 20 × 2") where the played cards land.
- Bigger cards on big and tall screens, a softer lamp over the felt, a small lift when you pick a card.
- On phones the tutorial note moves to the top bar, so it never sits on the blind's Play button, and the whole lower tile answers the tap.

### Words
- Decks are cut every few hours, and the title now says so ("Today's pool" instead of "This hour's cards").
- Blinds now show their **Cash-out**: game money that buys things in the shop and nothing else.
- The title footer links **@kyriektnrv on X**, next to `$KICKER` and Source, with one plain line: testnet, test tokens, no real value, and KICKER never asks for a seed phrase, a key or funds.

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
