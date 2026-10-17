/** Camera offsets are relative to the car's forward/right directions, in metres. */
export const MONEY_SHOT_ANGLES = Object.freeze({
  front: Object.freeze({ forward: 9, right: 4, height: 2 }),
  rear: Object.freeze({ forward: -9, right: -4, height: 2.8 }),
  side: Object.freeze({ forward: 2, right: 10, height: 1.8 }),
  low: Object.freeze({ forward: 5, right: 8, height: -.9 }),
  top: Object.freeze({ forward: -1, right: 3, height: 12 })
});

const ANGLES = Object.keys(MONEY_SHOT_ANGLES);
const DURATION = 2;
const TIME_SCALE = .22;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

/** A gentle ten-degree orbit, pulled back on narrow screens to keep the whole car in frame. */
export function shotCameraPose(angle, progress, aspect = 16 / 9) {
  const base = MONEY_SHOT_ANGLES[angle] || MONEY_SHOT_ANGLES.front;
  const phase = clamp(finite(progress), 0, 1);
  const yaw = (phase - .5) * Math.PI / 18;
  const scale = Math.max(1, .95 / Math.max(.2, finite(aspect, 16 / 9)));
  return {
    forward: (base.forward * Math.cos(yaw) - base.right * Math.sin(yaw)) * scale,
    right: (base.forward * Math.sin(yaw) + base.right * Math.cos(yaw)) * scale,
    // A low camera stays close to the airborne car rather than moving underground on phones.
    height: base.height < 0 ? base.height : (base.height + Math.sin(phase * Math.PI) * .2) * scale
  };
}

/**
 * Select occasional airborne cinematic shots without changing gameplay itself.
 * Feed real, unscaled frame time into update() and use its timeScale for simulation.
 * started/ended are edge events, emitted once by update().
 */
export class MoneyShotDirector {
  constructor({ random = Math.random, enabled = true } = {}) {
    this.random = typeof random === 'function' ? random : Math.random;
    this.enabled = Boolean(enabled);
    this.reset();
  }

  reset() {
    this.active = false;
    this.angle = null;
    this.kind = null;
    this.elapsed = 0;
    this.cooldown = 0;
    this.misses = 0;
    this.candidate = false;
    this.flightOpen = false;
    this.lastAngle = null;
    this.endedPending = false;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.stop();
  }

  /** Call once for a launch/jump event; a fourth eligible attempt is guaranteed. */
  beginFlight(kind = 'jump') {
    if (this.flightOpen) return this.candidate;
    this.flightOpen = true;
    this.kind = kind;
    if (!this.enabled || this.active || this.cooldown > 0) return false;
    const chance = this.misses >= 3 ? 1 : .35 + this.misses * .2;
    this.candidate = this.sample() < chance;
    this.misses = this.candidate ? 0 : this.misses + 1;
    return this.candidate;
  }

  /** Skip a pending or active shot; the flight cannot start another shot. */
  stop() {
    if (this.active || this.candidate) {
      this.endedPending ||= this.active;
      this.cooldown = 12 + this.sample() * 6;
    }
    this.active = false;
    this.candidate = false;
  }

  update(realDt, run) {
    let started = false;
    const running = run?.state === 'running';
    const airborne = running && Number.isFinite(run.jumpTime) && run.jumpTime >= 0;
    const flightProgress = finite(run?.flightProgress, 1);
    const height = finite(run?.height);
    const landing = Boolean(run?.landingWindow || run?.landingArmed);
    const canContinue = this.enabled && airborne && height > 1.5 && flightProgress < .52 && !landing;

    // A pause or hazard ends the shot before any clock advances.
    if (!canContinue && this.active) this.stop();
    else if (running) {
      const dt = Math.max(0, finite(realDt));
      this.cooldown = Math.max(0, this.cooldown - dt);
      if (this.active) {
        this.elapsed = Math.min(DURATION, this.elapsed + dt);
        if (this.elapsed >= DURATION) this.stop();
      } else if (this.candidate && canContinue && flightProgress >= .08 && flightProgress < .50) {
        const available = ANGLES.filter(angle => angle !== this.lastAngle);
        this.angle = available[Math.floor(this.sample() * available.length)];
        this.lastAngle = this.angle;
        this.elapsed = 0;
        this.active = true;
        this.candidate = false;
        started = true;
      }
    }

    // A candidate waits through early ascent, but never survives into descent or another run.
    if (!airborne || landing || flightProgress >= .50 || !this.enabled) this.candidate = false;
    if (!airborne) this.flightOpen = false;

    const ended = this.endedPending;
    this.endedPending = false;
    return {
      active: this.active,
      timeScale: this.active ? TIME_SCALE : 1,
      angle: this.angle,
      progress: clamp(this.elapsed / DURATION, 0, 1),
      started,
      ended
    };
  }

  sample() {
    // Seeded test generators and defensive callers cannot select an out-of-range camera.
    return clamp(finite(this.random(), .5), 0, 1 - Number.EPSILON);
  }
}
