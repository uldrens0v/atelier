export const exportNameLimit=60;

export function customExportName(value){
 if(typeof value!=='string')return '';
 const visible=value.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu,' ').replace(/\s+/gu,' ').trim();
 return Array.from(visible).slice(0,exportNameLimit).join('').trimEnd();
}

export function defaultExportName(skin,label){
 return skin+' · '+String(label??'Custom chroma').slice(0,exportNameLimit);
}

export function exportFilename(name,fallback){
 const safe=name.replace(/[<>:"/\\|?*]/gu,'-').replace(/^[ .]+|[ .]+$/gu,'');
 if(!safe)return fallback;
 const stem=/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(safe)?'Chroma '+safe:safe;
 return stem+'.fantome';
}
