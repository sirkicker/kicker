# Changelog

## 4.0.0 · Club (2026-11-04)
KICKER is now a manager game. Same felt, same brass, same stands.

### Your club
- Found a club with a name and a kit. You get 14 live vibe/vibe launches: eleven on the rods, three on the bench.
- Every launch brings three numbers from its market: curve progress is Power, trades in 24h are Pace, holders are Grip. Each rod reads them its own way. Attack shoots, midfield links, defence stops, the keeper saves.
- The squad screen: tap two players to swap them, pick a captain, set a tactic. Press beats Hold, Hold beats Counter, Counter beats Press.
- The scout brings three launches every week. One signing a week.

### The league
- A league week runs Monday to Sunday, eight clubs to a group. Empty places go to house clubs, marked as such.
- You play every club in your group once, up to three league matches a day. Whoever plays first hosts, and the other club sees the result in its table.
- Matches play themselves on the table. You make three calls: at 30', at the hour (a substitution or a tactic answer) and with fifteen left (park it, push, all in).
- The server keeps the match seed until full time, so no one can look ahead before deciding. At full time the seed is published and the match replays exactly.
- Friendlies against any recent club cost nothing and count for nothing. A level friendly goes to penalties: read the taker, pick your spot, pick your dive.

### Drills (two a day)
- **Training:** a ball runs across one rod, faster each time, and you tap to stop it on a figure. Form for that rod in the next league match.
- **The wall:** slide your keeper and defence to cover three shot lines. Each line covered makes them miss more.
- **Press room:** one question from the wire, three answers. The stands get louder at home.

### No wallet
- Your club lives in this browser as a key. **Save key** keeps it, so you can bring the club to another device.
- The server keeps the club and a hash of the key, nothing else.

### The old table
- The 3.0 season game stays at `/classic.html`. Old links and posted seasons work as before.

## 3.0.1 · Easy start (2026-11-03)
- A gold tag on the table marks a good next touch: SLIDE, PASS, SHOOT, BLOCK or READY. New players see it for their first two matches; after that it comes back when you are stuck for a few seconds, or when you press **What now?** (was "Show me a touch").
- The possession panel says what to do in plain words: open shot, open pass, or slide a rod to open a lane. On their ball: block the red line, then Ready.
- The first-match walkthrough is shorter and follows the gold tag. On a phone it sits over the club header, clear of the rods and their handles.
- How to play opens with a four-line version.

## 3.0.0 · Matchday (2026-11-03)

### The season (rules 3)
- A season is seven rounds: two league matches and a cup tie each, 21 matches.
- An eight-club league, you and seven: a double round robin over 14 matchdays, three points a win, one a draw. Every club has a seeded form, and the other results of each matchday are played out from the seed.
- A league loss no longer ends the season; the table does, once the top two are out of reach or you finish below second.
- A cup tie against a boss club has to be won. In the top two when it comes round, it is a home tie: +1 touch on your first ball.
- The top two meet in the final under the Closing Bell's rule; top of the league gets the extra touch.
- Fans: 3 a league win, 4 a cup tie, 1 a league draw, plus goals.
- Old trails still replay under the 2.1 rules; new runs carry the `R3` rules token, and the server refuses a token it does not know.

### On the table (rules 3)
- Tight lanes: a shot into a lane beside their keeper meets the keeper's reach as one more blocker. A one-touch shot straight off a pass, or a shot off a side wall, beats it for free. Amber disc, a glove when it is saved, "past the glove" when it goes in.
- Pace plays: a pass to a Pace figure gets no reaction, so it shoots first time (and skips the Mempool Jam queue).
- Grip plays: on their ball a Grip figure in defence or midfield is a wide body, a Grip keeper reaches both sides, and a Grip block that wins the ball back is worth a touch. The covered cells show on the felt.
- Build-up: two passes put +1 Power on the shot, and a goal off two or more is a Team move.
- Seeded kickoffs: each club opens from one of its style's formations.
- Table events, one per league match: Volatile, Thin book (its sticky lane drawn through midfield), Green candle, Halt on the half.
- Their own Power launches shoot through one more blocker; in the final and on the Haunted table, all of them do. The rival gets sharper a step at a time and only half-reads you before it reads you fully.
- Trading Halt thaws at the first goal: the tape comes off the rod.
- Defence turns with nothing to block play themselves; you are only asked to defend a threat.

### The title
- Three plays up front: **New season** (or Continue season), **Daily match day** and **Haunted**. Everything else sits in one row: How to play, Hall of goals, Your table, Transfer list, More.
- The five launches on the title rod pass a ball along the line and into the net. Reduced motion keeps them still.
- Today's transfer list on the wide title is three launches with big heads, one for each stat: furthest up the curve, the busiest, the most held. The full list is one tap away.
- What's new shows only to returning players; a first visit goes straight to the title.

### Match day
- Fixture tiles carry each club's kit and crest, its chant, its captain (a real launch from the cut, picked by how the club plays, with a temperament tag) and your record against it, kept on this device.
- The league table (eight clubs, each club's form, the top-two line) shows after every match and from match day. League tiles carry the matchday; a cup tie in the top two says it is a home tie.
- Your eleven on four brass rods with their heads; tap one for its launch.

### Full time, the dressing room, the boss
- Full time is a match report: the score with both crests, the desk's line, your scorers with their launch heads, the goal of the match drawn on the felt, the fans counted in, the next fixture and the league table.
- The dressing room is a locker wall: coaches in their lockers on Academy, First team or Club legend plates, training kit and set pieces beside them, every description printed, the price on the door. On a phone it is a 2×2 wall.
- A boss club walks out: the crest slams down, the rule gets its own banner, their captain and their chant come with it.
- The screens between matches are HTML now, so the type stays sharp and readable on a phone.

### The season ends with a programme
- A match-day programme: a cover in your kit with the figures of your best goal, the launch of the season, the goal of the season drawn on a mini felt, the rival of the season and three lines from the desk.
- One Save image, then Challenge link, New season, Title. A name is optional.

### Sharing and the Hall
- The share image draws the best goal's move under the five figures: a gold line, a ring where it came off a wall, the scorer's head in the net. Seasons and Haunted runs both. The move is played again from the posted trail; nothing new is stored.
- Hall rows show each goal's move on a mini felt, read once the row scrolls into view.

### Daily match day
- The Daily Match is one match day under rules 3 (trail token `R3_D`): a friendly, a league match and a boss club, the same for everybody, about five minutes. It goes to the Daily board only. Same daily seed, same streak.

### Copy
- How to play and What's new cover the 3.0 season, tight lanes, first-time shots, wide bodies, the build-up, table events and the league. README and docs images refreshed.

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
