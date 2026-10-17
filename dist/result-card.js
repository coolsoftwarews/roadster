import { formatTime } from './game-logic.js?v=radio-1';
import { getTrack } from './tracks.js?v=cinematic-1';
import { getDifficulty } from './difficulty.js?v=radio-1';

const FONT = 'Arial, Helvetica, sans-serif';
const INK = '#fff5e7';
const MUTED = '#b7c4ce';
const ORANGE = '#ff8656';

/** Wrap at grapheme boundaries, preserving long URLs and joined emoji in full. */
export function wrapCardText(context, text, width) {
  const segmenter = typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    const characters = segmenter
      ? Array.from(segmenter.segment(paragraph), item => item.segment)
      : Array.from(paragraph);
    let line = '';
    for (const character of characters) {
      if (line && context.measureText(line + character).width > width) {
        const space = line.lastIndexOf(' ');
        if (space > line.length * .45) {
          lines.push(line.slice(0, space + 1));
          line = line.slice(space + 1);
        } else {
          lines.push(line);
          line = '';
        }
      }
      line += character;
    }
    lines.push(line);
  }
  return lines;
}

/** Find a legible size for every character; no clipping or ellipsis. */
export function layoutCardDriver(context, driver, width = 1040, height = 126) {
  let size = 36;
  let lines;
  do {
    context.font = `600 ${size}px ${FONT}`;
    lines = wrapCardText(context, driver, width);
    if (lines.length * size * 1.25 <= height) break;
    size -= 1;
  } while (size > 8);
  return { lines, size, lineHeight: size * 1.25 };
}

function rounded(context, x, y, width, height, radius, color) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
  context.fillStyle = color;
  context.fill();
}

function label(context, text, x, y, color = MUTED, size = 12) {
  context.font = `700 ${size}px ${FONT}`;
  context.fillStyle = color;
  context.fillText(text, x, y);
}

