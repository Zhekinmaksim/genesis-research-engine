import type { Observation } from './types';
import { evaluateCandidateSpace, sameOutcome, simulatePublicModelOutcome } from './reference-models';

/** Public reference-family analysis only. No selected hidden model or engine call. */
export function explainModelElimination(observations: readonly Observation[]) {
  const ordered = [...observations].sort((a,b)=>a.sequence-b.sequence);
  const latest = ordered.at(-1);
  const before = evaluateCandidateSpace(ordered.slice(0,-1));
  const models = evaluateCandidateSpace(ordered).map(item=>{
    const contradiction = ordered.find(o=>!sameOutcome(simulatePublicModelOutcome(item.model,o.conditions),o.outcome));
    const observation = contradiction ?? latest;
    const predicted = observation ? simulatePublicModelOutcome(item.model,observation.conditions) : null;
    return { ...item,
      status: item.compatible ? 'compatible' as const
        : before[item.index-1]!.compatible ? 'eliminated-now' as const : 'eliminated-before' as const,
      comparison: observation && predicted ? { observation, predicted,
        mismatches: (['growth','energy','survived'] as const).filter(key=>predicted[key]!==observation.outcome[key]),
      } : null,
    };
  });
  return { models, latestSequence: latest?.sequence ?? null,
    beforeCount: before.filter(m=>m.compatible).length,
    afterCount: models.filter(m=>m.compatible).length,
    newlyEliminated: models.filter(m=>m.status==='eliminated-now'),
  };
}
