// Fictional circuits inspired by each region; these are not Robotaxi service routes.
const canyonControls = [[0,1,0],[0,1,120],[30,3,235],[155,10,290],[255,15,230],[255,18,110],[365,18,45],[470,14,130],[425,6,295],[330,1,430],[170,3,490],[85,9,600],[160,19,735],[330,15,790],[490,8,720],[610,9,790],[650,19,950],[520,24,1060],[330,18,1010],[210,9,1135],[300,12,1290],[475,10,1380]];
const canyonObstacles = [[.065,'barrier',0],[.12,'car',-3],[.175,'pothole',2.6],[.225,'bus',0],[.28,'barrier',-1.5],[.335,'car',3],[.39,'pothole',-3],[.44,'bus',-2.7],[.49,'barrier',0],[.54,'car',-3.4],[.59,'pothole',2],[.64,'bus',2.4],[.695,'barrier',0],[.75,'car',1.8],[.80,'pothole',-2.7],[.85,'bus',0],[.905,'car',-2],[.945,'barrier',0]];

export const TRACKS = [
  {
    id:'canyon', name:'Canyon Circuit', city:'Desert canyon', number:'01',
    tagline:'THE ORIGINAL ESCAPE', description:'Sandstone cliffs, sweeping bends, and the original canyon run.',
    controls:canyonControls, seed:38193,
    theme:{skyTop:'#7cabbf',skyBottom:'#f6d4ab',fog:'#cfbd9d',groundHue:.075,groundSaturation:.40,groundLightness:.26,sunColor:'#ffdfaf',sunIntensity:3.3,hemisphereGround:'#b48b64',accent:'#ff8256'},
    obstacles:canyonObstacles,
    ramps:[[.105,0],[.315,-2],[.525,2],[.735,0],[.875,-2]]
  },
  {
    id:'austin', name:'Austin Hill Country', city:'Austin, Texas', number:'02',
    tagline:'HILLS. SKYLINE. FULL THRUST.', description:'Climb green Texas hills and dive through city bends beneath the skyline.',
    controls:[[0,3,0],[0,5,130],[70,14,260],[210,26,290],[350,38,220],[440,41,110],[570,30,145],[640,14,320],[550,10,440],[370,17,485],[190,28,480],[95,37,610],[150,45,750],[320,32,830],[500,19,795],[685,17,850],[780,32,1000],[690,49,1150],[510,54,1175],[365,40,1080],[205,29,1165],[210,22,1340],[360,27,1440],[560,33,1455]],
    seed:75231,
    theme:{skyTop:'#3e8eb8',skyBottom:'#e1e9cb',fog:'#b1c8b1',groundHue:.24,groundSaturation:.34,groundLightness:.23,sunColor:'#fff2ce',sunIntensity:2.8,hemisphereGround:'#789262',accent:'#bbd67a'},
    obstacles:[[.035,'car',-3],[.075,'barrier',0],[.118,'pothole',2],[.215,'bus',-3],[.25,'car',3],[.285,'barrier',0],[.395,'car',-2],[.43,'pothole',3],[.465,'bus',0],[.575,'barrier',0],[.61,'car',-3],[.645,'pothole',2.5],[.755,'bus',2.5],[.79,'barrier',0],[.825,'car',-3],[.935,'pothole',1.5],[.96,'car',3],[.982,'barrier',0]],
    ramps:[[.16,-1.5],[.34,2],[.52,0],[.70,-2],[.88,1.5]]
  },
  {
    id:'miami', name:'Miami Coastal Run', city:'Miami, Florida', number:'03',
    tagline:'PALMS. OCEAN. OPEN ROAD.', description:'Race a turquoise coastline past palms and pastel Art Deco blocks.',
    controls:[[0,4,0],[0,4,180],[20,5,370],[40,5,560],[110,6,710],[260,7,720],[360,8,595],[340,9,445],[435,10,330],[570,9,355],[660,8,500],[610,7,650],[470,8,810],[380,10,965],[440,11,1120],[600,11,1165],[750,10,1080],[820,9,915],[900,10,850],[970,12,1000],[930,11,1200],[780,10,1355],[570,9,1415],[350,9,1445]],
    seed:92117,
    theme:{skyTop:'#43b9df',skyBottom:'#e1f0d7',fog:'#b4e5df',groundHue:.12,groundSaturation:.31,groundLightness:.48,sunColor:'#fff8de',sunIntensity:2.6,hemisphereGround:'#a8d7cb',accent:'#6ce6d3'},
    obstacles:[[.038,'barrier',0],[.078,'car',3],[.118,'bus',-2],[.22,'pothole',2.5],[.255,'car',-3],[.29,'barrier',0],[.40,'bus',2],[.435,'car',-2],[.47,'pothole',3],[.58,'barrier',0],[.615,'bus',-2],[.65,'car',3],[.76,'pothole',-3],[.795,'car',2],[.83,'barrier',0],[.94,'bus',-2],[.962,'pothole',3],[.982,'car',-2]],
    ramps:[[.165,2],[.345,-1.5],[.525,0],[.705,2],[.885,-2]]
  },
  {
    id:'bay-area', name:'Bay Area Skyline', city:'San Francisco Bay Area', number:'04',
    tagline:'CLIMB ABOVE THE BAY.', description:'Sharp hill turns, a waterfront skyline, and a towering red suspension bridge.',
    controls:[[0,5,0],[0,13,150],[70,30,245],[240,47,255],[420,65,260],[555,78,310],[585,80,395],[500,70,450],[300,58,455],[150,52,500],[120,55,595],[210,66,670],[400,82,675],[590,90,700],[650,86,790],[605,72,870],[430,51,905],[250,35,925],[165,25,1030],[200,20,1150],[365,25,1220],[550,32,1195],[720,37,1245],[760,30,1380],[650,20,1480],[450,15,1530]],
    seed:61447,
    theme:{skyTop:'#7babbc',skyBottom:'#e3dfcf',fog:'#c9d6d3',groundHue:.21,groundSaturation:.21,groundLightness:.28,sunColor:'#ffe7bf',sunIntensity:2.65,hemisphereGround:'#8c9a80',accent:'#ff9b73'},
    obstacles:[[.035,'bus',0],[.075,'pothole',-3],[.115,'car',2],[.215,'barrier',0],[.25,'car',-3],[.285,'bus',2],[.395,'pothole',2],[.43,'barrier',0],[.465,'car',-2],[.575,'bus',-2],[.61,'pothole',3],[.645,'barrier',0],[.755,'car',3],[.79,'bus',-2],[.825,'pothole',2],[.935,'barrier',0],[.96,'car',-3],[.982,'bus',2]],
    ramps:[[.16,0],[.34,-2],[.52,2],[.70,0],[.88,-1.5]]
  },
  {
    id:'alpine', name:'Alpine Pass', city:'Alpine mountains', number:'05',
    tagline:'HIGH PASSES. CLEAR AIR.', description:'Climb snowy switchbacks past pine forests, timber chalets, and a stone viaduct.',
    controls:[[0,18,0],[0,24,145],[85,39,265],[260,57,285],[450,74,240],[590,88,310],[620,101,450],[495,113,550],[305,119,545],[135,109,615],[95,93,755],[215,81,850],[405,83,835],[590,96,870],[690,112,1000],[610,126,1150],[425,131,1170],[260,116,1120],[125,99,1220],[180,81,1375],[360,69,1440],[555,62,1465],[690,58,1560]],
    seed:48391,
    theme:{skyTop:'#679fbf',skyBottom:'#e8edf1',fog:'#c3d5df',groundHue:.57,groundSaturation:.10,groundLightness:.64,sunColor:'#fff1db',sunIntensity:2.7,hemisphereGround:'#a9bdc6',accent:'#acd9ef',curbColor:'#628aa3',defaultWeather:'sunrise'},
    obstacles:[[.035,'car',-3],[.075,'barrier',0],[.118,'pothole',2],[.215,'bus',-3],[.25,'car',3],[.285,'barrier',0],[.395,'car',-2],[.43,'pothole',3],[.465,'bus',0],[.575,'barrier',0],[.61,'car',-3],[.645,'pothole',2.5],[.755,'bus',2.5],[.79,'barrier',0],[.825,'car',-3],[.935,'pothole',1.5],[.96,'car',3],[.982,'barrier',0]],
    ramps:[[.16,-1.5],[.34,2],[.52,0],[.70,-2],[.88,1.5]]
  },
  {
    id:'tokyo', name:'Tokyo Night Run', city:'Tokyo, Japan', number:'06',
    tagline:'NEON STREETS. CITY SPEED.', description:'Sweep through a fictional neon district beneath a steel tower and elevated city trains.',
    controls:[[0,5,0],[0,6,180],[70,7,310],[245,8,330],[455,10,315],[595,14,390],[610,19,540],[495,22,645],[280,18,650],[100,12,720],[70,9,875],[205,10,970],[420,15,950],[620,20,975],[735,24,1105],[660,20,1260],[475,13,1325],[280,9,1310],[110,7,1390],[110,8,1545],[255,12,1655],[455,16,1650],[635,18,1585]],
    seed:86719,
    theme:{skyTop:'#648ba5',skyBottom:'#c2c8db',fog:'#8899b3',groundHue:.60,groundSaturation:.12,groundLightness:.24,sunColor:'#f5dcde',sunIntensity:2.6,hemisphereGround:'#4a5568',accent:'#e9a3e1',curbColor:'#bc668e',defaultWeather:'evening'},
    obstacles:[[.035,'bus',-2],[.075,'barrier',0],[.118,'car',3],[.215,'car',-3],[.25,'pothole',2],[.285,'barrier',0],[.395,'bus',2],[.43,'car',-3],[.465,'pothole',1],[.575,'barrier',0],[.61,'bus',-2],[.645,'car',3],[.755,'pothole',-2],[.79,'barrier',0],[.825,'car',2],[.935,'bus',-2],[.96,'car',3],[.982,'barrier',0]],
    ramps:[[.16,1.5],[.34,-2],[.52,0],[.70,2],[.88,-1.5]]
  }
];

export function getTrack(id){return TRACKS.find(track=>track.id===id)||TRACKS[0];}
