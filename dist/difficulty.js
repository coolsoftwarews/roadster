// Easy preserves the original circuit settings. Higher modes ask for more
// precise landing timing and more steering between fully charged jumps.
export const DIFFICULTIES = Object.freeze([
  Object.freeze({id:'easy',name:'Easy',description:'The original ride. More time to land and recharge.',landingWindowStart:.62,rechargeTime:2.1,checkpointSpacing:400,maxSpeed:73,extraObstacles:0}),
  Object.freeze({id:'medium',name:'Medium',description:'More traffic, faster driving, and tighter landings.',landingWindowStart:.72,rechargeTime:2.8,checkpointSpacing:600,maxSpeed:80,extraObstacles:6}),
  Object.freeze({id:'hard',name:'Hard',description:'Heavy traffic, top speed, and precise landing burns.',landingWindowStart:.80,rechargeTime:3.6,checkpointSpacing:800,maxSpeed:87,extraObstacles:12})
]);

export function getDifficulty(id){return DIFFICULTIES.find(difficulty=>difficulty.id===id)||DIFFICULTIES[0];}
