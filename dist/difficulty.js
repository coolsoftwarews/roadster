// Thrust responds consistently in every mode. Higher modes increase speed,
// traffic, and the distance between checkpoints.
export const DIFFICULTIES = Object.freeze([
  Object.freeze({id:'easy',name:'Easy',description:'',landingWindowStart:.62,rechargeTime:2.1,checkpointSpacing:400,maxSpeed:73,extraObstacles:0}),
  Object.freeze({id:'medium',name:'Medium',description:'More traffic and faster driving.',landingWindowStart:.62,rechargeTime:2.1,checkpointSpacing:600,maxSpeed:80,extraObstacles:6}),
  Object.freeze({id:'hard',name:'Hard',description:'Heavy traffic, top speed, and fewer checkpoints.',landingWindowStart:.62,rechargeTime:2.1,checkpointSpacing:800,maxSpeed:87,extraObstacles:12})
]);

export function getDifficulty(id){return DIFFICULTIES.find(difficulty=>difficulty.id===id)||DIFFICULTIES[0];}
