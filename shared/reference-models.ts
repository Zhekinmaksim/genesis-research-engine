import type { Conditions, Observation, Outcome } from './types';

// Public hypothesis family, never the selected hidden world.
export const conditionKey = (c: Conditions) =>
  `${Number(c.water)}:${c.mineral}:${c.light}:${c.temperature}`;

export const ALL_CANDIDATE_MODELS: readonly Conditions[] = Object.freeze(
  [false, true].flatMap(water =>
    (['none', 'basalt', 'quartz'] as const).flatMap(mineral =>
      (['amber', 'blue'] as const).flatMap(light =>
        (['cool', 'warm'] as const).map(temperature =>
          Object.freeze({ water, mineral, light, temperature }),
        ),
      ),
    ),
  ),
);

export const HOLDOUT_CONDITIONS: readonly Conditions[] = Object.freeze([
  { water: false, mineral: 'none', light: 'amber', temperature: 'cool' },
  { water: true, mineral: 'basalt', light: 'blue', temperature: 'warm' },
  { water: false, mineral: 'quartz', light: 'blue', temperature: 'cool' },
  { water: true, mineral: 'quartz', light: 'amber', temperature: 'warm' },
]);

const holdoutSet = new Set(HOLDOUT_CONDITIONS.map(conditionKey));
export const isHoldoutCondition = (c: Conditions) => holdoutSet.has(conditionKey(c));

export function simulatePublicModelOutcome(model: Conditions, c: Conditions): Outcome {
  const water = Number(c.water === model.water);
  const mineral = Number(c.mineral === model.mineral);
  const light = Number(c.light === model.light);
  const temperature = Number(c.temperature === model.temperature);
  const rawGrowth = 10 + water * 25 + mineral * 25 + light * 15 + temperature * 15 + water * mineral * 10;
  const growth = Math.round(rawGrowth / 50) * 50;
  const energy = growth === 100 ? 90 : growth === 50 ? 40 : 5;
  return { growth, energy, survived: growth >= 60 };
}

export const sameOutcome = (a: Outcome, b: Outcome) =>
  a.growth === b.growth && a.energy === b.energy && a.survived === b.survived;

export interface CandidateStatus {
  index: number;
  model: Conditions;
  compatible: boolean;
  eliminatedAtStep: number | null;
}

export function evaluateCandidateSpace(observations: readonly Observation[]): CandidateStatus[] {
  return ALL_CANDIDATE_MODELS.map((model, idx) => {
    let eliminatedAtStep: number | null = null;
    for (const obs of observations) {
      if (!sameOutcome(simulatePublicModelOutcome(model, obs.conditions), obs.outcome)) {
        eliminatedAtStep = obs.sequence;
        break;
      }
    }
    return {
      index: idx + 1,
      model,
      compatible: eliminatedAtStep === null,
      eliminatedAtStep,
    };
  });
}

