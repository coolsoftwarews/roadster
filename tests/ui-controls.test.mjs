import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTROL_BINDINGS,DRIVING_KEYS,actionForKey,createGuidePreference,GUIDE_STORAGE_KEY,crashPresentation} from '../dist/ui-controls.js';

test('camera and stunt skip are distinct bindings, with no duplicate key codes',()=>{
  const codes=CONTROL_BINDINGS.flatMap(binding=>binding.codes);
  assert.equal(new Set(codes).size,codes.length);
  assert.equal(actionForKey('KeyC'),'camera');
  assert.equal(actionForKey('KeyV'),'skip');
  assert.equal(actionForKey('Escape'),'pause');
  assert.equal(actionForKey('KeyM'),'mute');
  assert.equal(DRIVING_KEYS.KeyA,'left');
  assert.equal(DRIVING_KEYS.ArrowRight,'right');
  assert.equal(actionForKey('KeyQ'),undefined);
});
test('guide opt-out persists and remains usable when storage is unavailable',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const preference=createGuidePreference(storage);
  assert.equal(preference.skipped,false);
  preference.setSkipped(true);
  assert.equal(values.get(GUIDE_STORAGE_KEY),'true');
  assert.equal(createGuidePreference(storage).skipped,true);
  preference.setSkipped(false);
  assert.equal(createGuidePreference(storage).skipped,false);
  const blocked=createGuidePreference({getItem(){throw Error();},setItem(){throw Error();}});
  blocked.setSkipped(true);
  assert.equal(blocked.skipped,true);
});
test('crash guidance describes the actual obstacle and reserves landing advice for landings',()=>{
  for(const obstacle of ['car','bus','barrier','pothole']){
    const copy=crashPresentation({reason:'collision',obstacle});
    assert.equal(copy.reason,obstacle.toUpperCase()+' IMPACT');
    assert.ok(copy.description.includes('a '+obstacle));
    assert.doesNotMatch(copy.hint,/landing/i);
  }
  assert.match(crashPresentation({reason:'landing'}).description,/descent/);
  assert.match(crashPresentation({reason:'landing'}).hint,/Space/);
  assert.match(crashPresentation({reason:'collision',obstacle:'unknown'}).description,/an obstacle/);
});
