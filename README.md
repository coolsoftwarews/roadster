# Roadster Run

A self-contained 3D browser game: six selectable circuits, 18–30 obstacles per track, jump-and-roll thrusters, selectable weather, reactive driving audio and persistent personal bests for each circuit and difficulty.

Run `npm start`, then open http://127.0.0.1:4183. Run `npm test` for gameplay checks. No installation or build step is required. Three.js is vendored under dist/vendor.

Controls: WASD / arrows drive, Space thrusts and rolls, R recovers to a checkpoint, Esc / P pauses, M toggles sound effects, C switches chase/cockpit cameras, and V skips a Money Shot. On-screen steering, thrust, brake and gas buttons appear only on devices with a primary touch pointer. Thrust sits beside steering on the left so the right thumb can stay on the gas. Desktop gameplay keeps the bottom of the view clear. A centered control guide appears before a new race; Start Race begins the clock and enables sound. “Don’t show this guide again” saves a browser preference and starts future races directly. The ? button always reopens the guide, where that preference can be changed. The guide and pause menu share one keyboard-binding list; touch tips appear only on touch devices. The speaker button opens individual effect volumes. A brief THRUST NOW text cue and warning sound indicate the landing window; flight and recharge progress cards are removed.

The camera button switches between the original chase view and a driver's-seat view with a procedural dashboard, steering wheel and instruments. The cockpit follows the car through turns and jumps; the selected view is remembered locally. Crashes pull back to show the explosion. The home screen always uses its cinematic camera.

The arcade aero grip follows the track heading while the player controls lateral position and speed, including during jumps. Clearing an obstacle and landing safely earns 100 points once per obstacle; safe ramp landings earn 150 points once per ramp. The timer has no deadline. Recovery preserves elapsed time and cleared obstacles; restarting resets the run. Personal bests stay in this browser using localStorage. A visible side map shows the route, completed section, current position, ramps, finish and remaining distance; it replaces the separate progress bar.

The detailed Roadster model is bundled locally; scenery, visual effects and driving sounds are generated in the browser. This remains an arcade driving game with city-inspired scenery.

## Detailed car and scenery

The car uses **Tesla Roadster 2020 by metarex.4d**, licensed under CC BY 4.0. Credits, source and license links appear in `dist/credits.html` and `dist/assets/models/ATTRIBUTION.md`. Adaptations include optimized geometry/textures, silver paint, reflective glass, animated steering and rolling wheels, brake lights, and fictional thrusters. The original supplied download is not changed.

Desktop loads a 7.48 MB model with the original painted body and main glass surfaces preserved. Touch devices, narrow screens and devices reporting 4 GB or less memory use a 5.47 MB version with conservative geometry reduction and smaller textures. Both retain full-precision normals. The cinematic preview displays loading progress until the detailed model is ready, then enables racing. Completed, validated model downloads are saved in a versioned browser cache and reused across visits and track changes when local storage is available. A download can continue for up to ten minutes while data keeps arriving; only 45 seconds without new data triggers the inactivity timeout. Connection failures stop with an explicit Retry button instead of starting downloads of different models. Invalid assets or decoder failures can try the lighter model and a 12.9 MB compatibility model with desktop geometry and PNG/JPEG textures, without Meshopt/WebAssembly requirements. The old procedural car is never displayed. The asset recipes and validation reports are in `tools/model-optimization/`.

Tracks include textured asphalt and terrain, detailed building facades, reflective windows, roof details, smoother trees, animated coastal water, guardrails, streetlights and roadside shrubs. Alpine adds snowy peaks, evergreen forests, chalet balconies and a stone viaduct. Tokyo adds neon signs, a lattice observation tower and an elevated railway with a commuter train. Shared geometry and instancing limit draw calls; windows, lamps and signs respond to the selected lighting. The original four course layouts, steering, thrust timing and scoring are unchanged.

## Ramp flights and landing thrust

