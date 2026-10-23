import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {feedbackPractice,feedbackPracticeHtml} from './feedback-exercise';
import {conditionKey,TRAINING} from './research';
const fixture=()=>JSON.parse(readFileSync(new URL('./fixtures/continuation-public.json',import.meta.url),'utf8')).state;
test('post-feedback practice uses the actual third measurement and computes conditional model branches',()=>{
 const s=fixture(),before=JSON.stringify(s),d=feedbackPractice(s,'water','water');assert.equal(d.feedback?.passed,true);assert.equal(d.compatibleModels,10);
 assert.deepEqual(d.feedback?.selected.branches.map(b=>[b.growth,b.remainingModels]),[[0,1],[50,6],[100,3]]);assert.equal(d.feedback?.selected.expectedRemainingModels,4.6);
 assert.equal(new Set(d.feedback!.selected.branches.flatMap(b=>b.modelIds)).size,10);
 assert.ok(d.options.every(o=>TRAINING.some(c=>conditionKey(c)===conditionKey(o.conditions))&&!s.observations.some((v:any)=>conditionKey(v.conditions)===conditionKey(o.conditions))));assert.equal(JSON.stringify(s),before);
});
test('controlled but irrelevant tests, confounding and universal claims receive different feedback',()=>{
 const s=fixture();assert.match(feedbackPractice(s,'temperature','water').feedback!.choiceFeedback,/controlled temperature/);assert.equal(feedbackPractice(s,'temperature','water').feedback?.passed,false);
 assert.match(feedbackPractice(s,'mixed','water').feedback!.choiceFeedback,/Water and light/);assert.match(feedbackPractice(s,'water','universal').feedback!.reasonFeedback,/cannot establish/);assert.throws(()=>feedbackPractice(s,'<script>','water'));assert.throws(()=>feedbackPractice({...s,revision:2}));
});
test('public exercise is a read-only GET form and does not present hypothetical branches as measurements',()=>{
 const html=feedbackPracticeHtml(fixture(),new URLSearchParams('check=1&choice=water&reason=water'));assert.match(html,/method="get"/);assert.match(html,/conditional forecasts/);assert.match(html,/exactly three measurements and ten compatible models/);assert.doesNotMatch(html,/<script|\/api\/experiment/);
 const initial=feedbackPracticeHtml(fixture(),new URLSearchParams());assert.doesNotMatch(initial,/Hypothetical growth/);assert.match(initial,/water off has not been measured/);
});
