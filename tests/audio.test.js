import test from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio, MUSIC_PROFILES } from '../src/audio.js';

class FakeParam {
  constructor() { this.value = 0; }
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { assert.ok(value > 0); this.value = value; }
}
class FakeNode {
  constructor(context) { this.context = context; this.connections = new Set(); this.disconnected = false; }
  connect(node) { assert.ok(node); this.connections.add(node); }
  disconnect() { this.connections.clear(); this.disconnected = true; }
}
class FakeSource extends FakeNode {
  constructor(context) {
    super(context); this.frequency = new FakeParam(); this.detune = new FakeParam();
    this.started = false; this.ended = false; context.sources.push(this);
  }
  start(at) { assert.equal(this.started, false); this.started = true; this.startAt = at; }
  stop(at) { this.stopAt = at; }
}
class FakeAudioContext {
  constructor() {
    this.currentTime = 0; this.sampleRate = 8000; this.state = 'suspended';
    this.sources = []; this.destination = new FakeNode(this);
  }
  createGain() { const node = new FakeNode(this); node.gain = new FakeParam(); return node; }
  createDynamicsCompressor() {
    const node = new FakeNode(this);
    for (const name of ['threshold', 'knee', 'ratio', 'attack', 'release']) node[name] = new FakeParam();
    return node;
  }
  createBiquadFilter() { const node = new FakeNode(this); node.frequency = new FakeParam(); node.Q = new FakeParam(); return node; }
  createOscillator() { return new FakeSource(this); }
  createBufferSource() { return new FakeSource(this); }
  createBuffer(channels, length) { const data = new Float32Array(length); return { getChannelData: () => data }; }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
  advance(seconds) {
    this.currentTime += seconds;
    for (const source of this.sources) {
      if (!source.ended && source.stopAt <= this.currentTime) {
        source.ended = true;
        source.onended?.();
      }
    }
  }
}

function withContext(t) {
  const original = globalThis.AudioContext, webkit = globalThis.webkitAudioContext;
  globalThis.AudioContext = FakeAudioContext;
  delete globalThis.webkitAudioContext;
  t.after(() => {
    if (original === undefined) delete globalThis.AudioContext; else globalThis.AudioContext = original;
    if (webkit === undefined) delete globalThis.webkitAudioContext; else globalThis.webkitAudioContext = webkit;
  });
}

test('all 36 maps have distinct melodies, rhythms, bass, percussion and instruments', () => {
  assert.equal(MUSIC_PROFILES.length, 36);
  const signatures = {
    id: p => p.mapId, name: p => p.name, tempo: p => p.tempo,
    melody: p => p.motif.map(note => [note.note - p.motif[0].note, note.steps]),
    rhythm: p => p.motif.map(note => note.step),
    bass: p => p.bass.map(note => [note.step, note.note - p.bass[0].note]),
    drums: p => p.drums, instrument: p => p.instrument,
  };
  for (const [name, signature] of Object.entries(signatures)) {
    assert.equal(new Set(MUSIC_PROFILES.map(p => JSON.stringify(signature(p)))).size, 36, name);
  }
  for (const [i, profile] of MUSIC_PROFILES.entries()) {
    assert.equal(profile.mapId, i + 1);
    const seconds = profile.steps / 4 * 60 / profile.tempo;
    assert.ok(seconds >= 16 && seconds <= 32);
    assert.ok(profile.motif.length > 35 && profile.bass.length >= 24 && profile.drums.length > 40);
    for (const track of [profile.motif, profile.bass, profile.drums]) {
      assert.ok(track.every(note => note.step >= 0 && note.step < profile.steps));
    }
  }
});

test('Web Audio is created only by unlock and unavailable audio fails gracefully', async t => {
  withContext(t);
  const audio = new GameAudio();
  audio.update();
  assert.equal(audio.context, null);
  assert.equal(audio.play('jump'), false);
  assert.equal(await audio.unlock(), true);
  assert.equal(audio.getDiagnostics().contextState, 'running');
  audio.dispose();
  assert.equal(await audio.unlock(), false);
  delete globalThis.AudioContext;
  const unavailable = new GameAudio();
  assert.equal(await unavailable.unlock(), false);
  assert.doesNotThrow(() => { unavailable.update(); unavailable.setPaused(true); unavailable.dispose(); });
});

