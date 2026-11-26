const digestPattern = /^[a-f0-9]{64}$/;
const mimePattern = /^[a-z]+\/[a-z0-9.+-]+(?:; charset=utf-8)?$/i;

export function compactAssetIndex(index) {
 const contentTypes = [];
 const mimeIds = new Map();
 const files = Object.create(null);
 for (const [key, entry] of Object.entries(index.files)) {
  const contentType = entry.contentType ?? 'application/octet-stream';
  if (!mimeIds.has(contentType)) {
   mimeIds.set(contentType, contentTypes.length);
   contentTypes.push(contentType);
  }
  files[key] = [entry.sha256, mimeIds.get(contentType), entry.contentEncoding === 'gzip' ? 1 : 0];
 }
 return {...index, assetEncoding: 'r2-compact-v1', contentTypes, files};
}

export function readAssetInfo(index, path) {
 if (!index?.files || !Object.hasOwn(index.files, path)) return undefined;
 const entry = index.files[path];
 if (index.assetEncoding !== 'r2-compact-v1') return entry;
 const [sha256, mime, compressed] = entry;
 return {sha256, contentType: index.contentTypes[mime], contentEncoding: compressed ? 'gzip' : undefined};
}

export function validAssetCatalog(index) {
 if (!index?.files || typeof index.files !== 'object' || Array.isArray(index.files)) return false;
 const compact = index.assetEncoding === 'r2-compact-v1';
 if (index.assetEncoding != null && !compact) return false;
 if (compact && (!Array.isArray(index.contentTypes) || index.contentTypes.length > 256 || !index.contentTypes.every(mime => typeof mime === 'string' && mimePattern.test(mime)))) return false;
 for (const [key, info] of Object.entries(index.files)) {
  if (key.startsWith('/') || key.includes('\\') || key.split('/').some(part => !part || part === '..') || /^export-data\/.+\/skin0\.bin$/.test(key)) return false;
  if (compact) {
   if (!Array.isArray(info) || info.length !== 3 || typeof info[0] !== 'string' || !digestPattern.test(info[0]) || !Number.isInteger(info[1]) || !index.contentTypes[info[1]] || ![0, 1].includes(info[2])) return false;
  } else if (!info || typeof info.sha256 !== 'string' || !digestPattern.test(info.sha256) || info.blob !== undefined && info.blob !== 'blobs/' + info.sha256) return false;
 }
 return true;
}
