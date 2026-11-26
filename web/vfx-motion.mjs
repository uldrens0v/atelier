export function travelDistance(time,ability,distance=ability.range){
 const t=Math.max(0,time),movement=ability.movement??{},kind=movement._type;
 if(kind==='FixedTimeMovement'&&movement.mTravelTime>0)return Math.min(distance,distance*t/movement.mTravelTime);
 if(kind==='AcceleratingMovement'){
  const initial=movement.mInitialSpeed??ability.speed,acceleration=movement.mAcceleration??0,min=Math.max(0,movement.mMinSpeed??0),max=Math.max(min,movement.mMaxSpeed??Infinity),start=Math.max(min,Math.min(max,initial));if(!acceleration)return Math.min(distance,start*t);const boundary=acceleration>0?max:min,limit=Number.isFinite(boundary)?Math.max(0,(boundary-start)/acceleration):Infinity,before=Math.min(t,limit),after=Math.max(0,t-limit);return Math.max(0,Math.min(distance,start*before+.5*acceleration*before*before+(after?boundary*after:0)));
 }
 return Math.min(distance,t*Math.max(.001,ability.speed));
}
export function flightDuration(ability,distance=ability.range){
 if(ability.movement?._type==='FixedTimeMovement'&&ability.movement.mTravelTime>0)return ability.movement.mTravelTime;
 if(ability.movement?._type!=='AcceleratingMovement')return distance/Math.max(.001,ability.speed);
 let low=0,high=1;while(high<120&&travelDistance(high,ability,distance)<distance)high*=2;if(travelDistance(high,ability,distance)<distance)return high;for(let i=0;i<42;i++){const middle=(low+high)/2;if(travelDistance(middle,ability,distance)<distance)low=middle;else high=middle}return high;
}
