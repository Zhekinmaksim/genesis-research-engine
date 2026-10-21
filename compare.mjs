import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {compareRecordedResearch} from './engine.mjs';
const bytes=await readFile(new URL('./evidence/recorded-world.json',import.meta.url));
if(createHash('sha256').update(bytes).digest('hex')!=='281d59f730460ddf86d075da1e6d39082bb58dad492a2630b9225f31a154d54f')throw Error('The original archive hash differs.');
console.log(JSON.stringify(compareRecordedResearch(JSON.parse(bytes)),null,2));
