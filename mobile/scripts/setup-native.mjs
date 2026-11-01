import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
for(const platform of ['android','ios'])if(!existsSync(platform))execFileSync('npx',['cap','add',platform],{stdio:'inherit'});
execFileSync('npx',['cap','sync'],{stdio:'inherit'});
