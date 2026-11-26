export function unpack(value,Type){const raw=Uint8Array.from(atob(value),c=>c.charCodeAt(0));if(raw.byteLength%Type.BYTES_PER_ELEMENT)throw Error('Invalid animation data.');return new Type(raw.buffer)}

export function animatedMesh(THREE,geometry,materials,rig){
 if(rig.version!==1||rig.vertices!==geometry.getAttribute('position').count)throw Error('The skeleton does not match this model.');
 const indices=unpack(rig.indices,Uint16Array),weights=unpack(rig.weights,Float32Array);
 if(indices.length!==rig.vertices*4||weights.length!==indices.length)throw Error('Invalid skin weights.');
 for(let i=0;i<indices.length;i++)if(indices[i]>=rig.bones.length||!Number.isFinite(weights[i])||weights[i]<0)throw Error('Invalid bone influence.');
 const mesh=new THREE.SkinnedMesh(geometry,materials),bones=rig.bones.map((data,index)=>{const bone=new THREE.Bone();bone.name='joint_'+index;bone.position.fromArray(data.position);bone.quaternion.fromArray(data.rotation).normalize();bone.scale.fromArray(data.scale);return bone});
 for(let i=0;i<bones.length;i++){const parent=rig.bones[i].parent;if(parent===-1)mesh.add(bones[i]);else{if(!bones[parent]||parent===i)throw Error('Invalid skeleton hierarchy.');bones[parent].add(bones[i])}}
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
 mesh.updateMatrixWorld(true);const inverses=rig.bones.map(data=>new THREE.Matrix4().compose(new THREE.Vector3().fromArray(data.inversePosition),new THREE.Quaternion().fromArray(data.inverseRotation).normalize(),new THREE.Vector3().fromArray(data.inverseScale)));
 const skeleton=new THREE.Skeleton(bones,inverses);mesh.bind(skeleton,new THREE.Matrix4());mesh.normalizeSkinWeights();mesh.frustumCulled=false;mesh.userData.animationBones=new Map(rig.bones.map((data,index)=>[data.hash,bones[index]]));mesh.userData.animationRig=rig;
 return mesh;
}

export function animationClip(THREE,data,mesh,name){
 if(data.version!==1||!Number.isFinite(data.duration)||data.duration<=0)throw Error('Invalid animation clip.');
 const tracks=[];
 for(const source of data.tracks){const bone=mesh.userData.animationBones.get(source.bone);if(!bone)continue;for(const [field,property,Type,width] of [['positions','position',THREE.VectorKeyframeTrack,3],['rotations','quaternion',THREE.QuaternionKeyframeTrack,4],['scales','scale',THREE.VectorKeyframeTrack,3]]){const values=source[field];if(!values)continue;const times=values.length===width?[0]:source.times;if(values.length!==times.length*width||values.some(value=>!Number.isFinite(value)))throw Error('Invalid animation track.');tracks.push(new Type(bone.uuid+'.'+property,times,values))}}
 if(!tracks.length)throw Error('This animation has no matching bones.');
 const range=motionRange(data,mesh);if(!range)throw Error('This motion needs game-only effects.');
 if(range.start>0||range.end<data.duration)for(const track of tracks)track.trim(range.start,range.end).shift(-range.start);
 return new THREE.AnimationClip(name,range.end-range.start,tracks);
}

export function motionRange(data,mesh){
 const rig=mesh.userData.animationRig,root=rig.bones.find(bone=>/^root$/i.test(bone.name??'')&&bone.parent===-1)??rig.bones.find(bone=>bone.parent===-1),track=data.tracks.find(track=>track.bone===root?.hash);
 if(!root||!track?.positions)return{start:0,end:data.duration};
 const bounds=mesh.userData.visibleBounds??mesh.geometry.boundingBox;if(!bounds){mesh.geometry.computeBoundingBox();return motionRange(data,mesh)}
 const size=bounds.max.clone().sub(bounds.min).length(),limit=Math.max(.001,size)*5,count=track.positions.length/3,times=count===1?[0]:track.times;let start=0,best=null;
 const safe=index=>Math.hypot(...track.positions.slice(index*3,index*3+3).map((value,k)=>value-root.position[k]))<=limit;
 while(start<count){while(start<count&&!safe(start))start++;if(start===count)break;let end=start;while(end+1<count&&safe(end+1))end++;const range={start:times[start],end:end===count-1?data.duration:times[end]};if(range.end-range.start>0&&(!best||range.end-range.start>best.end-best.start))best=range;start=end+1}
 return best;
}

export function restorePose(mesh){if(!mesh?.isSkinnedMesh)return;mesh.userData.animationRig.bones.forEach((data,index)=>{const bone=mesh.skeleton.bones[index];bone.position.fromArray(data.position);bone.quaternion.fromArray(data.rotation);bone.scale.fromArray(data.scale)});mesh.updateMatrixWorld(true);mesh.skeleton.update()}
