export type Mineral = 'none' | 'basalt' | 'quartz';
export type AgentId = 'ada' | 'kepler' | 'lin';
export interface Conditions {
  water: boolean;
  mineral: Mineral;
  light: 'amber' | 'blue';
  temperature: 'cool' | 'warm';
}
export interface Outcome { growth: number; survived: boolean; energy: number }
export interface Observation {
  id: string; sequence: number; agentId: AgentId | 'human' | 'imd';
  conditions: Conditions; outcome: Outcome; cost: number; note: string;
}
export interface Researcher {
  id: AgentId; name: string; role: string; color: string; spent: number;
  thought: string; experiments: number;
}
export interface Hypothesis {
  id: string; title: string; description: string;
  status: 'testing' | 'supported' | 'refuted';
  evidence: number; agentId: AgentId;
}
export interface JournalEntry {
  id: string; sequence: number; kind: 'observation' | 'hypothesis' | 'discovery' | 'system' | 'prediction' | 'research';
  agentId: AgentId | 'human' | 'imd' | 'system'; text: string;
}
export interface Prediction {
  conditions: Conditions; predicted: Outcome; actual: Outcome; correct: boolean;
}
export interface ExpeditionState {
  researchRequests: import('./imd-types.ts').ImdResearchRecord[];
  id: string; revision: number; commitment: string;
  phase: 'unexplored' | 'exploring' | 'ready' | 'restored' | 'exhausted';
  credits: number; spent: number; initialCredits: number;
  researchers: Researcher[]; observations: Observation[];
  hypotheses: Hypothesis[]; journal: JournalEntry[];
  candidateCount: number; initialCandidateCount: number; progress: number;
  predictions: Prediction[]; holdoutScore: number | null;
  restored: boolean; engine: 'local';
  availableExperiments: Conditions[];
  restoration: { conditions: Conditions; outcome: Outcome } | null;
}
export interface ResearchDecision {
  agentId: AgentId; conditions: Conditions; reason: string;
}
