import {
  createPublicClient, createWalletClient, custom, encodeFunctionData, parseAbi, stringToHex, zeroAddress,
  type EIP1193Provider, type Hex,
} from 'viem';
import { mainnet } from 'viem/chains';
import {
  IMD_ASSET, IMD_INTAKE, IMD_JOB_ACTION_ID, IMD_PREFLIGHT_MAX_AGE_MS,
  type ImdPreflight, type ImdSubmission,
} from '../../shared/imd-types.ts';
import { inspectRegistry, registryAbi, validateRegistry, type ResearchPreflight, type RegistryReader } from '../../shared/registry-types.ts';
const tokenAbi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);
export const intakeAbi = parseAbi([
  'function request(bytes32 action, bytes body, (address target, bytes4 selector) callback, address asset, uint256 amount) returns (bytes32 requestId)',
]);
export function researchRequestData(preflight: ImdPreflight): Hex {
  const age = Date.now() - preflight.checkedAt;
  if (!Number.isFinite(age) || age < -30_000 || age > IMD_PREFLIGHT_MAX_AGE_MS) throw new Error('The free IMD preflight has expired. Run it again before signing.');
  const network = preflight.network;
  if (preflight.action !== 'job.open' || preflight.check?.action !== 'job.open' || !Array.isArray(preflight.check.blockers)
      || preflight.check.blockers.length || network?.chainId !== 1 || network.intake?.toLowerCase() !== IMD_INTAKE
      || network.asset?.toLowerCase() !== IMD_ASSET || network.actionId !== IMD_JOB_ACTION_ID
      || typeof network.amount !== 'string' || !/^[1-9][0-9]{0,77}$/.test(network.amount) || BigInt(network.amount) >= 2n ** 256n) throw new Error('The IMD preflight or payment details are invalid.');
  const bodyJson = JSON.stringify(preflight.input);
  if (!bodyJson || new TextEncoder().encode(bodyJson).length > 16 * 1024 || preflight.input.skill !== 'research-report' || preflight.input.github !== false) throw new Error('The IMD research payload is invalid.');
  return encodeFunctionData({ abi: intakeAbi, functionName: 'request', args: [IMD_JOB_ACTION_ID, stringToHex(bodyJson), { target: zeroAddress, selector: '0x00000000' }, IMD_ASSET, BigInt(network.amount)] });
}
/** Reviewable calldata only; this function never connects a wallet or sends a transaction. */
export function researchTransaction(preflight: ResearchPreflight): { to: Hex; data: Hex; kind: 'direct' | 'registry'; amount: string } {
  const directData = researchRequestData(preflight);
  if (!preflight.registry || preflight.registry.status === 'unconfigured') {
    return { to: IMD_INTAKE, data: directData, kind: 'direct', amount: preflight.network.amount };
  }
  if (preflight.registry.status !== 'ready') throw new Error('The configured registry is not ready. Run preflight again.');
  validateRegistry(preflight.registry, preflight);
  return {
    to: preflight.registry.address, kind: 'registry', amount: preflight.network.amount,
    data: encodeFunctionData({ abi: registryAbi, functionName: 'orderResearch', args: [stringToHex(JSON.stringify(preflight.input)), BigInt(preflight.network.amount)] }),
  };
}
/** Explicit user action only: every transaction requires confirmation in their wallet. */
export async function submitResearchRequest(preflight: ResearchPreflight, suppliedProvider?: EIP1193Provider): Promise<ImdSubmission> {
  const transaction = researchTransaction(preflight);
  const requestData = transaction.data;
  const provider = suppliedProvider ?? (globalThis as unknown as { ethereum?: EIP1193Provider }).ethereum;
  if (!provider) throw new Error('Connect an injected Ethereum wallet to submit a real IMD request.');
  const transport = custom(provider);
  const wallet = createWalletClient({ chain: mainnet, transport });
  const client = createPublicClient({ chain: mainnet, transport });
  const [account] = await wallet.requestAddresses();
  if (!account) throw new Error('No Ethereum account was selected.');
  async function verifyAccount() {
    if (await wallet.getChainId() !== 1) throw new Error('Select Ethereum mainnet in your wallet and try again.');
    const accounts = await wallet.getAddresses();
    if (accounts[0]?.toLowerCase() !== account.toLowerCase()) throw new Error('The wallet account changed. Run preflight again.');
  }
  await verifyAccount();
  async function verifyRegistry() {
    if (preflight.registry?.status !== 'ready') throw new Error('The configured registry is not ready.');
    researchTransaction(preflight);
    const current = await inspectRegistry(client as RegistryReader, preflight.registry.address, preflight, account!);
    if (current.codeHash !== preflight.registry.codeHash) throw new Error('The research registry code changed. Run preflight again.');
  }
  const amount = BigInt(preflight.network.amount);
  const [balance, allowance, eth] = await Promise.all([
    transaction.kind === 'registry' ? Promise.resolve(amount) : client.readContract({ address: IMD_ASSET, abi: tokenAbi, functionName: 'balanceOf', args: [account] }),
    transaction.kind === 'registry' ? Promise.resolve(amount) : client.readContract({ address: IMD_ASSET, abi: tokenAbi, functionName: 'allowance', args: [account, IMD_INTAKE] }),
    client.getBalance({ address: account }),
  ]);
  if (balance < amount) throw new Error('This wallet does not have enough IMD for the quoted request.');
  if (eth === 0n) throw new Error('This wallet needs ETH on Ethereum mainnet to pay transaction gas.');
  async function sendChecked(to: Hex, data: Hex): Promise<Hex> {
    await verifyAccount();
    if (transaction.kind === 'registry') await verifyRegistry();
    const estimate = await client.estimateGas({ account, to, data });
    const gas = (estimate * 120n + 99n) / 100n;
    const fees = await client.estimateFeesPerGas();
    const gasPrice = fees.maxFeePerGas ?? fees.gasPrice;
    if (gasPrice === undefined) throw new Error('Could not obtain an Ethereum gas quote.');
    if (await client.getBalance({ address: account }) < gas * gasPrice) throw new Error('This wallet does not have enough ETH for the transaction gas quote.');
    if (transaction.kind === 'registry') await verifyRegistry();
    await verifyAccount();
    return wallet.sendTransaction({ account, chain: mainnet, to, data, gas, ...fees });
  }
  if (allowance < amount) {
    const approvalHash = await sendChecked(IMD_ASSET, encodeFunctionData({ abi: tokenAbi, functionName: 'approve', args: [IMD_INTAKE, amount] }));
    const receipt = await client.waitForTransactionReceipt({ hash: approvalHash, timeout: 180_000 });
    if (receipt.status !== 'success') throw new Error('IMD token approval failed. No research request was sent.');
    const approved = await client.readContract({ address: IMD_ASSET, abi: tokenAbi, functionName: 'allowance', args: [account, IMD_INTAKE] });
    if (approved < amount) throw new Error('The wallet did not grant enough IMD allowance.');
  }
  // Approval may have taken minutes. Never send a stale paid body after the wallet resumes.
  researchRequestData(preflight);
  const txHash = await sendChecked(transaction.to, requestData);
  return { txHash, walletAddress: account };
}
