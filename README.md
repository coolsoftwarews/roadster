# Roadster Run

A self-contained 3D browser game: four selectable circuits, 18–30 obstacles per track, jump-and-roll thrusters, reactive driving audio and persistent personal bests for each circuit and difficulty.

Run `npm start`, then open http://127.0.0.1:4183. Run `npm test` for gameplay checks. No installation or build step is required. Three.js is vendored under dist/vendor.

Controls: WASD / arrows drive, Space thrusts and rolls, R recovers to a checkpoint, Esc pauses, M toggles sound. Touch controls appear on touch devices. Sound starts with the Start button.

The arcade aero grip follows the track heading while the player controls lateral position and speed, including during jumps. Clear obstacles and land for 100 points each, once per obstacle. The timer has no deadline. Recovery preserves elapsed time and cleared obstacles; restarting resets the run. Personal bests stay in this browser using localStorage.

Visuals and sound are generated in the browser. This is a stylized playable interpretation of the concept artwork, not a vehicle simulation.

## Ramp flights and landing thrust

Each circuit has five ramps that launch automatically. After every jump, press Space again when THRUST NOW appears during descent to fire braking thrusters. The landing reserve is independent of launch recharge. An unprotected ground impact explodes the car; R or Retry checkpoint recovers with earned points intact. Safe ramp landings award 150 points once per ramp; cleared obstacles award 100. Keyboard and touch use the same thrust action.

Graphics include procedural asphalt, sandstone strata, car reflections and wheel details, tire smoke/skid marks, thrust plumes, landing dust and pooled explosion effects. Audio is synthesized locally with separate motor, wind, road, tire and impact layers.

## Driver identity and sharing

Enter an optional driver name or URL (255 characters maximum) before racing. The identity and last completed result persist in this browser. Results show the full identity and a downloadable 1200×675 PNG share card, including roadster.coolsoftware.io at the bottom. Post to X opens a prefilled composer with track name, score, time and the game URL; save the image card and attach it manually in X. Long names are shortened only in the prefilled post to fit, never on the saved card. This does not connect or change DNS for the printed custom domain.

## Four circuits

Select a track before starting, or use Choose another track from the pause screen. The last selected track is remembered in this browser. Direct links use `?track=canyon`, `?track=austin`, `?track=miami`, or `?track=bay-area`.

- **Canyon Circuit:** the original sandstone course.
- **Austin Hill Country:** green hills, city skyline, and changing elevation.
- **Miami Coastal Run:** palms, turquoise water, pastel buildings, and coastal straights.
- **Bay Area Skyline:** hill turns, waterfront towers, and a red suspension bridge.

These are fictional city-inspired race circuits, not real Robotaxi service routes. Each uses a separate road shape and obstacle/ramp layout. Scoring and landing-thrust rules are shared.

Personal best score and time are saved separately for each track and difficulty. Existing single-track records and results migrate to Canyon. Saved results, X posts, and downloaded cards identify the completed circuit; driver identity is shared across tracks. All storage remains local to the browser.

## Difficulty

Choose Easy, Medium, or Hard before racing. The chosen mode is remembered locally and can be linked with `?difficulty=hard` (also works with `track`). Easy retains the original game.

| Mode | Obstacles | Top speed | Launch recharge | Landing cue starts | Checkpoints |
| --- | --- | --- | --- | --- | --- |
| Easy | 18 | 263 km/h | 2.1 s | 62% of flight | 400 m |
| Medium | 24 | 288 km/h | 2.8 s | 72% of flight | 600 m |
| Hard | 30 | 313 km/h | 3.6 s | 80% of flight | 800 m |

All modes keep five ramps and the same scoring. Added hazards avoid ramp approaches/landing zones. Higher modes require later, more precise landing burns. Old records and saved results belong to Easy; X posts and cards identify the mode.

## Road-trip radio

Open RADIO or Tune the road-trip radio, choose Rock, Country, Rap, or Love songs, then Play. The volume slider is independent of driving sounds (M). Station, volume, and on/off preference are saved locally; first visit starts off. After a reload, Start or Play can resume an enabled station. Opening the mixer during a race pauses the run; resume when ready. Hidden tabs unload their live stream, and returning resumes only an enabled radio.

Live music is delivered by 181.FM: Rock40, Highway181, The Beat, and The Heart. Official stream URLs are documented at https://www.181.fm/links and in `dist/radio.js`. Music is streamed directly, requires an internet connection, and is not bundled in this repository. Playlists and advertisements are controlled by the station. Connection errors offer an explicit retry or station switch, with an Open station link.
