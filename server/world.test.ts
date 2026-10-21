import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Expedition, ExpeditionError } from './world.ts';
import { CANDIDATES, HOLDOUT, TRAINING, candidatesFor, conditionKey, decideExperiment, hypothesesFor, modelOutcome } from './research.ts';
import type { JournalEntry, Observation } from '../shared/types.ts';

test('local researchers infer at least five seeded worlds within fifteen paid experiments', () => {
  for (let seed = 0; seed < 100; seed++) {
    const expedition = new Expedition(`seed-${seed}`);
    let steps = 0;
    while (expedition.state().phase !== 'ready' && steps < 15) { expedition.step(); steps++; }
    assert.equal(expedition.state().phase, 'ready', `seed ${seed}`);
    const before = expedition.state().observations;
    const state = expedition.predict();
    assert.equal(state.restored, true);
    assert.equal(state.holdoutScore, 100);
    assert.deepEqual(state.observations, before);
    assert.equal(state.credits, state.initialCredits - steps * 2);
    assert.ok(state.observations.every(o => o.outcome.growth >= 0 && o.outcome.growth <= 100 && o.outcome.energy >= 0 && o.outcome.energy <= 100));
  }
});

test('learner is observation-only; same observations imply same choice and no secret imports', () => {
  assert.equal(CANDIDATES.length, 24);
  const a = new Expedition('different-world-a');
  const b = new Expedition('different-world-b');
  assert.deepEqual(decideExperiment(a.state().observations, 0), decideExperiment(b.state().observations, 0));
  const source = readFileSync(new URL('./research.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from\s+['"].*(world|simulator)/);
  assert.equal(candidatesFor([]).length, 24);
  assert.ok(hypothesesFor([]).every(h => h.status === 'testing'));
});

test('all twenty training inputs uniquely identify each model without holdout observations', () => {
  CANDIDATES.forEach(candidate => {
    const observations = TRAINING.map((conditions, i) => ({ id: String(i), sequence: i, agentId: 'human' as const, conditions, outcome: modelOutcome(candidate, conditions), cost: 2, note: '' }));
    assert.equal(candidatesFor(observations).length, 1);
  });
});

test('holdout cannot be purchased or predicted early; failure does not spend credits', () => {
  const e = new Expedition('holdout');
  const state = e.state();
  assert.throws(() => e.predict(), (error: unknown) => error instanceof ExpeditionError && error.code === 'NOT_READY');
  HOLDOUT.forEach(c => assert.throws(() => e.experiment(c), (error: unknown) => error instanceof ExpeditionError && error.code === 'HELD_OUT'));
  assert.deepEqual(e.state(), state);
  for (let i = 0; i < 15 && e.state().phase !== 'ready'; i++) e.step();
  assert.ok(e.state().observations.every(o => !HOLDOUT.some(h => conditionKey(h) === conditionKey(o.conditions))));
});

test('budget and duplicate checks are atomic', () => {
  const e = new Expedition('budget');
  TRAINING.slice(0, 20).forEach(c => e.experiment(c));
  assert.equal(e.state().credits, 0);
  assert.equal(e.state().spent, 40);
  const state = e.state();
  assert.deepEqual(e.step(), state); // completed research does not buy an extra experiment
  assert.throws(() => e.experiment(TRAINING[0]!), (error: unknown) => error instanceof ExpeditionError && error.code === 'DUPLICATE_EXPERIMENT');
  assert.deepEqual(e.state(), state);
});

test('persistence preserves secret commitment, future choices, and completed holdout', () => {
  const e = new Expedition('persistent');
  e.step();
  const restored = Expedition.restore(JSON.parse(JSON.stringify(e.serialize())));
  assert.deepEqual(restored.state(), e.state());
  assert.deepEqual(restored.step(), e.step());
  for (let i = 0; i < 15 && e.state().phase !== 'ready'; i++) e.step();
  e.predict();
  assert.deepEqual(Expedition.restore(e.serialize()).state(), e.state());
  const reset = new Expedition('persistent');
  assert.equal(reset.state().observations.length, 0);
  assert.equal(reset.state().credits, 40);
  assert.notEqual(reset.state().id, e.state().id);
  assert.notEqual(reset.state().commitment, e.state().commitment);
});

test('public state never exposes seed, salt, secret model, or mutable internal references', () => {
  const e = new Expedition('private-seed-do-not-leak');
  const initial = e.state();
  assert.doesNotMatch(JSON.stringify(initial), /private-seed-do-not-leak|"salt"|"seed"|"model"/);
  assert.match(initial.commitment, /^0x[0-9a-f]{64}$/);
  initial.journal[0]!.text = 'tampered';
  assert.notEqual(e.state().journal[0]!.text, 'tampered');
  assert.equal(initial.holdoutScore, null);
  assert.deepEqual(initial.predictions, []);
});

test('malformed conditions and snapshots are rejected without mutations', () => {
  const e = new Expedition('input');
  const before = e.state();
  for (const input of [null, [], {}, { ...TRAINING[0], water: 'true' }, { ...TRAINING[0], mineral: 'uranium' }, { ...TRAINING[0], light: 'red' }, { ...TRAINING[0], temperature: 'hot' }, { ...TRAINING[0], seed: 'hack' }]) {
    assert.throws(() => e.experiment(input as never), ExpeditionError);
  }
  assert.deepEqual(e.state(), before);
  assert.throws(() => Expedition.restore({}), ExpeditionError);
  e.step();
  const raw = e.serialize() as { observations: { outcome: { growth: number } }[] };
  raw.observations[0]!.outcome.growth = 999;
  assert.throws(() => Expedition.restore(raw), ExpeditionError);
});

test('world opens only after validation and the revealed configuration matches its original commitment', () => {
  const e = new Expedition('sealed-world');
  const commitment = e.state().commitment;
  assert.throws(() => e.reveal(), (error: unknown) => error instanceof ExpeditionError && error.code === 'NOT_COMPLETE');
  assert.equal(e.state().restoration, null);
  for (let i = 0; i < 15 && e.state().phase !== 'ready'; i++) e.step();
  assert.throws(() => e.reveal(), ExpeditionError);
  const state = e.predict();
  assert.equal(state.restoration?.outcome.growth, 100);
  assert.equal(state.restoration?.outcome.survived, true);
  assert.equal(e.reveal().commitment, commitment);
  assert.equal(e.reveal().matches, true);
  assert.equal(JSON.parse(e.reveal().opening).seed, 'sealed-world');
  assert.doesNotMatch(JSON.stringify(e.state()), /sealed-world|"salt"|"seed"/);
});

test('new worlds expose English built-in copy and English validation errors', () => {
  const e = new Expedition('english-copy');
  assert.doesNotMatch(JSON.stringify(e.state()), /[А-Яа-яЁё]/);
  assert.throws(() => e.experiment({} as never), /Invalid experiment conditions/);
  for (let i = 0; i < 15 && e.state().phase !== 'ready'; i++) e.step();
  assert.doesNotMatch(JSON.stringify(e.predict()), /[А-Яа-яЁё]/);
  assert.deepEqual(e.state().researchers.map(r => r.name), ['Ada', 'Kepler', 'Lin']);
});

test('legacy English projection preserves the complete private snapshot and scientific results', () => {
  const e = new Expedition('legacy-english-projection');
  for (let i = 0; i < 15 && e.state().phase !== 'ready'; i++) e.step();
  const originalState = e.predict();
  const originalOpening = e.reveal();
  const snapshot = e.serialize() as { journal: JournalEntry[]; observations: Observation[] };
  const messages = [
    'Мы на незнакомом острове. Выясним, какие условия возвращают растения к жизни.',
    'Скрытый мир зафиксирован хешем. Три локальных исследователя знают только семейство моделей и общие наблюдения.',
    'Опыт 1: растение не выжило, рост 50/100. Потрачено 2 кредита.',
    'Опыт 2: растение прижилось, рост 100/100. Потрачено 2 кредита.',
    'Опыт 3: рост 90/100, энергия 80/100. Потрачен 1 исследовательский кредит.',
    'Список возможных объяснений сократился: 24 → 19.',
    'Наблюдение исключило 5 моделей; осталось 19.',
    'Ответ на воду: Наблюдения поддерживают более высокий рост с водой. Это вывод внутри выбранного семейства, а не доказательство для всех возможных миров.',
    'Ответ на воду. Наблюдения поддерживают более высокий рост без воды.',
    'Минеральный катализатор: Все оставшиеся модели предсказывают лучший рост с базальтом. Это вывод внутри выбранного семейства, а не доказательство для всех возможных миров.',
    'Минеральный катализатор. Все оставшиеся модели предсказывают лучший рост с кварцем.',
    'Минеральный катализатор. Все оставшиеся модели предсказывают лучший рост без минералов.',
    'Свет и температура: В рамках семейства моделей предпочтительны синий свет и тепло. Это вывод внутри выбранного семейства, а не доказательство для всех возможных миров.',
    'Свет и температура. В рамках семейства моделей предпочтительны янтарный свет и прохлада.',
    'Независимая проверка: 4/4 точных прогнозов. Контрольные результаты не добавлены в обучающие наблюдения.',
  ];
  snapshot.journal = messages.map((text, i) => ({ id: `legacy-${i}`, sequence: i + 1, kind: 'system', agentId: 'system', text }));
  const notes = [
    'Выбираю опыт, который в среднем разделит больше оставшихся моделей.',
    'Меняю как можно меньше условий и проверяю различие между оставшимися объяснениями.',
    'Выбираю опыт, который уменьшит неопределённость даже при наименее удобном результате.',
    'Опыт выбран вручную.',
  ];
  snapshot.observations.forEach((o, i) => { o.note = notes[i % notes.length]!; });
  const before = JSON.stringify(snapshot);
  const restored = Expedition.restore(snapshot);
  const english = restored.state();
  assert.doesNotMatch(JSON.stringify(english), /[А-Яа-яЁё]/);
  assert.match(english.journal[2]!.text, /growth 50\/100\. Spent 2 credits/);
  assert.match(english.journal[7]!.text, /not a proof for every possible world/);
  assert.match(english.journal[13]!.text, /amber light and cool temperatures/);
  assert.equal(english.id, originalState.id);
  assert.equal(english.commitment, originalState.commitment);
  assert.equal(english.revision, originalState.revision);
  assert.equal(english.credits, originalState.credits);
  assert.deepEqual(english.observations.map(({ note: _note, ...rest }) => rest), originalState.observations.map(({ note: _note, ...rest }) => rest));
  assert.deepEqual(english.predictions, originalState.predictions);
  assert.deepEqual(english.restoration, originalState.restoration);
  assert.deepEqual(restored.reveal(), originalOpening);
  assert.equal(JSON.stringify(restored.serialize()), before);
  assert.equal(JSON.stringify(snapshot), before);
  assert.deepEqual(Expedition.restore(restored.serialize()).state(), english);
});

test('unknown external notes are preserved, clearly labelled, and never persisted as translations', () => {
  const originalNote = 'Моя собственная гипотеза о растении.';
  const e = new Expedition('external-note');
  e.experiment(TRAINING[0]!, 'imd', originalNote);
  const snapshot = e.serialize() as { observations: Observation[] };
  assert.equal(e.state().observations[0]!.note, `Original text (untranslated): ${originalNote}`);
  assert.equal(snapshot.observations[0]!.note, originalNote);
  assert.equal(Expedition.restore(snapshot).state().observations[0]!.note, e.state().observations[0]!.note);
  e.experiment(TRAINING[1]!, 'human', 'toString');
  assert.equal(e.state().observations[1]!.note, 'toString');
});