test('music scheduling stays bounded across every map and a background-tab time jump', async t => {
  withContext(t);
  const audio = new GameAudio();
  await audio.unlock();
  for (let mapId = 1; mapId <= 36; mapId++) {
    audio.setScene('race', mapId);
    for (let frame = 0; frame < 180; frame++) {
      audio.update();
      const diagnostics = audio.getDiagnostics();
      assert.ok(diagnostics.activeVoices <= 64);
      assert.ok(diagnostics.scheduledNotes <= 16);
      assert.ok([...audio.voices].every(voice => voice.start <= audio.context.currentTime + .141));
      audio.context.advance(1 / 60);
    }
    assert.equal(audio.getDiagnostics().activeMap, mapId);
    assert.equal(audio.getDiagnostics().profile, MUSIC_PROFILES[mapId - 1].name);
  }
  const before = audio.totalScheduled;
  audio.context.advance(120);
  audio.update();
  assert.ok(audio.totalScheduled - before <= 10, 'resume schedules the present, not missed minutes');
  audio.dispose();
  assert.equal(audio.getDiagnostics().activeVoices, 0);
  assert.ok(audio.context.sources.every(source => source.disconnected));
});

test('independent switches, pause and scene changes stop pending notes without overlapping loops', async t => {
  withContext(t);
  const audio = new GameAudio();
  await audio.unlock();
  assert.ok([...audio.voices].some(voice => voice.bus === 'music'));
  assert.equal(audio.play('fire-attack'), true);
  audio.setMusicEnabled(false);
  assert.ok([...audio.voices].every(voice => voice.bus === 'sfx'));
  assert.ok(audio.voices.size > 0);
  audio.setSfxEnabled(false);
  assert.equal(audio.voices.size, 0);
  assert.equal(audio.play('jump'), false);
  audio.setMusicEnabled(true);
  audio.update();
  audio.context.advance(.3);
  audio.update();
  assert.ok(audio.voices.size > 0);
  audio.setPaused(true);
  assert.equal(audio.voices.size, 0);
  audio.context.advance(10);
  audio.update();
  assert.equal(audio.voices.size, 0);
  audio.setSfxEnabled(true);
  assert.equal(audio.play('jump'), false);
  audio.setPaused(false);
  audio.update();
  const resumed = audio.totalScheduled;
  audio.update();
  audio.setPaused(false);
  audio.update();
  assert.equal(audio.totalScheduled, resumed, 'repeated frames/resume do not duplicate the schedule');
  const oldVoices = [...audio.voices];
  audio.setScene('race', 23);
  assert.equal(audio.voices.size, 0);
  assert.ok(oldVoices.every(voice => voice.source.disconnected));
  audio.update();
  assert.equal(audio.getDiagnostics().activeMap, 23);
  const unchanged = audio.totalScheduled;
  audio.setScene('race', 23);
  audio.update();
  assert.equal(audio.totalScheduled, unchanged);
  audio.setScene('results', 23);
  assert.equal(audio.voices.size, 0);
  audio.dispose();
});

test('all required cues play, are throttled and keep voices under the hard limit', async t => {
  withContext(t);
  const audio = new GameAudio();
  audio.setMusicEnabled(false);
  await audio.unlock();
  const cues = ['fire-spawn', 'fire-attack', 'water-spawn', 'water-attack', 'ice-spawn', 'ice-attack',
    'lightning-spawn', 'lightning-attack', 'zombie-spawn', 'zombie-bite', 'jump', 'dive', 'grab', 'escape',
    'impact', 'fall', 'gate-pass', 'eliminate', 'finish', 'countdown', 'start', 'result', 'infect', 'cure'];
  const monsterSignatures = [];
  for (const cue of cues) {
    audio.context.advance(2);
    audio.update();
    assert.equal(audio.play(cue), true, cue);
    assert.ok(audio.voices.size > 0, cue);
    assert.equal(audio.play(cue), false, `${cue} cooldown`);
    assert.ok(audio.voices.size <= 64);
    if (cue.includes('-spawn') || cue.includes('-attack') || cue === 'zombie-bite') {
      monsterSignatures.push(JSON.stringify([...audio.voices].map(voice => ({
        type: voice.source.type || 'noise', frequency: voice.source.frequency.value,
        duration: voice.end - voice.start, filter: voice.nodes[1].frequency.value,
      }))));
    }
  }
  assert.equal(new Set(monsterSignatures).size, 10);
  for (let i = 0; i < 100; i++) { audio.context.advance(.11); for (const cue of cues) audio.play(cue); }
  assert.ok(audio.voices.size <= 64);
  assert.equal(audio.play('unknown'), false);
  audio.dispose();
});
