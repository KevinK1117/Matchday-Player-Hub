import {cp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
const root=new URL('../',import.meta.url),web=new URL('web/',root);
await rm(web,{recursive:true,force:true});await mkdir(web,{recursive:true});
await cp(new URL('../public/',root),new URL('public/',web),{recursive:true});
await cp(new URL('src/native.js',root),new URL('native.js',web));
let html=await readFile(new URL('../index.html',root),'utf8');
// Bundle the existing interface locally. Native HTTP talks to the existing backend.
html=html.replace('</head>','<script type="module" src="/native.js"></script></head>');
await writeFile(new URL('index.html',web),html);
console.log('Bundled Matchday interface prepared');
