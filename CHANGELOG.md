# Changelog

## 2.1.0 · Haunted table (2026-11-02)

### Haunted table, through 6 Nov
- A three-match event mode on the title, for the spooky week on Robinhood Chain testnet: two ghost clubs and The Haunted XI.
- Ghost clubs are built from the cut's quietest launches: the ones with no trades in the last 24h (new cuts keep up to 16 of them aside), then the quietest on the list. Their tags give the 24h trade count. They play pale and see-through, with their own token pictures.
- Three ghost rules, all fixed by the seed: **Phasing** (one of their rods blocks only on every other touch of yours, SOLID or FADED at its handle), **Poltergeist** (after each kick of yours one of their rods drifts a lane on its own, shown at its handle a touch before), **Graveyard shift** (the lights are low and the ball carries a lantern; kick lines and threats stay lit).
- Night table: deep felt, mist at the goal mouths, a pumpkin ball with an ember trail, carved lanterns on the goals, cobwebs in the corners. Small synthesized stings for a ghost block, a poltergeist move and a Haunted goal.
- A **Haunted** board in the Hall of goals: the day's best Haunted goals, through the same post as every season (one file per day, no new list or put loops). The server replays the run under the mode the trail carries; a mode flag that disagrees with its trail is refused.
- **Haunted kit**: win a Haunted match while the event runs and your device (and Your table, when signed in) keeps a small mark. Cosmetic only.
- A Haunted share image: night felt, the pumpkin, your goal's figures and the ghost club behind them.
- After 6 Nov 23:59 UTC the title shows "Haunted table: closed" and the mode stays playable.

### A better table
- The table fills the play area; the left column holds the club, score, touches, stats and the bench.
- Figures are table-football men from above: shoulders and arms in the kit, the launch picture as the head, a boot that swings on the kick. The rivals are the same kind of figure, in turquoise, with real launch pictures. The figure on the ball glows.
- Rod controls sit on the rod handles at the table edge, with readable labels. Drag a rod (or any of its figures) to slide it; the handle buttons stay as the fallback.
- Empty bench seats read as seats: a dim silhouette and "Coach slot" / "Set piece".
- Juice: the ball leaves fast and loses pace, a block clacks with a flash and a small shake, the net bellies on a goal with a short crowd swell, rods settle with a thunk. Reduced motion is respected.
- Clubs have a style: **Parks the bus**, **Presses high**, **Shoots from distance**. Still deterministic, still sharper by the round.
- A four-prompt walkthrough in your first match (slide, pass, shoot, block), skippable, shown once.
- Match day: three big club tiles with crests drawn from each club's name (boss and ghost crests their own), your eleven on four rods, and the dressing room reachable before kick-off.
- A reload or a bookmark lands on the title (with Continue), never mid-season. A shared seed link shows the seed on the title with a Play button.
- HUD fixes: the score, the Goals count and the touch pips move together during a goal; the Ready and hint buttons follow the table during playback.
- A tap on a kick target on a phone no longer gets lost to a hover preview.

## 2.0.0 · Table football (2026-11-01)

Kicker is the German word for table football. As of 2.0 the name means what it says: KICKER is a turn-based table football season, and every figure on your rods is a live vibe/vibe launch.

### The table
- Four rods a side, interleaved like a real table: keeper (1), defence (2), midfield (5), attack (3). Ten lanes across, a goal mouth of two.
- Your ball: four touches a possession. Slide a rod one lane, or kick with the figure on the ball: a pass further up, or a shot. The ball runs straight or one lane sideways per rod it crosses, and comes back off the side walls. Any figure of theirs in its lane blocks it.
- The rival reacts after every touch, covering your most dangerous lane, and sets up before your first. It gets sharper by the round.
- Their ball: red and amber lines show where it can go; two block slides a possession, then Ready.
- Brass rods with grips off the edges, figures from above in wine (yours) and turquoise (theirs), goal nets, a ball with a short trail, a rod slide you can hear, a kick that rocks the figure, and a goal you can see from across the room.
- On phones the table stands upright: your goal at the bottom, your rod arrows on the right.

### Figures are launches
- Your eleven are drawn by the seed from today's cut and placed by their numbers.
- **Power** from curve progress (10%+): an attacker's shot goes through one blocker. **Pace** from 24h trades (10+): a free slide for its rod every possession. **Grip** from holders (6+): a blocked pass keeps the ball, once a possession.
- The data tag shows the numbers and where each stat comes from; hovering a coach lights the figures it works on. Both use the engine's own checks.
- Swap any two figures in the Line-up before a match.

### The season
- Eight rounds of a friendly, a league match and a boss club. First to 2, six possessions each; the final is first to 3.
- A friendly or league match can end level: you go through without the win fans. A boss club has to be beaten.
- Ten boss clubs: The Rug, Trading Halt, Vibe Check, The Depeg, Gas Spike, Mempool Jam, Max Slippage, Lockup, Wash Trade, and the Closing Bell as the final.
- Balance from 300 bot seasons: the bot gets to round 7 on the median, reaches the final about three times in ten, and lifts the trophy about three times in a hundred.

### The dressing room
- Fans from wins and goals. Every price is printed; the shelf is fixed by the seed.
- 31 coaches, most of them reading the launches on your rods. Four kinds of training. Six set pieces, one use each.

### Goals, the Hall and challenges
- Goals are rated for passes, angles, walls, blockers beaten, distance and touches to spare. A season's best goal is its score.
- The **Hall of goals** replaces the old Hall: the day's top 50 best goals, and the Daily board, one line per name.
- Challenge links: the server plays every touch again and refuses forged, reordered or unfinished trails. The image for X shows the figures behind your best goal. The share button says Save.

### Kept
- The Daily Match (one seed a day, the same squad for everybody), streaks, seeds and challenge links.
- Sign-in through Para, names you own, Your table.
- House colours are now **team kits**: three kits and felts for `$KICKER` holders, cosmetic only.
- The look: wine and teal, the felt, the woven mark, the vibers, the gold sign-in, the sound.

### Also
- Seasons, the Hall and the Daily board start fresh in 2.0. Links from older versions open the title with a note.

## 1.2.0 · Sign in, sit down (2026-10-21)

- Sign-in through Para (email, Google, X, Discord or a browser wallet), loaded only when you reach for it. The page itself never calls a wallet.
- Names you own: one plain signed message a day claims your name for your address.
- Your table: your Daily streak and recent results follow you to any device.
- Data tags for every launch; a title that fits one screen, with today's Daily board and today's launches on the sides; a footer with the X link and a plain testnet note.

## 1.1.0 · House colours (2026-10-14)

- The Daily: one seed a day for everybody, on a pinned cut, with its own board and a streak.
- House colours for `$KICKER` holders, cosmetic only.
- A what's-new note, shown once per device.

## 1.0.0 (2026-10-07)

First release: a roguelike played with live vibe/vibe launches, seeds and challenge links, and a daily Hall.
