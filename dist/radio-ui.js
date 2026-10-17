import {RoadTripRadio,STATIONS} from './radio.js?v=radio-1';

export function setupRadio({onOpen=()=>{}}={}){
  const $=id=>document.getElementById(id),panel=$('radio-panel'),toggle=$('radio-toggle');
  function render(state){
    const station=STATIONS.find(item=>item.id===state.stationId)||STATIONS[0];
    $('radio-station').value=state.stationId;
    $('radio-volume').value=Math.round(state.volume*100);
    $('radio-volume-value').textContent=Math.round(state.volume*100)+'%';
    $('radio-volume').setAttribute('aria-valuetext',Math.round(state.volume*100)+' percent');
    const labels={off:'Radio off',connecting:'Tuning in…',playing:station.stationName,buffering:'Buffering…',suspended:'Ready when you are',error:'Station unavailable — try again or change station'};
    $('radio-status').textContent=state.error||labels[state.status]||'Radio off';
    const playing=!state.error&&['connecting','playing','buffering'].includes(state.status);
    $('radio-play').textContent=playing?'STOP RADIO ■':state.error?'RETRY RADIO ↻':'PLAY RADIO ▶';
    $('radio-play').setAttribute('aria-pressed',String(playing));
    $('radio-indicator').className=state.status==='playing'?'on':state.status==='error'?'error':'';
    toggle.classList.toggle('on',state.status==='playing');
    toggle.setAttribute('aria-label',state.status==='playing'?'Radio: '+station.name:'Open road-trip radio');
    $('radio-provider').href=station.page;
  }
  const radio=new RoadTripRadio({onChange:render});render(radio.state);
  function close(){panel.classList.add('hidden');toggle.setAttribute('aria-expanded','false');}
  function open(){onOpen();panel.classList.remove('hidden');toggle.setAttribute('aria-expanded','true');$('radio-station').focus();}
  toggle.addEventListener('click',()=>panel.classList.contains('hidden')?open():close());
  $('radio-close').addEventListener('click',()=>{close();toggle.focus();});
  $('radio-station').addEventListener('change',event=>radio.selectStation(event.target.value));
  $('radio-volume').addEventListener('input',event=>radio.setVolume(Number(event.target.value)/100));
  $('radio-play').addEventListener('click',()=>!radio.state.error&&['playing','connecting','buffering'].includes(radio.state.status)?radio.stop():radio.play());
  panel.addEventListener('keydown',event=>{if(event.code==='Escape'){event.preventDefault();event.stopPropagation();close();toggle.focus();}});
  document.addEventListener('pointerdown',event=>{if(!panel.classList.contains('hidden')&&!panel.contains(event.target)&&!toggle.contains(event.target))close();});
  document.addEventListener('visibilitychange',()=>document.hidden?radio.suspend():radio.resume());
  window.addEventListener('pagehide',event=>event.persisted?radio.suspend():radio.destroy());
  window.addEventListener('pageshow',event=>{if(event.persisted&&!document.hidden)radio.resume();});
  return {radio,close};
}
