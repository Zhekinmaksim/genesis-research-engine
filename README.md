# GENESIS research engine and real IMD evidence

GENESIS is a synthetic black-box ecosystem. Local algorithms spend internal simulation credits to distinguish a known family of 24 models. Optional external IMD research proposes an experiment from public observations. The simulator controls the measured outcome.

## Verify in one command — no installation, wallet or network

Requires Node.js 20 or later. Download and extract the review ZIP, open the extracted directory, then run:

```sh
node verify.mjs
```

The verifier checks every manifest-listed file, the byte-exact original IMD artifact and archived public record, production request/event/admission validation against saved public snapshots, and the artifact-to-measurement binding. It recomputes **19 → 14** models and excludes **07, 11, 13, 14, 16**. Negative controls reject altered evidence. It also runs 24 separate free local seeded fixtures through held-out prediction and commitment reveal.

No dependencies are installed by that command. `engine.mjs` is bundled from the supplied, unchanged production TypeScript files. Its dependency license notices are retained.

Optional fresh public provenance check:

```sh
node verify.mjs --online
```

This adds read-only Ethereum JSON-RPC and GET requests to the official IMD API. It never signs, submits a transaction, opens a job or spends tokens. Availability of those third-party endpoints is outside GENESIS's control. Offline snapshots do not independently prove Ethereum consensus or certify the truth of measurements.

## The actual result

Control: no water, no mineral, amber light, warm temperature. Treatment: water added, other conditions unchanged. Both historical measurements: growth 50/100, energy 40/100, survival false. Five reference models disagree with that observation; 14 remain. One comparison does not identify a unique law or show that water never matters.

Original research request: ec8cebff-9a12-42af-9bdf-70313db2be36. Ethereum transaction: https://etherscan.io/tx/0xb7b1af7d4a1b560d120ba45b25f6c8d64d3d0143f0204f71a233cb2a78b2b361 . Original artifact: https://api.imd.fun/artifacts/a832e2611353d3cb8e8c29d5c6250fe591b58be650413f03a48eb6fe7c746fc9 . Historical cost: 0.5 IMD + 0.0000157250756555 ETH aggregate gas. No payment is repeated by this package.

## Source map

- server/research.ts: observation-only experiment selection, model filtering and the public training/holdout split. Ada, Kepler and Lin are deterministic local strategies, not external IMD agents.
- server/world.ts: private world commitment, simulator, internal budget, persistence projection, authenticated proposal application and held-out validation. Actual user snapshots, seeds, salts and private keys are excluded.
- server/imd.ts and research-evidence.ts: external request schema and strict evidence verification. The engine verifier does not invoke their paid wallet path; no signer is included.
- server/registry.ts and shared/registry-types.ts: optional contract preflight. src/lib/imd-wallet.ts is the public browser transaction preparation code; it contains no wallet keys and is not imported by the offline verifier.
- shared/reference-models.ts and model-explanations.ts: public model predictions and explanations for rejection.
- contracts/: exact IMD-published contract source and local mock tests. Read CONTRACT_ROLE.md for the separation between deployment and historical direct-Intake research.
- evidence/: public archive, original decision bytes, read-only Ethereum/IMD snapshots and deployment/source comparison snapshots.

## Rebuild and run source tests (optional)

```sh
npm ci --ignore-scripts
npm run build
npm test
forge test --root contracts
```

These commands are optional for reviewers of the already bundled offline verifier. `build.mjs` rebuilds engine.mjs from the supplied source. To regenerate the file manifest after an intentional source edit, run `node build.mjs --manifest`; changes invalidate the original release hashes. The published Git commit and website ZIP SHA-256 pin the reviewed release.

## What is and is not established

- The raw response is a real IMD research proposal; the simulator's measurement is recorded by Genesis.
- The package reproduces candidate elimination from public measurements. The hidden opening of the historical world is intentionally absent; it does not reconstruct the original hidden model.
- Four held-out conditions in a local fixture belong to the same synthetic world and known model family. This is not an independent AI benchmark or discovery of laws of nature.
- GenesisResearch is a separate IMD deployment. Its local tests are not a completed mainnet contract-funded research cycle.
- This repository contains the research engine, integration and review evidence, not the complete 3D frontend or an asset redistribution.

Demo: https://imdgenesis.xyz · Judge passport: https://imdgenesis.xyz/judges · Recorded experience without 3D: https://imdgenesis.xyz/replay?view=text

## Retrospective IMD / local comparison and learning scenario

Run `node compare.mjs` to recalculate the comparison from the original public archive. The first automatic experiment was Ada's control, so Kepler would be the next local turn. IMD selected the same water-only contrast as Kepler. All three local strategy choices and the IMD proposal produce reference-family branches with 2, 14 and 3 models. With an explicit uniform model weighting, expected remaining models are (2² + 14² + 3²)/19 = 11. The historical IMD treatment actually left 14 models. Local alternatives were not executed separately; their unobserved results are not invented.

The local selector knows the full model family and response formula. The original IMD request supplied the hypothesis, observation and available conditions, without that formula. This is one retrospective choice comparison with different prior information, not a statistical benchmark or proof of AI superiority or cost efficiency. Its value for the question is a controlled water contrast, rather than a claim to outperform the local selector.

Production analysis source: server/recorded-comparison.ts. Public learning scenario: shared/user-scenario.ts. The additional offline comparison check is included in `node verify.mjs`. The original v1 ZIP remains preserved on the website.

Learning scenario: https://imdgenesis.xyz/learn — predict the recorded water response, inspect the evidence, then ask what interaction remains unresolved. A free new local world is a separate expedition, not a continuation of the historical IMD request.
