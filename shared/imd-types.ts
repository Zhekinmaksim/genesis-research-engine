export const IMD_API_ORIGIN = 'https://api.imd.fun';
export const IMD_INTAKE = '0xa43e6f75ee006411f79ac1c84120606c2330de82' as const;
export const IMD_ASSET = '0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7' as const;
export const IMD_JOB_ACTION_ID = '0x6a6f622e6f70656e406a6f622d31000000000000000000000000000000000000' as const;
export const IMD_PREFLIGHT_MAX_AGE_MS = 5 * 60 * 1000;
export interface ImdResearchInput {
  skill: 'research-report'; objective: string; github: false; minCitations: 0;
  outputs: [{ name: 'decision'; path: 'artifacts/decision.json'; mediaType: 'application/json' }];
}
export interface ImdCheck {
  action: 'job.open'; blockers: unknown[]; suggestions?: unknown[];
  [key: string]: unknown;
}
export interface ImdPreflight {
  action: 'job.open'; input: ImdResearchInput; check: ImdCheck;
  checkedAt: number; revision: number; expeditionId: string; worldCommitment: string;
  network: { chainId: 1; intake: `0x${string}`; asset: `0x${string}`; amount: string; actionId: `0x${string}` };
  researchId?: string;
  hypothesis?: string;
  registryAddress?: `0x${string}`;
  registryCodeHash?: `0x${string}`;
}
export interface ImdResearchDecision {
  expeditionId: string; worldCommitment: string; revision: number; researchId: string;
  hypothesis: string; hypothesisAssessment: string; reason: string;
  conditions: import('./types.ts').Conditions;
}
export type ImdResearchStatus = 'prepared' | 'submitted' | 'pending' | 'verified' | 'applied' | 'failed' | 'stale';
export interface ImdResearchRecord {
  id: string; expeditionId: string; worldCommitment: string; revision: number;
  hypothesis: string; input: ImdResearchInput; bodyHash: string; preparedAt: number;
  network: ImdPreflight['network']; status: ImdResearchStatus;
  registryAddress?: `0x${string}`; registryCodeHash?: `0x${string}`;
  txHash?: `0x${string}`; jobId?: string; checkedAt?: number; error?: string;
  txHistory?: Array<{ txHash: `0x${string}`; attachedAt: number; replacedAt: number; error?: string }>;
  txAttachedAt?: number;
  decision?: ImdResearchDecision; artifactHash?: string; artifactBytes?: number;
  evidence?: { requestId: string; logIndex: number; blockNumber: string; blockHash: string; payer: string; intake: Record<string, unknown>; result: Record<string, unknown> };
  appliedRevision?: number;
}
export interface ImdJobResponse {
  job: Record<string, unknown>; result: Record<string, unknown> | null; resultStatus: 'pending' | 'ready';
}
export interface ImdSubmission { txHash: `0x${string}`; walletAddress: `0x${string}` }