Each circuit has five ramps that launch automatically. After every jump, press Space again when THRUST NOW appears during descent to fire braking thrusters. The landing reserve is independent of launch recharge. An unprotected ground impact explodes the car; R or Retry checkpoint recovers with earned points intact. Safe ramp landings award 150 points once per ramp; cleared obstacles award 100. Keyboard and touch use the same thrust action.

Graphics include procedural asphalt, sandstone strata, car reflections and wheel details, tire smoke/skid marks, thrust plumes, landing dust and pooled explosion effects. Audio is synthesized locally with separate motor, wind, road, tire and impact layers.

## Money Shots

Occasional thrust jumps and ramp flights trigger a two-second cinematic of the actual detailed 3D car. Front, rear, side, low and overhead cameras show the stunt at 0.22× simulation speed. The normal chase or cockpit camera returns before the landing cue; steering, gas and landing thrust remain available. Press V to skip a shot; C keeps its separate camera-switching action. On touch devices, tap the camera button to return to driving. Enable or disable Money Shots in the pre-race guide or reopen it with ?. The preference is saved locally, and the default is off when the browser requests reduced motion.

The results screen can turn the latest captured Money Shot into a downloadable animated GIF. It records the actual game view at 12 fps in a 640×360 scene, with a driver and results footer added below it; the final height grows to fit the full driver identity. Clips stay in memory for the current run only and are cleared when a new race begins or the page reloads. Download the GIF and attach it to a post manually.

## Driver identity and sharing

Enter an optional driver identity in the Driver field (255 characters maximum) before racing. The identity and last completed result persist in this browser. Results show the full identity and a share-card preview with launch artwork, circuit details, score, time and roadster.coolsoftware.io. Choose a wide 2400×1350 or square 1600×1600 card. Downloads default to a smaller JPEG, with lossless PNG available in File type. Copy Image uses PNG where the browser supports clipboard images. The preview updates with the selected layout, and the export panel shows its dimensions, file type and file size.

Post to X opens a prefilled composer with track name, score, time and the game URL. Download or copy the image card and attach or paste it manually in X. Long names may be shortened in the prefilled post and sanitized download filename; the saved card retains the full identity. This does not connect or change DNS for the printed custom domain.

## Social link previews

Open Graph and X large-image card tags are included directly in `dist/index.html`, so crawlers do not need JavaScript. They use the public URL https://roadster.coolsoftware.io/ and the bundled launch artwork at `/assets/roadster-launch.png`. Deploy the entire `dist` directory to the custom domain, including `assets` and `robots.txt`. The image URL must return a public `200 image/png` response, not an HTML fallback or sign-in page. Link previews use this shared artwork; personal result cards remain downloadable JPEGs or PNGs for manual attachment.

## Six circuits

Select a track before starting, or use Choose track / difficulty from the pause screen. The last selected track is remembered in this browser. Direct links use `?track=canyon`, `?track=austin`, `?track=miami`, `?track=bay-area`, `?track=alpine`, or `?track=tokyo`.

- **Canyon Circuit:** the original sandstone course.
- **Austin Hill Country:** green hills, city skyline, and changing elevation.
- **Miami Coastal Run:** palms, turquoise water, pastel buildings, and coastal straights.
- **Bay Area Skyline:** hill turns, waterfront towers, and a red suspension bridge.
- **Alpine Pass:** 3.8 km of mountain switchbacks, snowy forests, chalets and a stone viaduct.
- **Tokyo Night Run:** 4.1 km through a fictional neon city, past an observation tower and elevated trains.

These are fictional city-inspired race circuits, not real Robotaxi service routes. Each uses a separate road shape and obstacle/ramp layout. Scoring and landing-thrust rules are shared.

Personal best score and time are saved separately for each track and difficulty. Existing single-track records and results migrate to Canyon. Saved results, X posts, and downloaded cards identify the completed circuit; driver identity is shared across tracks. All storage remains local to the browser.

