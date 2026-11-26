import argparse
import concurrent.futures
import hashlib
import io
import json
from pathlib import Path
import re
import tarfile


def file_hash(file):
    with file.open('rb') as source:
        return hashlib.file_digest(source,'sha256').hexdigest()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('index',type=Path)
    parser.add_argument('objects',type=Path)
    parser.add_argument('output',type=Path)
    parser.add_argument('repository')
    parser.add_argument('release')
    parser.add_argument('--chunk-mib',type=int,default=1024)
    args=parser.parse_args()
    if not 1<=args.chunk_mib<=1900:
        parser.error('Chunk size must be between 1 and 1900 MiB.')
    args.output.mkdir(parents=True,exist_ok=True)
    limit=args.chunk_mib*1024**2
    catalog=json.loads(args.index.read_bytes())
    entries={}
    for asset in catalog['files'].values():
        identity,size=asset['sha256'],asset['size']
        if not re.fullmatch('[a-f0-9]{64}',identity) or not isinstance(size,int) or size<1:
            raise ValueError('Invalid asset entry.')
        if entries.setdefault(identity,size)!=size:
            raise ValueError('Conflicting asset sizes.')
    print('Packing '+str(len(entries))+' catalogue objects.',flush=True)
    batches=[]
    items=[]
    padded=0
    for identity,size in entries.items():
        item_size=512+((size+511)//512)*512
        if item_size+10240>limit:
            raise ValueError('An asset does not fit in an archive.')
        if items and padded+item_size+10240>limit:
            batches.append(items)
            items,padded=[],0
        items.append((identity,size))
        padded+=item_size
    if items:
        batches.append(items)

    def read_item(entry):
        identity,size=entry
        content=(args.objects/identity).read_bytes()
        if len(content)!=size or hashlib.sha256(content).hexdigest()!=identity:
            raise ValueError('Asset checksum mismatch: '+identity)
        return content

    def assemble(index,batch,reading):
        name=f'atelier-assets-{index:02d}-of-{len(batches):02d}.tar'
        target=args.output/name
        with tarfile.open(target,mode='x',format=tarfile.USTAR_FORMAT) as archive:
            for offset in range(0,len(batch),24):
                group=batch[offset:offset+24]
                for (identity,size),content in zip(group,reading.map(read_item,group),strict=True):
                    item=tarfile.TarInfo('objects/'+identity)
                    item.size=size
                    item.mode=0o644
                    archive.addfile(item,io.BytesIO(content))
        chunk={'name':name,'size':target.stat().st_size,'sha256':file_hash(target),'objects':len(batch)}
        (args.output/(name+'.json')).write_text(json.dumps(chunk)+'\n',encoding='utf-8')
        print(json.dumps(chunk),flush=True)
        return chunk

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as reading:
        chunks=[assemble(index,batch,reading) for index,batch in enumerate(batches,1)]
    manifest={'repository':args.repository,'release':args.release,'champions':catalog['champions'],
              'skins':catalog['skins'],'objectCount':len(entries),'objectBytes':sum(entries.values()),'chunks':chunks}
    (args.output/'asset-bundle.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':
    main()
