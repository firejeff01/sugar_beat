const REGIONS = [
  { name: '焦糖街機', scale: [0, 2, 4, 7, 9], root: 60, lead: 'square', bass: 'triangle', cutoff: 2100 },
  { name: '冰晶舞曲', scale: [0, 2, 3, 7, 10], root: 62, lead: 'sine', bass: 'sine', cutoff: 4800 },
  { name: '逆流工業', scale: [0, 1, 3, 5, 7, 8, 10], root: 57, lead: 'sawtooth', bass: 'square', cutoff: 1600 },
  { name: '深淵切分', scale: [0, 2, 3, 5, 7, 9, 10], root: 59, lead: 'triangle', bass: 'sawtooth', cutoff: 2500 },
  { name: '迷城跳拍', scale: [0, 2, 4, 6, 7, 9, 11], root: 65, lead: 'square', bass: 'sine', cutoff: 3300 },
  { name: '漂浮電音', scale: [0, 3, 5, 7, 10], root: 63, lead: 'sawtooth', bass: 'triangle', cutoff: 3000 },
];
const FORMS = ['急速糖粒', '旋轉霓虹', '偷襲節拍', '封路狂想', '巨槌反拍', '裂隙追逐'];
const RHYTHMS = [
  [0, 2, 4, 7, 8, 10, 12, 14], [0, 3, 6, 8, 11, 14],
  [0, 2, 5, 6, 8, 11, 12, 15], [0, 4, 6, 9, 10, 12, 14],
  [0, 1, 4, 6, 8, 9, 12, 15], [0, 3, 4, 7, 9, 11, 12, 14, 15],
];
const MELODIES = [
  [0, 2, 4, 1, 3, 2, 0, 4], [0, 4, 3, 1, 2, 4, 2],
  [0, 1, 4, 2, 1, 3, 4, 0], [4, 2, 0, 3, 1, 2],
  [0, 3, 1, 4, 2, 0, 2], [2, 4, 1, 0, 3, 4, 0, 1, 2],
];
const CHORDS = [[0, 3, 4, 0], [0, 4, 2, 3], [0, 1, 4, 3], [0, 2, 3, 4], [0, 4, 3, 2], [0, 3, 1, 4]];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const midi = note => 440 * 2 ** ((note - 69) / 12);

function buildProfile(region, form) {
  const style = REGIONS[region], mapId = region * 6 + form + 1;
  const motif = [], bass = [], drums = [];
  for (let bar = 0; bar < 8; bar++) {
    const chord = CHORDS[form][Math.floor(bar / 2) % 4];
    const rhythm = [...new Set(RHYTHMS[(form + Math.floor(bar / 2)) % 6].map((step, i) =>
      i === 0 ? 0 : (step + region * (i % 3 === 1 ? 1 : 0) + (bar % 2 ? region % 3 : 0)) % 16))].sort((a, b) => a - b);
    for (let i = 0; i < rhythm.length; i++) {
      const degrees = MELODIES[form];
      const degree = (degrees[(i + bar + region) % degrees.length] + chord + region * (i % 3)) % style.scale.length;
      const octave = (bar === 6 || (form === 4 && i % 4 === 3)) ? 12 : 0;
      motif.push({ step: bar * 16 + rhythm[i], note: style.root + style.scale[degree] + octave,
        steps: Math.min(3 + (form % 2), (rhythm[i + 1] ?? 16) - rhythm[i]), velocity: i % 3 === 0 ? .9 : .64 });
    }
    const bassRhythm = [...new Set([0, 4 + form % 3, 8, (11 + region + bar % (form + 1)) % 16])].sort((a, b) => a - b);
    bassRhythm.forEach((step, i) => bass.push({ step: bar * 16 + step,
      note: style.root - 24 + style.scale[(chord + (i % 2 ? 2 + region % 2 : 0)) % style.scale.length],
      steps: i % 2 ? 2 : 3, velocity: .78 }));
    const kick = [...new Set([0, 8, (5 + form + region + bar % 2) % 16])];
    const snare = [...new Set([4, 12, ...(bar % 2 ? [(13 + form + region * 2) % 16] : [])])];
    kick.forEach(step => drums.push({ step: bar * 16 + step, kind: 'kick', velocity: step === 0 ? 1 : .75 }));
    snare.forEach(step => drums.push({ step: bar * 16 + step, kind: 'snare', velocity: .7 }));
    for (let step = 0; step < 16; step++) {
      if ((step + region) % (form % 2 ? 3 : 2) === 0 || (bar === 7 && (step + mapId) % (2 + region) === 0)) {
        drums.push({ step: bar * 16 + step, kind: 'hat', velocity: (step + form) % 4 === 0 ? .75 : .4 });
      }
    }
  }
  return Object.freeze({ mapId, name: `${style.name}・${FORMS[form]}`, tempo: 76 + mapId,
    steps: 128, motif: Object.freeze(motif.map(Object.freeze)), bass: Object.freeze(bass.map(Object.freeze)),
    drums: Object.freeze(drums.map(Object.freeze)), instrument: Object.freeze({ lead: style.lead, bass: style.bass,
      cutoff: style.cutoff + form * 170, detune: (form - 2) * 2, gate: .62 + form * .045,
      snareHz: 1150 + region * 210 + form * 65, hatHz: 4700 + region * 280 + form * 90 }) });
}

