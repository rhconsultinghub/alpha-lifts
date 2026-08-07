/**
 * Fun comparison "factoids" — reframing dry cumulative stats as something tangible:
 * "you've lifted the equivalent of 10 cars", "that's the Harry Potter films ×3 in the gym".
 *
 * Pure and stateless. Comparison values are approximate by design and deliberately unit-agnostic:
 * "10 cars" reads the same whether the user tracks kg or lb, so — unlike the achievement volume
 * tiers, which pick separately-round numbers per unit — nothing here needs unit conversion. The
 * weight tables are in kg (matching lifetimeVolumeKg) and time in minutes (matching
 * totalTrainingMinutes); a lb user's number is compared against the same physical objects.
 */

export interface Factoid {
  /** The comparison clause, e.g. "8 elephants" or "the Harry Potter films ×3". */
  text: string;
  emoji: string;
}

interface Ref {
  /** Reference magnitude — kg for the weight table, minutes for the time table. */
  value: number;
  singular: string;
  plural: string;
  emoji: string;
}

// Ascending by value. Everyday objects graduating into the absurd — a mix the user asked for.
const WEIGHT_REFS: Ref[] = [
  { value: 4.5, singular: 'house cat', plural: 'house cats', emoji: '🐱' },
  { value: 10, singular: 'car tyre', plural: 'car tyres', emoji: '🛞' },
  { value: 12, singular: 'gold bar', plural: 'gold bars', emoji: '🧱' },
  { value: 25, singular: 'bag of cement', plural: 'bags of cement', emoji: '🛍️' },
  { value: 40, singular: 'golden retriever', plural: 'golden retrievers', emoji: '🐕' },
  { value: 62, singular: 'adult human', plural: 'adult humans', emoji: '🧍' },
  { value: 70, singular: 'washing machine', plural: 'washing machines', emoji: '🧺' },
  { value: 170, singular: 'vending machine', plural: 'vending machines', emoji: '🥤' },
  { value: 360, singular: 'grizzly bear', plural: 'grizzly bears', emoji: '🐻' },
  { value: 480, singular: 'grand piano', plural: 'grand pianos', emoji: '🎹' },
  { value: 750, singular: 'dairy cow', plural: 'dairy cows', emoji: '🐄' },
  { value: 1200, singular: 'small car', plural: 'small cars', emoji: '🚗' },
  { value: 1500, singular: 'hippo', plural: 'hippos', emoji: '🦛' },
  { value: 2300, singular: 'rhino', plural: 'rhinos', emoji: '🦏' },
  { value: 2500, singular: 'pickup truck', plural: 'pickup trucks', emoji: '🛻' },
  { value: 6000, singular: 'elephant', plural: 'elephants', emoji: '🐘' },
  { value: 8000, singular: 'T-rex', plural: 'T-rexes', emoji: '🦖' },
  { value: 12000, singular: 'double-decker bus', plural: 'double-decker buses', emoji: '🚌' },
  { value: 36000, singular: 'loaded semi truck', plural: 'loaded semi trucks', emoji: '🚛' },
  { value: 150000, singular: 'blue whale', plural: 'blue whales', emoji: '🐋' },
  { value: 180000, singular: 'Boeing 747', plural: 'Boeing 747s', emoji: '✈️' },
  { value: 2000000, singular: 'Space Shuttle', plural: 'Space Shuttles', emoji: '🚀' }
];

// Ascending by value (minutes). Pop-culture spans people can feel the length of.
const TIME_REFS: Ref[] = [
  { value: 3.5, singular: 'pop song', plural: 'pop songs', emoji: '🎵' },
  { value: 22, singular: 'sitcom episode', plural: 'sitcom episodes', emoji: '📺' },
  { value: 120, singular: 'feature film', plural: 'feature films', emoji: '🎬' },
  { value: 420, singular: 'transatlantic flight', plural: 'transatlantic flights', emoji: '🛫' },
  { value: 683, singular: 'Lord of the Rings trilogy (extended)', plural: 'Lord of the Rings trilogies (extended)', emoji: '💍' },
  { value: 1178, singular: 'Harry Potter film series', plural: 'Harry Potter film marathons', emoji: '⚡' },
  { value: 2520, singular: 'drive across the US', plural: 'drives across the US', emoji: '🚙' },
  { value: 7020, singular: 'Harry Potter audiobook series', plural: 'Harry Potter audiobook marathons', emoji: '🎧' }
];

// Keep the count in a range that actually lands: below ~1.1 it reads as a fraction ("0.2 cars"),
// far above a couple hundred it stops being tangible ("3,000 cats"). When several references
// qualify, the caller's seed rotates between them so the comparison varies without churning.
const MIN_COUNT = 1.1;
const MAX_COUNT = 250;

function pick(refs: Ref[], value: number, seed: number): Factoid | null {
  if (!(value > 0)) return null;
  const inBand = refs.filter(r => value / r.value >= MIN_COUNT && value / r.value <= MAX_COUNT);
  // Below the smallest reference entirely (a brand-new user) — let the caller fall back or hide
  // rather than print "0.3 house cats".
  if (!inBand.length) return null;
  const ref = inBand[((seed % inBand.length) + inBand.length) % inBand.length];
  const count = value / ref.value;
  const rounded = count >= 10 ? Math.round(count) : Math.round(count * 10) / 10;
  if (rounded <= 1) return { text: `a ${ref.singular}`, emoji: ref.emoji };
  return { text: `${countText(rounded)} ${ref.plural}`, emoji: ref.emoji };
}

function countText(n: number): string {
  // Thousands separator for the big numbers; whole numbers render without a trailing ".0".
  return Number.isInteger(n) ? n.toLocaleString('en-US') : String(n);
}

/** Weight comparison for a kg total. Null when the total is below the smallest object. */
export function weightFactoid(kg: number, seed = 0): Factoid | null {
  return pick(WEIGHT_REFS, kg, seed);
}

/** Time comparison for a minutes total. Null when the total is below the shortest span. */
export function timeFactoid(min: number, seed = 0): Factoid | null {
  return pick(TIME_REFS, min, seed);
}