function cityArt(context, trackId) {
  const building=(x,y,width,height,color)=>{
    context.fillStyle=color;context.fillRect(x,y,width,height);
    context.fillStyle='#d2eced55';
    for(let wx=x+7;wx<x+width-4;wx+=12)for(let wy=y+10;wy<y+height-4;wy+=16)context.fillRect(wx,wy,4,5);
  };
  if(trackId==='austin'){
    // Limestone hills, the downtown skyline, and the Capitol dome.
    context.fillStyle='#3c6051';context.beginPath();context.moveTo(776,259);
    context.bezierCurveTo(859,160,888,213,950,191);context.bezierCurveTo(1062,137,1112,244,1174,185);
    context.lineTo(1174,382);context.lineTo(776,382);context.fill();
    building(812,143,35,104,'#49676b');building(855,115,25,127,'#506e72');
    building(886,158,39,91,'#3e5961');building(1118,161,29,97,'#566e68');
    context.fillStyle='#caac89';context.fillRect(1094,186,54,26);context.fillRect(1113,165,16,24);
    context.beginPath();context.arc(1121,165,12,Math.PI,0);context.fill();
  }else if(trackId==='miami'){
    // Biscayne-blue water, pastel Art Deco blocks, and palms.
    context.fillStyle='#286a79';context.fillRect(776,201,398,181);
    context.strokeStyle='#7ed9d04d';context.lineWidth=2;
    for(let y=218;y<380;y+=19){context.beginPath();context.moveTo(776,y);context.lineTo(1174,y-6);context.stroke();}
    building(792,158,42,92,'#a07c88');building(841,134,42,115,'#67a8aa');building(889,170,35,78,'#c5aa86');
    context.fillStyle='#dfb5a0';context.fillRect(849,125,26,10);
    for(const [x,y] of [[1134,223],[810,296]]){
      context.strokeStyle='#aa9d7f';context.lineWidth=6;context.beginPath();context.moveTo(x,y+51);context.quadraticCurveTo(x-10,y+15,x,y);context.stroke();
      context.strokeStyle='#6ba994';context.lineWidth=8;
      for(const offset of [-28,-15,15,28]){context.beginPath();context.moveTo(x,y);context.quadraticCurveTo(x+offset/2,y-17,x+offset,y+(Math.abs(offset)===28?8:-5));context.stroke();}
    }
  }else if(trackId==='alpine'){
    // Layered snow peaks and evergreen silhouettes echo the mountain circuit.
    const peak=(x,y,width,height)=>{
      context.fillStyle='#627d8e';context.beginPath();context.moveTo(x-width/2,y+height);context.lineTo(x,y);context.lineTo(x+width/2,y+height);context.closePath();context.fill();
      context.fillStyle='#dcecf1';context.beginPath();context.moveTo(x,y);context.lineTo(x+width*.2,y+height*.4);context.lineTo(x+width*.065,y+height*.31);context.lineTo(x-width*.015,y+height*.42);context.lineTo(x-width*.09,y+height*.32);context.lineTo(x-width*.2,y+height*.4);context.closePath();context.fill();
    };
    peak(816,136,185,155);peak(909,84,220,226);peak(1112,116,224,194);
    context.fillStyle='#9cafb6';context.beginPath();context.moveTo(776,301);context.quadraticCurveTo(893,246,1004,288);context.quadraticCurveTo(1113,276,1174,248);context.lineTo(1174,382);context.lineTo(776,382);context.closePath();context.fill();
    for(const [x,y,size]of [[794,269,1],[820,286,.8],[850,257,.75],[1118,268,.9],[1141,255,1.15],[1166,296,.9]]){
      context.fillStyle='#536e66';context.fillRect(x-2,y,4,45*size);
      for(let tier=0;tier<3;tier++){const top=y-24*size+tier*12*size,width=(12+tier*4)*size;context.fillStyle='#315b52';context.beginPath();context.moveTo(x,top);context.lineTo(x-width,top+26*size);context.lineTo(x+width,top+26*size);context.closePath();context.fill();context.fillStyle='#dce8e8';context.beginPath();context.moveTo(x,top);context.lineTo(x-width*.58,top+15*size);context.lineTo(x+width*.58,top+15*size);context.closePath();context.fill();}
    }
  }else if(trackId==='tokyo'){
    // Neon blocks and the illuminated observation tower keep Tokyo distinct.
    context.fillStyle='#28354f';context.fillRect(776,238,398,144);
    building(788,181,34,123,'#42506c');building(874,162,30,133,'#414b68');building(1100,139,30,159,'#56617c');building(1139,172,30,125,'#3c4b67');
    for(const [x,y,w,h,color]of [[797,196,12,65,'#ee82ca'],[885,177,10,42,'#7bdeed'],[1108,154,13,63,'#d893d8'],[1147,185,12,52,'#83dce5']]){context.fillStyle=color;context.fillRect(x,y,w,h);context.fillStyle='#202e4b';for(let line=y+6;line<y+h-5;line+=10)context.fillRect(x+3,line,w-6,3);}
    context.strokeStyle='#eea4c4';context.lineWidth=3;context.beginPath();context.moveTo(820,286);context.lineTo(848,112);context.lineTo(876,286);context.stroke();
    context.strokeStyle='#86d8ed';context.lineWidth=2;
    for(let y=148;y<276;y+=24){const width=(y-112)*.16;context.beginPath();context.moveTo(848-width,y);context.lineTo(848+width,y);context.lineTo(848-(y+24-112)*.16,y+24);context.stroke();}
    context.fillStyle='#ee94bc';context.fillRect(830,206,36,5);context.fillStyle='#9cdef1';context.fillRect(833,211,30,8);context.fillStyle='#fff0d3';context.fillRect(847,99,2,17);
    context.fillStyle='#65758c';context.fillRect(1078,277,96,6);for(const x of [1090,1128,1166])context.fillRect(x,283,4,54);
    context.fillStyle='#c4d9df';context.fillRect(1094,266,67,10);context.fillStyle='#70cedc';for(let x=1098;x<1158;x+=11)context.fillRect(x,268,7,4);
  }else{
    // Fog-softened hills and a red suspension bridge across the bay.
    context.fillStyle='#456372';context.fillRect(776,212,398,170);
    context.fillStyle='#5d726d';context.beginPath();context.moveTo(776,232);context.lineTo(825,162);context.lineTo(880,205);context.lineTo(934,187);context.lineTo(998,236);context.closePath();context.fill();
    building(1099,143,28,112,'#627c87');building(1134,171,24,84,'#849196');
    context.strokeStyle='#d67860';context.lineWidth=5;
    context.beginPath();context.moveTo(786,222);context.lineTo(1111,222);context.stroke();
    for(const x of [842,1048]){context.fillStyle='#ce7159';context.fillRect(x,125,8,134);context.fillRect(x+21,125,8,134);context.fillRect(x,139,29,5);context.fillRect(x,164,29,5);}
    context.lineWidth=2;context.beginPath();context.moveTo(783,210);context.lineTo(857,126);context.quadraticCurveTo(958,260,1063,126);context.lineTo(1114,198);context.stroke();
    for(let x=880;x<1045;x+=18){const t=(x-857)/206;const y=126+268*t*(1-t);context.beginPath();context.moveTo(x,y);context.lineTo(x,222);context.stroke();}
  }
}