/** Eight bars per track: 17–25 seconds, with distinct phrases, rhythms, bass and percussion. */
export const MUSIC_PROFILES = Object.freeze(REGIONS.flatMap((_, region) => FORMS.map((_, form) => buildProfile(region, form))));

const tone = (frequency, endFrequency, duration, volume = .06, delay = 0, wave = 'sine') =>
  ({ frequency, endFrequency, duration, volume, delay, wave });
const noise = (frequency, endFrequency, duration, volume = .06, delay = 0, filter = 'bandpass') =>
  ({ noise: true, frequency, endFrequency, duration, volume, delay, filter });
const chime = (notes, spacing = .09, wave = 'triangle') => notes.map((note, i) => tone(midi(note), midi(note), .22, .045, i * spacing, wave));

const CUES = {
  'fire-spawn': [tone(80, 48, .5, .065, 0, 'sawtooth'), noise(350, 750, .5, .07)],
  'fire-attack': [noise(1700, 350, .65, .1), tone(105, 42, .45, .035, .04, 'sawtooth')],
  'water-spawn': [tone(340, 160, .13, .055), tone(460, 220, .15, .05, .17), tone(610, 260, .17, .045, .34)],
  'water-attack': [noise(500, 2600, .7, .085), tone(150, 65, .4, .05, 0, 'sine')],
  'ice-spawn': chime([84, 91, 88, 96], .12, 'sine'),
  'ice-attack': [noise(7000, 3800, .3, .075, 0, 'highpass'), ...chime([100, 95, 88], .08, 'triangle')],
  'lightning-spawn': [tone(110, 620, .43, .033, 0, 'sawtooth'), tone(220, 1240, .43, .015, .06, 'square')],
  'lightning-attack': [noise(6500, 350, .19, .12), tone(70, 45, .32, .06, .03, 'square'), noise(2800, 800, .12, .08, .24)],
  'zombie-spawn': [tone(105, 58, .5, .065, 0, 'sawtooth'), tone(112, 62, .6, .045, .12, 'triangle')],
  'zombie-bite': [noise(900, 280, .12, .075), tone(170, 75, .14, .06, 0, 'square')],
  jump: [tone(290, 690, .13, .085, 0, 'sine')],
  dive: [noise(2500, 550, .2, .068), tone(380, 120, .15, .0425, 0, 'triangle')],
  grab: [tone(190, 145, .08, .055, 0, 'triangle'), tone(140, 105, .09, .045, .09, 'triangle')],
  escape: chime([69, 76, 81], .055),
  impact: [noise(550, 120, .11, .0765), tone(100, 42, .12, .0935)],
  fall: [tone(460, 85, .55, .035, 0, 'triangle'), tone(430, 80, .5, .025, .1, 'sine')],
  'gate-pass': chime([76, 83, 88], .075),
  eliminate: chime([60, 56, 50], .16, 'triangle'),
  finish: chime([72, 76, 79, 84, 88], .095),
  countdown: [tone(680, 680, .1, .0595, 0, 'square')],
  start: chime([72, 79, 84], .07, 'square'),
  result: chime([72, 76, 79, 84, 79, 88], .13),
  infect: [tone(400, 75, .4, .035, 0, 'sawtooth'), noise(950, 250, .3, .04, .1)],
  cure: chime([79, 83, 86, 91], .08, 'sine'),
};
const MAX_VOICES = 64;
const LOOK_AHEAD = .14;

