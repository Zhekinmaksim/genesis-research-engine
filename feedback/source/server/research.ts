import type { AgentId, Conditions, Hypothesis, Observation, Outcome, ResearchDecision } from '../shared/types.ts';

// This public hypothesis family is the learner's prior, not the selected world.
// Learning functions below receive observations only. They never receive a seed,
// commitment opening, simulator, or the actual model selected by Expedition.
export interface Candidate {
  water: boolean;
  mineral: Conditions['mineral'];
  light: Conditions['light'];
  temperature: Conditions['temperature'];
}
export const AGENT_IDS: AgentId[] = ['ada', 'kepler', 'lin'];
export const CANDIDATES: readonly Candidate[] = Object.freeze(
  [false, true].flatMap(water =>
    (['none', 'basalt', 'quartz'] as const).flatMap(mineral =>
      (['amber', 'blue'] as const).flatMap(light =>
        (['cool', 'warm'] as const).map(temperature => Object.freeze({ water, mineral, light, temperature }))))),
);
export const ALL_CONDITIONS: readonly Conditions[] = CANDIDATES;
export const conditionKey = (c: Conditions) => `${Number(c.water)}:${c.mineral}:${c.light}:${c.temperature}`;
// A fixed split is public and independent of the hidden world; no held-out
// outcomes participate in candidate filtering or experiment selection.
export const HOLDOUT: readonly Conditions[] = Object.freeze([
  { water: false, mineral: 'none', light: 'amber', temperature: 'cool' },
  { water: true, mineral: 'basalt', light: 'blue', temperature: 'warm' },
  { water: false, mineral: 'quartz', light: 'blue', temperature: 'cool' },
  { water: true, mineral: 'quartz', light: 'amber', temperature: 'warm' },
] as Conditions[]);
const heldoutKeys = new Set(HOLDOUT.map(conditionKey));
export const TRAINING: readonly Conditions[] = Object.freeze(ALL_CONDITIONS.filter(c => !heldoutKeys.has(conditionKey(c))));

export function modelOutcome(model: Candidate, c: Conditions): Outcome {
  const water = Number(c.water === model.water);
  const mineral = Number(c.mineral === model.mineral);
  const light = Number(c.light === model.light);
  const temperature = Number(c.temperature === model.temperature);
  const rawGrowth = 10 + water * 25 + mineral * 25 + light * 15 + temperature * 15 + water * mineral * 10;
  // Coarse instruments reveal a response band rather than the world's exact
  // coefficients. Multiple controlled experiments are needed to separate causes.
  const growth = Math.round(rawGrowth / 50) * 50;
  const energy = growth === 100 ? 90 : growth === 50 ? 40 : 5;
  return { growth, energy, survived: growth >= 60 };
}
export const sameOutcome = (a: Outcome, b: Outcome) => a.growth === b.growth && a.energy === b.energy && a.survived === b.survived;
const outputKey = (o: Outcome) => `${o.growth}:${o.energy}:${Number(o.survived)}`;
export function candidatesFor(observations: readonly Observation[]): Candidate[] {
  return CANDIDATES.filter(candidate => observations.every(o => sameOutcome(modelOutcome(candidate, o.conditions), o.outcome)));
}
export function canPredict(candidates: readonly Candidate[]): boolean {
  return candidates.length === 1 && HOLDOUT.every(c => candidates.every(m => sameOutcome(modelOutcome(m, c), modelOutcome(candidates[0]!, c))));
}

export function hypothesesFor(observations: readonly Observation[]): Hypothesis[] {
  const candidates = candidatesFor(observations);
  const first = candidates[0];
  const supported = (same: (c: Candidate) => boolean) => observations.length > 0 && candidates.length > 0 && candidates.every(same);
  const waterKnown = first && supported(c => c.water === first.water);
  const mineralKnown = first && supported(c => c.mineral === first.mineral);
  const climateKnown = first && supported(c => c.light === first.light && c.temperature === first.temperature);
  const mineralNames = { none: 'without minerals', basalt: 'with basalt', quartz: 'with quartz' };
  return [
    { id: 'water', title: 'Water response', description: waterKnown ? `Observations support stronger growth ${first.water ? 'with water' : 'without water'}.` : 'Testing whether water helps plants grow in this world.', status: waterKnown ? 'supported' : 'testing', evidence: observations.length, agentId: 'ada' },
    { id: 'mineral', title: 'Mineral catalyst', description: mineralKnown ? `All remaining models predict stronger growth ${mineralNames[first.mineral]}.` : 'Comparing basalt, quartz, and a mineral-free environment.', status: mineralKnown ? 'supported' : 'testing', evidence: observations.length, agentId: 'kepler' },
    { id: 'climate', title: 'Light and temperature', description: climateKnown ? `Within this model family, the preferred conditions are ${first.light === 'blue' ? 'blue' : 'amber'} light and ${first.temperature === 'warm' ? 'warmth' : 'cool temperatures'}.` : 'Testing combinations of light and temperature, rather than isolated matches.', status: climateKnown ? 'supported' : 'testing', evidence: observations.length, agentId: 'lin' },
  ];
}

export function decideExperiment(observations: readonly Observation[], turn: number): ResearchDecision | null {
  const candidates = candidatesFor(observations);
  if (!candidates.length) throw new Error('The observations are incompatible with the research model.');
  const used = new Set(observations.map(o => conditionKey(o.conditions)));
  const options = TRAINING.filter(c => !used.has(conditionKey(c)));
  if (!options.length) return null;
  const agentId = AGENT_IDS[turn % AGENT_IDS.length]!;
  const previous = observations.at(-1)?.conditions;
  const ranked = options.map((conditions, index) => {
    const buckets = new Map<string, number>();
    for (const candidate of candidates) {
      const key = outputKey(modelOutcome(candidate, conditions));
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const expectedRemaining = [...buckets.values()].reduce((sum, n) => sum + n * n, 0) / candidates.length;
    const worstRemaining = Math.max(...buckets.values());
    const distance = previous ? Object.keys(conditions).filter(k => conditions[k as keyof Conditions] !== previous[k as keyof Conditions]).length : 4;
    // Distinct deterministic strategies; every strategy prioritizes an actual
    // split, so a visually appealing but uninformative experiment never wins.
    const information = candidates.length - expectedRemaining;
    const score = agentId === 'ada' ? information * 1000
      : agentId === 'kepler' ? Number(information > 0) * 10000 - distance * 100 + information
      : (candidates.length - worstRemaining) * 1000 + information;
    return { conditions, score, index };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  const reason = agentId === 'ada' ? 'I am choosing the experiment that will separate the most remaining models on average.'
    : agentId === 'kepler' ? 'I am changing as few conditions as possible to distinguish the remaining explanations.'
    : 'I am choosing an experiment that reduces uncertainty even with the least helpful result.';
  return { agentId, conditions: { ...ranked[0]!.conditions }, reason };
}
