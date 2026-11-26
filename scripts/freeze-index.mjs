import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {compactAssetIndex,validAssetCatalog} from '../worker/catalog-index.mjs';

const [source,destination]=process.argv.slice(2);
if(!source||!destination)throw Error('Usage: node scripts/freeze-index.mjs SOURCE_JSON OUTPUT_GZ');
const snapshot=compactAssetIndex(JSON.parse(await readFile(source,'utf8')));
if(!validAssetCatalog(snapshot))throw Error('Invalid asset index.');
await writeFile(destination,gzipSync(JSON.stringify(snapshot),{level:9}));
console.log(JSON.stringify({champions:snapshot.champions,skins:snapshot.skins,objects:snapshot.uniqueBlobs}));
