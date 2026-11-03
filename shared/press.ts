// The press room: one question from the wire a day, three answers. An answer sets the club's mood (1..3), which makes
// the stands louder at the next home match. Dry market-wire voice, no exclamation marks. Pure and seeded.
import { hash32, shuffle, stream } from "./rng.js";

export interface PressAnswer {
  text: string;
  mood: 1 | 2 | 3;
  /** What the stands say back. */
  react: string;
}
export interface PressQuestion {
  q: string;
  answers: [PressAnswer, PressAnswer, PressAnswer];
}

/** The effect an answer shows before you pick it. */
export const moodLabel = (m: number) => `Stands louder at home: +${m}`;

const A = (text: string, mood: 1 | 2 | 3, react: string): PressAnswer => ({ text, mood, react });

export const PRESS: PressQuestion[] = [
  {
    q: "Your defence conceded three last week. Is the back line overvalued?",
    answers: [
      A("We price it on fundamentals, not on one week.", 3, "The stands nod. Fundamentals it is."),
      A("Every line has a bad candle.", 2, "A few scarves go up. Mild support."),
      A("No comment until the next print.", 1, "The stands check their phones."),
    ],
  },
  {
    q: "Your striker has not scored in four matches. Time to sell?",
    answers: [
      A("We hold through the drawdown.", 3, "Diamond hands in the north stand."),
      A("He is accumulating. Quietly.", 2, "Polite applause from the corner."),
      A("Everyone is for sale at the right price.", 1, "Murmurs. Nobody likes that answer."),
    ],
  },
  {
    q: "Rivals say your club is all hype and no volume. Response?",
    answers: [
      A("Check the order book on Saturday.", 3, "The stands start a slow chant."),
      A("Hype is just volume that has not arrived yet.", 2, "Half the crowd laughs. Half writes it down."),
      A("We do not read their newsletter.", 1, "A dry chuckle from the press box."),
    ],
  },
  {
    q: "The midfield looked tired. Are the legs still liquid?",
    answers: [
      A("They ran ninety minutes on thin gas. Respect it.", 3, "Applause rolls down the terraces."),
      A("We rotate when the spread widens.", 2, "Some nods. Some yawns."),
      A("Ask me after the next block.", 1, "The room waits for a better quote."),
    ],
  },
  {
    q: "Is this the season the club finally reaches the top?",
    answers: [
      A("We do not chase tops. We build floors.", 3, "The home end sings about floors."),
      A("Targets are internal.", 1, "The journalists sigh in unison."),
      A("Up only, within reason.", 2, "A ripple of cautious optimism."),
    ],
  },
  {
    q: "Your keeper let in a soft one. Confidence shaken?",
    answers: [
      A("One bad fill does not make a bad trader.", 3, "The stands chant the keeper's ticker."),
      A("He has seen worse charts.", 2, "Sympathetic noise from behind the goal."),
      A("We are reviewing the tape.", 1, "Silence. The tape is long."),
    ],
  },
  {
    q: "A rival manager called your tactics outdated. Thoughts?",
    answers: [
      A("Old tactics, new prices.", 2, "A smirk spreads across the away end."),
      A("Outdated is just early in reverse.", 3, "The home end prints it on a banner."),
      A("We will discuss it on the table.", 1, "A short nod from the stands."),
    ],
  },
  {
    q: "The crowd booed at half time. Do you hear them?",
    answers: [
      A("They are our best signal. We listen.", 3, "The boos turn into a chant."),
      A("Volatility is part of the product.", 2, "A shrug from the season ticket rows."),
      A("I had headphones on.", 1, "Nobody is sure it was a joke."),
    ],
  },
  {
    q: "Is your new signing worth the fuss?",
    answers: [
      A("Bought on numbers, kept on character.", 3, "The new name gets its first chant."),
      A("Early days. Thin book.", 2, "Curious murmurs from the stands."),
      A("Ask the scout.", 1, "The scout is not in the room."),
    ],
  },
  {
    q: "Your club had the least possession in the league. Concerned?",
    answers: [
      A("Possession is a vanity metric. Goals settle.", 3, "The home end agrees loudly."),
      A("We let others hold the bag.", 2, "Knowing laughs from the press box."),
      A("We will look at the data.", 1, "The data team waves weakly."),
    ],
  },
  {
    q: "What did you tell the players at half time?",
    answers: [
      A("Stop overtrading the ball.", 2, "Some approving nods."),
      A("Same plan, tighter spreads.", 1, "Notebooks close. Nothing to print."),
      A("The second half is a fresh candle.", 3, "The stands repeat it like a mantra."),
    ],
  },
  {
    q: "Is the league table telling the truth this week?",
    answers: [
      A("Tables lag. The table will catch up.", 3, "The home end likes the sound of that."),
      A("It is a snapshot, not a forecast.", 2, "Measured applause."),
      A("I do not look at it.", 1, "Everyone knows he looks at it."),
    ],
  },
  {
    q: "Your captain was quiet on the pitch. Leadership problem?",
    answers: [
      A("Quiet captains move the market most.", 3, "The captain's name rolls round the ground."),
      A("He leads by holding position.", 2, "A respectful murmur."),
      A("We will talk internally.", 1, "The press smells nothing."),
    ],
  },
  {
    q: "Fans say ticket prices went up. Fair?",
    answers: [
      A("Seats are free. The noise is what we price.", 3, "The stands get noisier to prove it."),
      A("Everything reprices eventually.", 1, "A few groans from the upper tier."),
      A("Bring a friend. Halve the cost.", 2, "Laughter from the family stand."),
    ],
  },
  {
    q: "Can a club made of launches really play football?",
    answers: [
      A("Every launch on our rods has a curve and a crowd.", 3, "The crowd takes that personally. In a good way."),
      A("It plays better than some clubs with real legs.", 2, "A chuckle from the back row."),
      A("Watch and decide.", 1, "A short silence, then a cough."),
    ],
  },
  {
    q: "You lost to a house club. Embarrassing?",
    answers: [
      A("The house always shows up. So do we, next time.", 3, "The home end claps the honesty."),
      A("House clubs are underpriced.", 2, "A few nods from the analysts."),
      A("Every loss is tuition.", 1, "Tuition is expensive, someone mutters."),
    ],
  },
  {
    q: "Rumour says you want a new keeper. True?",
    answers: [
      A("Our keeper is not on the market.", 3, "The keeper gets a standing ovation."),
      A("We always watch the free list.", 2, "Curious noise from the stands."),
      A("I never comment on rumours, except this one.", 1, "The press is still confused."),
    ],
  },
  {
    q: "Your side scored late again. Planned?",
    answers: [
      A("We trade the close. Always have.", 3, "The stands start the late-goal song early."),
      A("Patience is a position.", 2, "Approving nods."),
      A("Luck, mostly.", 1, "The analysts look disappointed."),
    ],
  },
  {
    q: "Is the weekly league too short to judge a manager?",
    answers: [
      A("Seven matches is plenty of data.", 2, "A small cheer from the numbers crowd."),
      A("Judge me on the trend, not the candle.", 3, "The home end prints a new banner."),
      A("Judge me whenever.", 1, "Nobody writes that down."),
    ],
  },
  {
    q: "Pace or Grip: what wins matches?",
    answers: [
      A("Grip holds the lead. Pace finds it.", 3, "Both halves of the stand cheer."),
      A("Whatever the curve says.", 2, "The curve does not answer."),
      A("Power. Next question.", 1, "The next question is about Power."),
    ],
  },
  {
    q: "Your wall held firm last time. Secret?",
    answers: [
      A("Read their lanes, sit in them.", 3, "The back line gets its own chant."),
      A("We drilled it on a quiet Tuesday.", 2, "Polite clapping."),
      A("Good brass, good felt.", 1, "The groundskeeper nods."),
    ],
  },
  {
    q: "Is it true your club never parks the bus?",
    answers: [
      A("We park it when the price is right.", 2, "Knowing smiles in the press row."),
      A("The bus is for away days.", 3, "The away end will remember this."),
      A("We do not own a bus.", 1, "Someone checks. They do own a bus."),
    ],
  },
  {
    q: "The away fans outsang yours last week. Response?",
    answers: [
      A("Then we sing twice as loud at home.", 3, "The home end tests the claim at once."),
      A("Their volume was inflated.", 2, "Laughter from the main stand."),
      A("We will review the audio.", 1, "Nobody is reviewing the audio."),
    ],
  },
  {
    q: "What keeps you up at night as a manager?",
    answers: [
      A("Their counterattack and my order book.", 2, "Sympathetic laughter."),
      A("Nothing. I sleep through drawdowns.", 1, "A few raised eyebrows."),
      A("Our fans. In a good way.", 3, "The stands decide that was about them."),
    ],
  },
  {
    q: "A launch on your rods dipped this week. Will it start?",
    answers: [
      A("We buy dips. We also start them.", 3, "The dip gets a chant of its own."),
      A("Form is temporary. Holders are not.", 2, "A nod from the long-term crowd."),
      A("Line-up is on the board at kickoff.", 1, "The board stays blank for now."),
    ],
  },
  {
    q: "Pundits call your style boring. Fair?",
    answers: [
      A("Boring pays. Ask any bond.", 2, "The pundits do not laugh. The fans do."),
      A("Three points are never boring.", 3, "The home end agrees with feeling."),
      A("Pundits are lagging indicators.", 1, "The pundits take notes, grudgingly."),
    ],
  },
  {
    q: "How do you motivate a squad of launches?",
    answers: [
      A("Show them the holder count.", 3, "The holders in the stand wave."),
      A("Quietly, with charts.", 2, "A low chuckle."),
      A("They motivate themselves. They are on a curve.", 1, "Nobody is sure what that means."),
    ],
  },
  {
    q: "Your next opponent sits top of the group. Nervous?",
    answers: [
      A("Top is where the liquidity is.", 3, "The stands start counting points."),
      A("Every top is a future support.", 2, "Some nervous laughter."),
      A("I respect every table position.", 1, "The room relaxes. Nothing to see."),
    ],
  },
  {
    q: "Any message for the fans before the weekend?",
    answers: [
      A("Bring the noise. We bring the rods.", 3, "The message travels fast."),
      A("Hold your seats. We hold our shape.", 2, "A tidy round of applause."),
      A("See you there.", 1, "Short and fine."),
    ],
  },
  {
    q: "Your club spent nothing at the scout this week. Strategy?",
    answers: [
      A("The best signing is the one already on the rods.", 3, "The squad gets a warm chant."),
      A("We wait for the free list to settle.", 2, "A few approving nods."),
      A("Budget is a state of mind.", 1, "The accountant in the stand sighs."),
    ],
  },
];

/** The question for a seed (the day's seed): the same everywhere, with the answers in a seeded order. */
export function pressFor(seed: string): PressQuestion {
  const q = PRESS[hash32(seed + "|press") % PRESS.length];
  return { q: q.q, answers: shuffle(q.answers, stream(seed, "press-order")) as PressQuestion["answers"] };
}
