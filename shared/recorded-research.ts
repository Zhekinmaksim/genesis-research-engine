import type { ExpeditionState, Observation } from './types';
import { PROJECT_EVIDENCE as P } from './project-evidence';

/** Fail closed instead of pairing a proposal with another world's measurement. */
export function recordedResearch(state: ExpeditionState) {
  if (state.id !== P.worldId || state.revision !== 2) throw new Error('The recorded world does not match this research run.');
  const record = state.researchRequests?.find(r => r.id === P.researchId);
  if (!record || record.status !== 'applied' || record.jobId !== P.researchJobId
    || record.txHash !== P.researchTransaction || record.artifactHash !== P.artifactSha256
    || record.expeditionId !== state.id || record.worldCommitment !== state.commitment
    || record.revision !== 1 || record.appliedRevision !== 2 || !record.decision
    || record.decision.researchId !== record.id || record.decision.expeditionId !== state.id
    || record.decision.worldCommitment !== state.commitment || record.decision.revision !== 1
    || record.decision.hypothesis !== record.hypothesis
    || record.evidence?.payer?.toLowerCase() !== P.ownerAndRequester.toLowerCase()) {
    throw new Error('The accepted IMD proposal and its provenance could not be matched.');
  }
  const decision = record.decision;
  const treatment = state.observations.find(o => o.sequence === record.appliedRevision && o.agentId === 'imd'
    && o.note === decision.reason && sameConditions(o.conditions, decision.conditions));
  const control = state.observations.find(o => o.sequence === 1);
  if (!control || !treatment || control.conditions.water || !treatment.conditions.water
    || control.conditions.mineral !== treatment.conditions.mineral
    || control.conditions.light !== treatment.conditions.light
    || control.conditions.temperature !== treatment.conditions.temperature) {
    throw new Error('The recorded water-only comparison is unavailable.');
  }
  return { record, control, treatment };
}

function sameConditions(a: Observation['conditions'], b: Observation['conditions']) {
  return a.water === b.water && a.mineral === b.mineral && a.light === b.light && a.temperature === b.temperature;
}