function trackArt(context,track) {
  context.save();
  context.beginPath();
  context.rect(776, 26, 398, 355);
  context.clip();
  const glow = context.createRadialGradient(1040, 112, 0, 1040, 112, 245);
  const accent=track.theme.accent;
  glow.addColorStop(0, accent+'2e');
  glow.addColorStop(1, accent+'00');
  context.fillStyle = glow;
  context.fillRect(776, 26, 398, 355);

  context.fillStyle = track.id==='tokyo'?'#dce8ff':'#ffad68';
  context.beginPath();
  context.arc(1042, 104, track.id==='tokyo'?27:36, 0, Math.PI * 2);
  context.fill();
  const mesa = (x, y, scale, color) => {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 36 * scale, y - 85 * scale);
    context.lineTo(x + 40 * scale, y - 121 * scale);
    context.lineTo(x + 88 * scale, y - 121 * scale);
    context.lineTo(x + 93 * scale, y - 84 * scale);
    context.lineTo(x + 129 * scale, y);
    context.closePath();
    context.fill();
  };
  if(track.id==='canyon'){
    mesa(774, 278, 1.1, '#654434');
    mesa(1084, 210, .85, '#8a5136');
    mesa(940, 181, .4, '#513e36');
  }else cityArt(context,track.id);

  // Sweeping S bend, drawn as layered strokes for curbs and asphalt.
  const road = () => {
    context.beginPath();
    context.moveTo(951, 403);
    context.bezierCurveTo(747, 233, 1160, 300, 1065, 171);
    context.bezierCurveTo(1028, 121, 965, 134, 989, 78);
  };
  context.lineCap = 'butt';
  context.lineJoin = 'round';
  road(); context.strokeStyle = '#030a1155'; context.lineWidth = 90; context.stroke();
  road(); context.strokeStyle = '#d9c9ae'; context.lineWidth = 72; context.stroke();
  context.setLineDash([15, 15]);
  road(); context.strokeStyle = '#ee8152'; context.lineWidth = 72; context.stroke();
  context.setLineDash([]);
  road(); context.strokeStyle = '#27343e'; context.lineWidth = 63; context.stroke();
  context.setLineDash([10, 13]);
  road(); context.strokeStyle = '#f6e2bb88'; context.lineWidth = 2; context.stroke();
  context.setLineDash([]);

  // The Roadster from above, including thruster flare and a visible shadow.
  context.translate(1006, 279);
  context.rotate(.73);
  rounded(context, -25, -41, 56, 98, 13, '#0008');
  const flame = context.createLinearGradient(0, 33, 0, 97);
  flame.addColorStop(0, '#e3fbff');
  flame.addColorStop(.3, '#94e7ff');
  flame.addColorStop(1, '#6abaff00');
  for (const x of [-14, 14]) {
    context.fillStyle = flame;
    context.beginPath();
    context.moveTo(x - 7, 33);
    context.lineTo(x + 7, 33);
    context.lineTo(x, 97);
    context.fill();
  }
  rounded(context, -27, -30, 10, 22, 3, '#091016');
  rounded(context, 17, -30, 10, 22, 3, '#091016');
  rounded(context, -27, 16, 10, 24, 3, '#091016');
  rounded(context, 17, 16, 10, 24, 3, '#091016');
  rounded(context, -22, -45, 44, 89, 11, '#e2e8e4');
  rounded(context, -18, -39, 36, 18, 5, '#fff7e8');
  rounded(context, -16, -15, 32, 36, 7, '#162a39');
  context.fillStyle = '#718f9d';
  context.fillRect(-13, -12, 26, 7);
  rounded(context, -17, 33, 34, 3, 1, ORANGE);
  context.restore();
}

