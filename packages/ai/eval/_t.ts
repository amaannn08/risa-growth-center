import { readFileSync } from 'fs';
import { extractNumbers, stripNonFigures } from '../src/grounding';
const a=readFileSync('/tmp/risa-r5b-43.txt','utf8');
console.log(extractNumbers(a).map(t=>t.raw+' | '+t.before));
