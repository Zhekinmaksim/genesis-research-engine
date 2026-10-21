import { BaseError, createPublicClient, http, isAddress, zeroAddress, type Address } from 'viem';
import { mainnet } from 'viem/chains';
import type { ImdPreflight } from '../shared/imd-types.ts';
import { inspectRegistry, type RegistryPreflight, type RegistryReader } from '../shared/registry-types.ts';

export class RegistryError extends Error {
  constructor(message: string, public readonly status = 409) { super(message); this.name = 'RegistryError'; }
}
export interface RegistryOptions { env?: Record<string, string | undefined>; client?: RegistryReader }

/** Optional, read-only operator registry preflight. Absence never implies a deployment. */
export async function prepareRegistry(preflight: ImdPreflight, options: RegistryOptions = {}): Promise<RegistryPreflight> {
  const env = options.env ?? process.env;
  const configured = env.GENESIS_RESEARCH_CONTRACT?.trim();
  if (!configured) return { status: 'unconfigured' };
  if (!isAddress(configured) || configured.toLowerCase() === zeroAddress) throw new RegistryError('GENESIS_RESEARCH_CONTRACT must be a deployed research registry address.');
  if (!options.client && !env.GENESIS_RPC?.trim()) throw new RegistryError('Set GENESIS_RPC to the configured registry’s Ethereum mainnet RPC.');
  const client = options.client ?? createPublicClient({ chain: mainnet, transport: http(env.GENESIS_RPC, { timeout: 12_000, retryCount: 0 }) });
  try {
    return await inspectRegistry(client as RegistryReader, configured as Address, preflight);
  } catch (error) {
    // viem's full diagnostic can contain the operator's private RPC URL/API key.
    if (error instanceof BaseError) throw new RegistryError('The configured registry RPC could not be verified. Check the operator RPC connection.', 503);
    throw new RegistryError(error instanceof Error ? error.message : 'The configured registry could not be verified.');
  }
}
