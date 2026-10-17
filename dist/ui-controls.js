// One binding table powers input handling and both control guides.
export const CONTROL_BINDINGS = Object.freeze([
  { action:'gas', codes:['KeyW','ArrowUp'], keys:['W','↑'], label:'Accelerate', driving:true },
  { action:'brake', codes:['KeyS','ArrowDown'], keys:['S','↓'], label:'Brake', driving:true },
  { action:'left', codes:['KeyA','ArrowLeft'], keys:['A','←'], label:'Steer left', driving:true },
  { action:'right', codes:['KeyD','ArrowRight'], keys:['D','→'], label:'Steer right', driving:true },
  { action:'thrust', codes:['Space'], keys:['Space'], label:'Launch / land' },
  { action:'camera', codes:['KeyC'], keys:['C'], label:'Chase / cockpit' },
  { action:'recover', codes:['KeyR'], keys:['R'], label:'Recover car' },
  { action:'mute', codes:['KeyM'], keys:['M'], label:'Mute effects' },
  { action:'pause', codes:['Escape','KeyP'], keys:['Esc','P'], label:'Pause / resume' },
  { action:'skip', codes:['KeyV'], keys:['V'], label:'Skip Money Shot' }
].map(binding => Object.freeze(binding)));

export const actionForKey = code => CONTROL_BINDINGS.find(binding => binding.codes.includes(code))?.action;
export const DRIVING_KEYS = Object.freeze(Object.fromEntries(CONTROL_BINDINGS.filter(binding => binding.driving).flatMap(binding => binding.codes.map(code => [code,binding.action]))));
export const GUIDE_STORAGE_KEY = 'roadster-run-skip-guide';

export function createGuidePreference(storage) {
  let skipped = false;
  try { skipped = storage?.getItem(GUIDE_STORAGE_KEY) === 'true'; } catch {}
  return {
    get skipped() { return skipped; },
    setSkipped(value) {
      skipped = Boolean(value);
      try { storage?.setItem(GUIDE_STORAGE_KEY,String(skipped)); } catch {}
    }
  };
}

export function crashPresentation(event) {
  if (event.reason !== 'collision') return {
    reason:'LANDING THRUST MISSED', emphasis:'LANDING.',
    description:'Your landing needed a braking thrust. Tap Space again when THRUST NOW appears during descent.',
    hint:'Space · Launch, then press again on descent'
  };
  const obstacles = {car:'a car',bus:'a bus',barrier:'a barrier',pothole:'a pothole'};
  const obstacle = obstacles[event.obstacle] || 'an obstacle';
  return {
    reason:(obstacles[event.obstacle] ? event.obstacle.toUpperCase() : 'OBSTACLE')+' IMPACT', emphasis:'IMPACT.',
    description:`You hit ${obstacle}. Jump over it with Space or steer around it.`,
    hint:'R · Retry checkpoint'
  };
}
