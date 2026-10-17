// The game pauses while this mixer is open, keeping landing timing safe.
export function setupSoundControls({audio,onOpen=()=>{}}){
  const $=id=>document.getElementById(id),panel=$('sound-panel'),toggle=$('sound');
  const sliders=[...panel.querySelectorAll('[data-sound-channel]')];
  function render(){
    const settings=audio.settings;
    toggle.classList.toggle('muted',!settings.enabled);
    toggle.setAttribute('aria-label',settings.enabled?'Open sound effects':'Open sound effects (muted)');
    $('sound-enabled').setAttribute('aria-pressed',String(settings.enabled));
    $('sound-enabled').textContent=settings.enabled?'SOUND EFFECTS ON':'SOUND EFFECTS OFF';
    for(const slider of sliders){
      const percent=Math.round(settings[slider.dataset.soundChannel]*100);
      slider.value=percent;
      slider.setAttribute('aria-valuetext',percent===0?'Muted':percent+' percent');
      $(slider.id+'-value').textContent=percent===0?'Muted':percent+'%';
    }
  }
  function close(){panel.classList.add('hidden');toggle.setAttribute('aria-expanded','false');}
  function open(){onOpen();render();panel.classList.remove('hidden');toggle.setAttribute('aria-expanded','true');$('sound-enabled').focus();}
  function toggleMute(){audio.toggle();render();}
  toggle.addEventListener('click',()=>panel.classList.contains('hidden')?open():close());
  $('sound-close').addEventListener('click',()=>{close();toggle.focus();});
  $('sound-enabled').addEventListener('click',toggleMute);
  for(const slider of sliders)slider.addEventListener('input',()=>{audio.setVolume(slider.dataset.soundChannel,Number(slider.value)/100);render();});
  panel.addEventListener('keydown',event=>{
    if(event.code==='Escape'){event.preventDefault();event.stopPropagation();close();toggle.focus();}
    else if(event.code==='KeyM'){event.preventDefault();event.stopPropagation();if(!event.repeat)toggleMute();}
  });
  document.addEventListener('pointerdown',event=>{if(!panel.classList.contains('hidden')&&!panel.contains(event.target)&&!toggle.contains(event.target))close();});
  render();return {close,toggleMute};
}