const safeNumber = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const count = value => Math.floor(safeNumber(value));

/** Paint a complete, downloadable 1200 × 675 social result card synchronously. */
export function renderResultCard(canvas, result) {
  const track=getTrack(result.trackId);
  canvas.width = 1200;
  canvas.height = 675;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas drawing is unavailable.');
  context.textBaseline = 'top';
  const background = context.createLinearGradient(0, 0, 1200, 675);
  background.addColorStop(0, '#192833');
  background.addColorStop(1, '#09121c');
  context.fillStyle = background;
  context.fillRect(0, 0, 1200, 675);
  context.strokeStyle = '#e3f0ff05';
  context.lineWidth = 1;
  for (let x = 0; x < 1200; x += 40) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, 675); context.stroke();
  }
  for (let y = 0; y < 675; y += 40) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(1200, y); context.stroke();
  }
  trackArt(context,track);

  context.fillStyle = ORANGE;
  context.fillRect(0, 0, 1200, 5);
  context.font = `italic 900 46px ${FONT}`;
  context.fillStyle = INK;
  context.fillText('R', 60, 38);
  context.fillStyle = ORANGE;
  context.fillText('/', 90, 38);
  label(context, 'ROADSTER RUN', 128, 43, INK, 24);
  label(context, `${track.name.toUpperCase()}  /  ${getDifficulty(result.difficultyId).name.toUpperCase()}`, 130, 76, MUTED, 11);
  rounded(context, 60, 122, 169, 27, 3, '#ff865620');
  label(context, 'CIRCUIT COMPLETE', 72, 130, '#ffb78c', 11);

  label(context, 'TOTAL SCORE', 60, 178);
  context.font = `800 85px ${FONT}`;
  context.fillStyle = INK;
  context.fillText(count(result.score).toLocaleString('en-US'), 55, 197, 330);
  label(context, 'RUN TIME', 416, 178);
  const time = formatTime(safeNumber(result.time));
  context.font = `500 67px ${FONT}`;
  context.fillText(time, 410, 207, 335);

  const metrics = [
    ['OBSTACLES', `${count(result.cleared)} / ${count(result.total)}`],
    ['RAMPS', `${count(result.ramps)} / ${count(result.totalRamps)}`],
    ['SAFE LANDINGS', String(count(result.successfulJumps))]
  ];
  metrics.forEach(([title, value], index) => {
    const x = 60 + index * 238;
    label(context, title, x, 305, MUTED, 10);
    context.font = `500 29px ${FONT}`;
    context.fillStyle = INK;
    context.fillText(value, x, 325);
  });

  context.fillStyle = '#ffffff21';
  context.fillRect(60, 383, 1080, 1);
  rounded(context, 60, 405, 1080, 183, 8, '#ffffff05');
  context.fillStyle = ORANGE;
  context.fillRect(60, 420, 3, 26);
  label(context, 'DRIVER', 80, 423, '#ffb78c', 11);
  const driver = String(result.driver ?? '') || 'Anonymous driver';
  const layout = layoutCardDriver(context, driver);
  context.font = `600 ${layout.size}px ${FONT}`;
  context.fillStyle = INK;
  layout.lines.forEach((line, index) => context.fillText(line, 80, 452 + index * layout.lineHeight));

  label(context, 'YOUR LINE. YOUR PACE. YOUR NEXT RECORD.', 60, 627, MUTED, 11);
  context.textAlign = 'right';
  label(context, 'roadster.coolsoftware.io', 1140, 619, INK, 21);
  context.textAlign = 'left';
  return canvas;
}
