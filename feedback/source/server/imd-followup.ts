import { randomUUID } from 'node:crypto';
import { keccak256, stringToHex } from 'viem';
import type { Conditions, ExpeditionState } from '../shared/types';
import { recordedResearch } from '../shared/recorded-research';
import { PROJECT_EVIDENCE as P } from '../shared/project-evidence';
import { buildResearchJob } from './imd';
import { candidatesFor, conditionKey, decideExperiment, modelOutcome } from './research';

/** Preparation only: public observations in, unsigned research body out. No wallet/RPC. */
export function buildImdFollowup(state: ExpeditionState, researchId: string = randomUUID()) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(researchId) || researchId === P.researchId) throw new Error('A distinct follow-up research ID is required.');
  const { record, control, treatment } = recordedResearch(state);
  const input = buildResearchJob(state, record.hypothesis, researchId);
  const observation = (o: typeof control) => ({ sequence: o.sequence, conditions: { water: o.conditions.water, mineral: o.conditions.mineral, light: o.conditions.light, temperature: o.conditions.temperature }, outcome: { growth: o.outcome.growth, energy: o.outcome.energy, survived: o.outcome.survived } });
  const body = JSON.stringify(input);
  if (input.objective.length > 8000 || Buffer.byteLength(body) > 16 * 1024) throw new Error('Follow-up body exceeds the reviewed protocol limits.');
  const compatible = candidatesFor(state.observations);
  const evaluateChoice = (conditions: Conditions) => {
    const branches = new Map<string, number>();
    for (const model of compatible) { const key = JSON.stringify(modelOutcome(model, conditions)); branches.set(key, (branches.get(key) ?? 0) + 1); }
    const expectedRemaining = [...branches.values()].reduce((n, v) => n + v * v, 0) / compatible.length;
    return { conditions, expectedRemainingModels: expectedRemaining, expectedEliminatedModels: compatible.length - expectedRemaining, worstRemainingModels: Math.max(...branches.values()) };
  };
  const localChoices = [0, 1, 2].map(turn => {
    const choice = decideExperiment(state.observations, turn);
    if (!choice) throw new Error('No untested experiment remains.');
    return { researcher: choice.agentId, ...evaluateChoice(choice.conditions), reason: choice.reason };
  });
  return {
    format: 'genesis-real-imd-followup-plan-v1', status: 'prepared_only_no_payment_authorization',
    researchId, worldId: state.id, worldCommitment: state.commitment, inputRevision: state.revision,
    previousResearchId: record.id, previousArtifactSha256: record.artifactHash, publicObservations: state.observations.map(observation),
    input, body, bodyHash: keccak256(stringToHex(body)),
    route: { previous: 'Builder wallet → IMD Intake → real IMD proposal → recorded simulator measurement', next: 'Owner → GenesisResearch → IMD Intake → real IMD artifact and authenticated callback → one new simulator measurement', mixedRoute: true },
    comparison: { compatibleModelsBefore: compatible.length, localChoices,
      priorDifference: 'Baselines know the 24-model family and response formula. The IMD request contains observations and previous agent feedback, not that family or formula. This is not an equal-information benchmark.',
      measureAfterCompletion: ['Verify the next agent received the prior measured result.', 'Preserve its updated or retained hypothesis assessment verbatim.', 'Verify it selected an untested permitted experiment.', 'Measure candidate elimination and internal experiment cost after execution.', 'Compare choice quality with the frozen local baselines without claiming AI superiority.'],
      userBenefit: 'A learner can see how evidence changes an explanation and why the next experiment is worth spending a limited experiment budget on.',
      notEstablished: ['Cost savings or better performance than a local selector', 'Generalization beyond the synthetic world', 'An executed contract-funded mainnet cycle before its receipts and callback exist'] },
    remainingUntested: state.availableExperiments.filter(c => !state.observations.some(o => conditionKey(o.conditions) === conditionKey(c))).length,
    stopRules: ['At most one additional paid job, only after fresh explicit authorization.', 'No automatic retry, replacement purchase, or third research call.', 'Reject stale world/revision/body, substituted artifact, failed callback or exhausted contract cap.', 'Keep the original pinned historical archive byte-for-byte unchanged; publish continuation separately.'],
  };
}
