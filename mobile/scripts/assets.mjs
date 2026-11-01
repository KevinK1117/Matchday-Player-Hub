import {cp} from 'node:fs/promises';
await cp(new URL('../web/public/',import.meta.url),new URL('../dist/public/',import.meta.url),{recursive:true});
