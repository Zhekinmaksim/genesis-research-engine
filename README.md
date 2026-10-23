# GENESIS

Genesis is a science game about choosing a useful experiment. You are given an island, but not the rules that make its plants grow. Change the water, minerals, light or temperature, inspect the response, and decide what to test next.

**[Play Genesis](https://imdgenesis.xyz/)** · **[Follow the real IMD expedition](https://imdgenesis.xyz/research-loop)** · **[Choose the next test yourself](https://imdgenesis.xyz/research-loop/practice)** · **[Judge passport](https://imdgenesis.xyz/judges)**

This repository contains the public research engine, IMD integration, deployed contract source, saved public evidence and verification tools. The full 3D frontend, visual assets, operator credentials and private world openings are outside this repository.

## Start with the evidence

Two real IMD research requests have been applied in the same recorded synthetic world. The second received the first result and revised its assessment before proposing another experiment.

| Record | What happened | Route | Where to check it |
|---|---|---|---|
| Original experience, historical review v2 | IMD proposed adding water while holding the other conditions fixed. Growth stayed at 50/100; compatible models went from 19 to 14. | Builder wallet → real IMD Intake → accepted decision → Genesis measurement | [Walkthrough](https://imdgenesis.xyz/replay?view=text), `evidence/`, [unchanged review archive](https://imdgenesis.xyz/review/genesis-review-v2.zip) |
| Real feedback continuation | IMD received both measurements and the earlier assessment. It proposed adding basalt with water present. Growth stayed at 50/100; compatible models went from 14 to 10. | Owner → GenesisResearch → real IMD Intake → delivered callback → Genesis measurement | [Walkthrough](https://imdgenesis.xyz/research-loop), `feedback/`, [updated verifier archive](https://imdgenesis.xyz/feedback/genesis-real-loop-v2.zip) |

The earlier contract snapshot reports `spent() = 0` because it predates the continuation. The later request spent **0.5 IMD** through GenesisResearch; its lifetime budget is now exhausted. The old snapshot is a historical record, not the current contract state.

The [recorded local EVM lab](https://imdgenesis.xyz/research-lab) is a separate test with mock token, Intake and research provider. It demonstrates local contract behavior and is not another real IMD expedition.

## Verify without installing anything

Requires Node.js 20+. These commands use the prebuilt engines and saved public snapshots. They need no wallet, token, API key or npm installation.

```sh
# Original real experience and separate local reproducibility fixtures
node verify.mjs

# Real contract-funded continuation: feedback, artifact, callback, gas and model counts
node feedback/verify.mjs

# Compare the first IMD choice with the local selectors
node compare.mjs
```

The continuation verifier checks the exact request calldata, matching events and admission, accepted artifact SHA-256, world/revision binding, delivered callback and stored hashes, actual gas receipts, feedback inclusion and five rejection controls. It recalculates the change from 14 to 10 possible models.

### Choose an RPC for fresh online verification

```sh
node feedback/verify.mjs --online
node feedback/verify.mjs --online --rpc https://ethereum-rpc.publicnode.com
node feedback/verify.mjs --online --rpc https://your-archive-rpc.example --rpc https://your-fallback.example
```

Use an archive-capable Ethereum mainnet endpoint of your choice. Repeat `--rpc` for up to four candidates. You may instead set `GENESIS_VERIFY_RPC_URL` in your shell. The verifier does not load `.env` and does not print your RPC URL or credentials. It refuses RPC writes and calls only public read endpoints.

Offline verification always runs first. Online mode then checks fresh chain and official IMD data. If an endpoint cannot provide historical state, it can try the next configured RPC. Saved data is never substituted for a successful online check.

| Outcome | Meaning |
|---|---|
| Exit 0 | All requested checks passed. Without `--online`, this means offline only. |
| Exit 2 | Offline passed, but fresh online verification could not be established. The report distinguishes transport, historical-state, wrong-chain and IMD API failures. |
| Exit 3 | Fresh data did not satisfy an evidence check. Offline success does not override the mismatch. |
| Other nonzero exit | Invalid command arguments or an offline integrity failure. |

The [feedback instructions](https://imdgenesis.xyz/feedback/README.md) and [release checksums](https://imdgenesis.xyz/feedback/releases.json) are also public. The original review-v2 and feedback-v1 ZIP files remain unchanged; feedback verifier v2 adds RPC selection and diagnostics without purchasing another task.

## What you can do in the game

Start with 40 internal game credits. A training experiment costs 2 credits and measures growth, energy and survival. These credits are game counters, not IMD tokens.

Choose the conditions yourself or follow Ada, Kepler and Lin. Those three are local algorithms: Ada favors average information gain, Kepler favors controlled comparisons, and Lin favors reducing uncertainty in the least helpful outcome. They know the public family of 24 possible models and receive observations, not the selected hidden model or its opening.

When one model remains, Genesis checks predictions for four held-out conditions before revealing the world's original configuration. This local validation is separate from an evaluation of IMD intelligence.

After the second real IMD result, [the free follow-up exercise](https://imdgenesis.xyz/research-loop/practice) asks you to choose a controlled next test and explain why it is useful. It shows which of the ten remaining models would fit each hypothetical response. Those are conditional calculations, not newly measured outcomes or another IMD response. Your choices do not alter the real journal.

## What IMD and the contract actually do

The IMD agent proposes an experiment and explains its reasoning from public evidence. Genesis measures the response using its deterministic simulator. A paid proposal cannot change the world's rules or supply its own measurement.

The first research request called IMD Intake directly. The follow-up used **GenesisResearch** at [`0x06f8ceff95e5d72887c575d2759e36230b711d06`](https://etherscan.io/address/0x06f8ceff95e5d72887c575d2759e36230b711d06), deployed through IMD Launch #2322. The contract enforces its lifetime cap and expected price, prevents repeated bodies, keeps one request pending, and authenticates the Intake callback. The callback establishes delivery and provenance, not scientific truth.

- [Follow-up order](https://etherscan.io/tx/0x59fcd440cb6ef056f33529ac1d74f13e9e1ca069c973748ea7b226f23b2f9a56)
- [Delivered callback](https://etherscan.io/tx/0x70d660e98ad243efd268777ce0eb1653f202273e5b27141a2d2b793d3d11eb09)
- [Official IMD admission and completion](https://api.imd.fun/intake/1/0x59fcd440cb6ef056f33529ac1d74f13e9e1ca069c973748ea7b226f23b2f9a56)
- [Accepted follow-up artifact](https://api.imd.fun/artifacts/731fae9ec1ce1354d832c15b259e028fd1e6910aba1b3f0e043666df4249ac3e)
- [Contract role and historical snapshots](CONTRACT_ROLE.md)

The continuation cost 0.5 IMD plus **0.000158312559587896 ETH** in aggregate owner gas for approval, funding and ordering. Replaying or verifying it makes no further payment. This contract instance has used its full 0.5/0.5 IMD lifetime budget and cannot buy another research job.

## Build and test the published source

```sh
npm ci
npm test
npm run build
node verify.mjs
node feedback/verify.mjs
```

`npm test` covers the observation-only engine, research provenance, callback binding, feedback preparation and the post-feedback exercise. It also runs the RPC transport and CLI diagnostic tests. Those tests use explicit fixtures, not real payments. Contract tests additionally require Foundry:

```sh
npm run test:contracts
```

The original local-world verifier tests 24 separate deterministic fixtures and their held-out predictions. These fixtures are not a rerun of the historical IMD world's hidden configuration.

## What remains unproven

Genesis explores a defined synthetic model family. It does not discover laws of the physical world. The historical world's seed and salt have not been published, so reviewers can recalculate candidate elimination from the saved measurements but cannot independently regenerate those measurements from the opening.

The two recorded IMD choices coincide with the local Kepler choices. The information available to them differs, so this is not an equal-information benchmark and does not establish that IMD outperforms the local algorithms. The useful demonstrated behavior is the explanation of a controlled test and the revision of an assessment after receiving evidence. A learning benefit for real users has not yet been measured.

No ongoing autonomous paid expedition is claimed. There were two recorded research requests across two routes. The local mock lab, the separate free worlds and the real IMD records are labelled separately.

## Checksums and versions

- Original public world archive SHA-256: `281d59f730460ddf86d075da1e6d39082bb58dad492a2630b9225f31a154d54f`
- Continuation public archive SHA-256: `1e985c840f4f1242208ff44c0ea374725af8660d9fa770607b75acb98ab75479`
- Original decision artifact SHA-256: `a832e2611353d3cb8e8c29d5c6250fe591b58be650413f03a48eb6fe7c746fc9`
- Follow-up decision artifact SHA-256: `731fae9ec1ce1354d832c15b259e028fd1e6910aba1b3f0e043666df4249ac3e`

Each download has its own file manifest. The on-chain result-document Keccak is a different hash from the decision artifact's SHA-256. See [evidence levels](https://imdgenesis.xyz/evidence) for the precise boundaries.