export class GameAudio {
  constructor() {
    this.musicEnabled = true;
    this.sfxEnabled = true;
    this.paused = false;
    this.scene = 'lobby';
    this.mapId = 1;
    this.context = null;
    this.voices = new Set();
    this.cooldowns = new Map();
    this.nextStepTime = null;
    this.step = 0;
    this.totalScheduled = 0;
    this.disposed = false;
    this.lastError = null;
    this._selectTrack();
  }

  async unlock() {
    if (this.disposed) return false;
    try {
      if (!this.context) {
        const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Context) return false;
        this.context = new Context();
        const ctx = this.context;
        this.master = ctx.createGain();
        this.master.gain.value = .65;
        this.limiter = ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -18;
        this.limiter.knee.value = 15;
        this.limiter.ratio.value = 8;
        this.limiter.attack.value = .003;
        this.limiter.release.value = .15;
        this.musicBus = ctx.createGain();
        this.musicBus.gain.value = .6;
        this.sfxBus = ctx.createGain();
        this.sfxBus.gain.value = .8;
        this.musicBus.connect(this.master);
        this.sfxBus.connect(this.master);
        this.master.connect(this.limiter);
        this.limiter.connect(ctx.destination);
        this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const samples = this.noiseBuffer.getChannelData(0);
        let seed = 123456789;
        for (let i = 0; i < samples.length; i++) {
          seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
          samples[i] = ((seed >>> 0) / 4294967296) * 2 - 1;
        }
      }
      if (this.context.state === 'suspended') await this.context.resume();
      if (this.disposed) return false;
      this.update();
      return this.context.state === 'running';
    } catch (error) {
      this.lastError = String(error?.message || error);
      return false;
    }
  }

  setMusicEnabled(enabled) {
    enabled = Boolean(enabled);
    if (this.musicEnabled === enabled) return;
    this.musicEnabled = enabled;
    this._stopVoices('music');
    this.nextStepTime = null;
  }

  setSfxEnabled(enabled) {
    this.sfxEnabled = Boolean(enabled);
    if (!this.sfxEnabled) this._stopVoices('sfx');
  }

  setScene(scene, mapId = 1) {
    scene = ['lobby', 'race', 'results'].includes(scene) ? scene : 'lobby';
    mapId = clamp(Math.trunc(Number(mapId) || 1), 1, MUSIC_PROFILES.length);
    if (this.scene === scene && this.mapId === mapId) return;
    this.scene = scene;
    this.mapId = mapId;
    this._stopVoices();
    this.cooldowns.clear();
    this.nextStepTime = null;
    this.step = 0;
    this._selectTrack();
  }

  setPaused(paused) {
    paused = Boolean(paused);
    if (this.paused === paused) return;
    this.paused = paused;
    this._stopVoices();
    this.nextStepTime = null;
    this.cooldowns.clear();
  }

  _selectTrack() {
    this.profile = MUSIC_PROFILES[this.mapId - 1];
    this.sequence = Array.from({ length: this.profile.steps }, () => ({ lead: [], bass: [], drums: [] }));
    for (const note of this.profile.motif) this.sequence[note.step].lead.push(note);
    for (const note of this.profile.bass) this.sequence[note.step].bass.push(note);
    for (const drum of this.profile.drums) this.sequence[drum.step].drums.push(drum);
  }

  update() {
    if (this.disposed || !this.context) return;
    const now = this.context.currentTime;
    for (const voice of this.voices) if (voice.end <= now) this._removeVoice(voice);
    if (this.context.state !== 'running' || this.paused || !this.musicEnabled) return;
    if (this.nextStepTime === null || this.nextStepTime < now - .1) this.nextStepTime = now + .025;
    const interval = 60 / (this.profile.tempo * (this.scene === 'lobby' ? .88 : 1)) / 4;
    let scheduled = 0;
    while (this.nextStepTime < now + LOOK_AHEAD && scheduled++ < 16) {
      this._musicStep(this.step, this.nextStepTime, interval);
      this.step = (this.step + 1) % this.profile.steps;
      this.nextStepTime += interval;
    }
  }

  _musicStep(step, at, interval) {
    const entry = this.sequence[step], instrument = this.profile.instrument;
    const volume = this.scene === 'lobby' ? .65 : .9;
    for (const note of entry.lead) this._voice({ frequency: midi(note.note), duration: note.steps * interval * instrument.gate,
      volume: .042 * note.velocity * volume, wave: instrument.lead, cutoff: instrument.cutoff,
      detune: instrument.detune }, at, 'music');
    for (const note of entry.bass) this._voice({ frequency: midi(note.note), duration: note.steps * interval * .8,
      volume: .064 * note.velocity * volume, wave: instrument.bass, cutoff: 700 }, at, 'music');
    for (const drum of entry.drums) {
      const velocity = drum.velocity * volume;
      if (drum.kind === 'kick') this._voice(tone(125, 42, .17, .09 * velocity), at, 'music');
      if (drum.kind === 'snare') this._voice(noise(instrument.snareHz, 900, .1, .036 * velocity), at, 'music');
      if (drum.kind === 'hat') this._voice(noise(instrument.hatHz, instrument.hatHz, .04, .025 * velocity, 0, 'highpass'), at, 'music');
    }
  }

  play(cue, options = {}) {
    if (this.disposed || !this.context || this.context.state !== 'running' || this.paused || !this.sfxEnabled || !CUES[cue]) return false;
    const now = this.context.currentTime;
    const cooldown = cue === 'impact' ? .25 : cue === 'countdown' ? .2 : cue.endsWith('-spawn') ? .25 : .1;
    if (now - (this.cooldowns.get(cue) ?? -Infinity) < cooldown) return false;
    this.cooldowns.set(cue, now);
    const intensity = clamp(Number(options.intensity) || 1, .2, 1.5);
    for (const sound of CUES[cue]) this._voice({ ...sound, volume: sound.volume * intensity }, now + .005 + (sound.delay || 0), 'sfx');
    return true;
  }

  _voice(sound, at, bus) {
    if (this.voices.size >= MAX_VOICES || !this.context || this.disposed) return;
    const ctx = this.context;
    const source = sound.noise ? ctx.createBufferSource() : ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const duration = Math.max(.025, sound.duration);
    const end = at + duration + .025;
    if (sound.noise) {
      source.buffer = this.noiseBuffer;
      source.loop = true;
      filter.type = sound.filter || 'bandpass';
      filter.Q.value = .65;
      filter.frequency.setValueAtTime(sound.frequency, at);
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, sound.endFrequency ?? sound.frequency), at + duration);
    } else {
      source.type = sound.wave || 'sine';
      source.frequency.setValueAtTime(sound.frequency, at);
      source.frequency.exponentialRampToValueAtTime(Math.max(20, sound.endFrequency ?? sound.frequency), at + duration);
      source.detune.value = sound.detune || 0;
      filter.type = 'lowpass';
      filter.frequency.value = sound.cutoff || 7000;
      filter.Q.value = .6;
    }
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.linearRampToValueAtTime(sound.volume, at + Math.min(.008, duration * .15));
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus === 'music' ? this.musicBus : this.sfxBus);
    const voice = { source, nodes: [source, filter, gain], start: at, end, bus };
    this.voices.add(voice);
    this.totalScheduled++;
    source.onended = () => this._removeVoice(voice);
    source.start(at);
    source.stop(end);
  }

  _removeVoice(voice) {
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null;
    for (const node of voice.nodes) node.disconnect();
  }

  _stopVoices(bus) {
    for (const voice of this.voices) {
      if (bus && voice.bus !== bus) continue;
      try { voice.source.stop(this.context.currentTime); } catch { /* Already stopped. */ }
      this._removeVoice(voice);
    }
  }

  getDiagnostics() {
    const now = this.context?.currentTime ?? 0;
    return { contextState: this.context?.state ?? 'unavailable', activeMap: this.mapId,
      profile: this.profile.name, tempo: this.profile.tempo, scene: this.scene,
      musicEnabled: this.musicEnabled, sfxEnabled: this.sfxEnabled, paused: this.paused,
      activeVoices: this.voices.size, scheduledNotes: [...this.voices].filter(voice => voice.start > now).length,
      totalScheduled: this.totalScheduled, lastError: this.lastError };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._stopVoices();
    this.cooldowns.clear();
    this.musicBus?.disconnect();
    this.sfxBus?.disconnect();
    this.master?.disconnect();
    this.limiter?.disconnect();
    this.context?.close()?.catch(() => {});
  }
}
