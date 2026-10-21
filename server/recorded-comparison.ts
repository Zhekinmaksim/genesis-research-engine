import type {Conditions,ExpeditionState,Observation} from '../shared/types.ts';
import {AGENT_IDS,CANDIDATES,TRAINING,candidatesFor,conditionKey,decideExperiment,modelOutcome} from './research.ts';
import {recordedResearch} from '../shared/recorded-research.ts';
import {PROJECT_EVIDENCE as P} from '../shared/project-evidence.ts';

/** Retrospective choice analysis. Receives the public record, never a hidden world or opening.
 * A uniform prior over compatible reference models is an explicit analytical assumption,
 * not an IMD forecast. Untested local outcomes are never filled in using the secret model.
 */
export function compareRecordedResearch(state:ExpeditionState){
 const {record,control,treatment}=recordedResearch(state);
 const history=state.observations.filter(o=>o.sequence<=control.sequence);
 const compatible=candidatesFor(history);
 const available=TRAINING.filter(c=>!history.some(o=>conditionKey(o.conditions)===conditionKey(c)));
 const changedKeys=(conditions:Conditions)=>(Object.keys(conditions) as (keyof Conditions)[]).filter(k=>conditions[k]!==control.conditions[k]);
 function choice(conditions:Conditions){
  const buckets=new Map<string,{outcome:ReturnType<typeof modelOutcome>;modelCount:number}>();
  for(const m of compatible){const o=modelOutcome(m,conditions),key=JSON.stringify(o);const b=buckets.get(key);if(b)b.modelCount++;else buckets.set(key,{outcome:o,modelCount:1});}
  const branches=[...buckets.values()].sort((a,b)=>a.outcome.growth-b.outcome.growth);
  const squaredModelCountSum=branches.reduce((sum,b)=>sum+b.modelCount**2,0);
  return {conditions:{...conditions},changed:changedKeys(conditions),branches,expectedRemainingModels:squaredModelCountSum/compatible.length,expectedRemainingFraction:{numerator:squaredModelCountSum,denominator:compatible.length},expectedEliminatedModels:compatible.length-squaredModelCountSum/compatible.length,worstCaseRemainingModels:Math.max(...branches.map(b=>b.modelCount))};
 }
 // The historical first automatic step was Ada; the next local turn would be Kepler.
 if(history.length!==1||control.agentId!=='ada')throw Error('The recorded local-rotation baseline has changed.');
 const locals=AGENT_IDS.map((id,turn)=>{
  const decision=decideExperiment(history,turn);if(!decision)throw Error('No local comparison choice is available.');
  return {id,name:id[0]!.toUpperCase()+id.slice(1),...choice(decision.conditions),reason:decision.reason,measuredSeparately:false as const,matchesRecordedConditions:conditionKey(decision.conditions)===conditionKey(treatment.conditions),networkCostImd:'0',internalCreditsIfExecuted:2};
 });
 const imdChoice=choice(record.decision!.conditions);
 const after=candidatesFor(state.observations);
 const excluded=CANDIDATES.flatMap((model,index)=>compatible.includes(model)&&!after.includes(model)?[index+1]:[]);
 return {
  format:'genesis-retrospective-choice-comparison-v1',worldId:state.id,researchId:record.id,artifactSha256:record.artifactHash,
  baseline:{observations:history,compatibleModels:compatible.length,availableExperiments:available.length,defaultNextLocalResearcher:'kepler',defaultTurnReason:'The recorded first automatic experiment was Ada; the local rotation is Ada → Kepler → Lin.'},
  information:{local:'Local strategies receive the public observations and know the full 24-model family and response function.',imd:'The original IMD request supplied the hypothesis, one observation and available condition combinations. It did not include the model family or response formula.',equalInformation:false},
  imd:{name:'Recorded IMD proposal',...imdChoice,measuredSeparately:true as const,measuredOutcome:{...treatment.outcome},actualRemainingModels:after.length,actualEliminatedModels:compatible.length-after.length,excludedModelIds:excluded,historicalCost:P.researchCost,internalCreditsSpent:treatment.cost},
  localChoices:locals,
  interpretation:{defaultChoiceMatchesImd:locals.find(x=>x.id==='kepler')!.matchesRecordedConditions,summary:'IMD matched Kepler’s water-only comparison. This record shows a controlled test proposed without including the reference-model formula in the IMD request; it does not show an advantage over the local selector.',recordedFinding:'Adding water left growth at 50/100, energy at 40/100 and survival false under the tested fixed conditions. Five models were excluded; fourteen remain.'},
  method:{assumption:'Uniform weight over the 19 models compatible with the first observation. Expected counts are local reference-family calculations, not measured results or probabilities supplied by IMD.',expectedRemainingFormula:'sum(branchModelCount²) / compatibleModelCount',branchMeaning:'Each branch is a possible measured response under the public model family. Only the recorded IMD treatment was executed in this comparison.',limits:['One retrospective example, not a statistical benchmark.','The local baseline has more prior information; no AI superiority or cost-efficiency claim is made.','The observed 14 remaining models differs from the model-weighted expectation of 11.','Local choices are recalculated from the same initial observation; no new local treatment or IMD purchase is recorded.','A two-internal-credit simulation cost is separate from IMD tokens and ETH gas.']},
 };
}
