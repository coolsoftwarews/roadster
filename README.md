# Roadster Run

A self-contained 3D browser game: one 3.3 km canyon track, 18 obstacles, jump-and-roll thrusters, reactive driving audio and persistent personal bests.

Run `npm start`, then open http://127.0.0.1:4183. Run `npm test` for gameplay checks. No installation or build step is required. Three.js is vendored under dist/vendor.

Controls: WASD / arrows drive, Space thrusts and rolls, R recovers to a checkpoint, Esc pauses, M toggles sound. Touch controls appear on touch devices. Sound starts with the Start button.

The arcade aero grip follows the track heading while the player controls lateral position and speed, including during jumps. Clear obstacles and land for 100 points each, once per obstacle. The timer has no deadline. Recovery preserves elapsed time and cleared obstacles; restarting resets the run. Personal bests stay in this browser using localStorage.

Visuals and sound are generated in the browser. This is a stylized playable interpretation of the concept artwork, not a vehicle simulation.