## Difficulty

Choose Easy, Medium, or Hard before racing. The chosen mode is remembered locally and can be linked with `?difficulty=hard` (also works with `track`). Easy uses the original traffic layout.

| Mode | Obstacles | Top speed | Launch recharge | Landing cue starts | Checkpoints |
| --- | --- | --- | --- | --- | --- |
| Easy | 18 | 263 km/h | 2.1 s | 62% of flight | 400 m |
| Medium | 24 | 288 km/h | 2.1 s | 62% of flight | 600 m |
| Hard | 30 | 313 km/h | 2.1 s | 62% of flight | 800 m |

All modes keep five ramps and the same scoring. Added hazards avoid ramp approaches/landing zones. Thrust responds immediately when charged, with the same recharge and landing window on every mode; traffic, speed, and checkpoint spacing provide the difficulty. Old records and saved results belong to Easy; X posts and cards identify the mode.

## Time and weather

Before racing, choose **Auto, Daylight, Rainy, Evening, Sunrise, or Sundown**. The selection is remembered in this browser and can be linked with `?weather=rainy` (alongside track and difficulty). Manual choices apply immediately to the cinematic preview and carry into the race.

Auto selects simulated conditions for each new drive, with an 18% chance of rain. Otherwise the original four circuits follow the browser's local hour: sunrise from 05:00–07:59, daylight from 08:00–15:59, sundown from 16:00–18:59 and evening at other times. Tokyo normally chooses evening and Alpine normally chooses sunrise, with the same rain chance. These are simulated conditions, not a live forecast; no location permission is requested.

Atmosphere changes the sky, fog, sunlight, reflections, road finish, headlights and scenery lighting. Rain adds a fixed pool of animated streaks and a wet road appearance. Pausing the race freezes the rain. Weather does not change driving physics or obstacle layouts.

## Road-trip radio

Open RADIO in the top bar, choose Rock, Country, Rap, or Love songs, then Play. The volume slider is independent of driving sounds (M). Station, volume, and on/off preference are saved locally; first visit starts off. After a reload, Start Race or Play can resume an enabled station. Opening the mixer during a race pauses the run; resume when ready. Hidden tabs unload their live stream, and returning resumes only an enabled radio.

Live music is delivered by 181.FM: Rock40, Highway181, The Beat, and The Heart. Official stream URLs are documented at https://www.181.fm/links and in `dist/radio.js`. Music is streamed directly, requires an internet connection, and is not bundled in this repository. Playlists and advertisements are controlled by the station. Connection errors offer an explicit retry or station switch, with an Open station link.

## Cinematic home page

The home screen uses a live 3D cinematic view of the detailed Roadster in the selected circuit, with a slow orbit, subtle movement and visible thrusters. Pause Intro stops the camera orbit; reduced-motion preferences start it paused. This is rendered in the game scene rather than downloading a video. Track, difficulty, driver and weather selectors remain available beside the preview. Detailed driving instructions appear in the centered pre-race guide instead of the home page, and the Follow me on X link remains at the bottom left: https://x.com/coolsoftware_ws.

The earlier generated launch art remains bundled at `dist/assets/roadster-launch.png` for result cards and social link previews; generation details are in `docs/launch-art.md`.

## Collisions and sound controls

Contact with cars, buses, barriers, or potholes explodes the car, including hazards already cleared on an earlier attempt. The collision ends movement immediately, discards pending jump awards, and preserves earned score and elapsed time. Retry returns to a checkpoint. Jumping cleanly over an obstacle still awards points after a safe landing.

Open the speaker button in the top bar for Engine, Tires, Thrusters, and Impacts & alerts sliders. A volume of zero mutes that category; the main toggle or M mutes all effects without changing the chosen levels. Defaults are 55%, 75%, 85%, and 75%, with quieter road/wind layers. Settings are saved in this browser and apply to active sounds. Radio volume remains independent. Opening either mixer during a run pauses it.
