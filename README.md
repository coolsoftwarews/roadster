# Roadster Run

A self-contained 3D browser game: four selectable circuits, 18 obstacles per track, jump-and-roll thrusters, reactive driving audio and persistent personal bests for each circuit.

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

Personal best score and time are saved separately for each track. Existing single-track records and results migrate to Canyon. Saved results, X posts, and downloaded cards identify the completed circuit; driver identity is shared across tracks. All storage remains local to the browser.
