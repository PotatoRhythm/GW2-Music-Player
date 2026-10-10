'use strict';

const SLOTS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 'f1', 'f2', 'f3', 'f4', 'f5'];
const SLOT_LABELS = {
    s1: 'Skill 1', s2: 'Skill 2', s3: 'Skill 3', s4: 'Skill 4', s5: 'Skill 5',
    s6: 'Skill 6', s7: 'Skill 7', s8: 'Skill 8', s9: 'Skill 9', s10: 'Skill 0',
    f1: 'F1', f2: 'F2', f3: 'F3', f4: 'F4', f5: 'F5',
};
const DEFAULT_BINDINGS = {
    s1: 'Digit1', s2: 'Digit2', s3: 'Digit3', s4: 'Digit4', s5: 'Digit5',
    s6: 'Digit6', s7: 'Digit7', s8: 'Digit8', s9: 'Digit9', s10: 'Digit0',
    f1: 'F1', f2: 'F2', f3: 'F3', f4: 'F4', f5: 'F5',
};
const NOTE_OFFSETS = { s1: 0, f1: 1, s2: 2, f2: 3, s3: 4, s4: 5, f3: 6, s5: 7, f4: 8, s6: 9, f5: 10, s7: 11, s8: 12 };
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const FADE = { in: 0.003, out: 0.05, release: 0.7, cut: 0.3, stop: 0.5, swap: 0.7, choke: 0.06, noteEnd: 0.5, cancel: 0.8 };
const SCHEDULE_AHEAD = 0.03;
const TEMPO = { step: 0.25, recharge: 1.5, lead: 0.05 };
const SWAP_SETTLE = 0.05;
const MAX_HELD_NOTE = 60;
const MAX_VOICES = 48;
const MAX_DECODED_INSTRUMENTS = 4;
const MAX_DOWNLOADS = 6;
const DOWNLOAD_ATTEMPTS = 3;
const STORAGE_KEY = 'gw2musicplayer.settings';
const REGIONS = {
    NA: { name: 'North American', aws: 'us-east-1' },
    EU: { name: 'European', aws: 'eu-central-1' },
    Custom: {},
};
const PING = { refresh: 1000, offset: 10, max: 9999 };

const state = {
    instrument: 'piano',
    octave: INSTRUMENTS.piano.start,
    accurate: false,
    volume: 50,
    bindings: { ...DEFAULT_BINDINGS },
    tempoLocked: false,
    region: Intl.DateTimeFormat().resolvedOptions().timeZone?.startsWith('Europe/') ? 'EU' : 'NA',
    customPing: 100,
};

/* ### SETTINGS ### */

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (!saved) return;
        if (typeof saved.accurate === 'boolean') state.accurate = saved.accurate;
        if (Number.isFinite(saved.volume)) state.volume = Math.min(100, Math.max(0, saved.volume));
        if (saved.region in REGIONS) state.region = saved.region;
        if (Number.isFinite(saved.customPing)) state.customPing = Math.min(PING.max, Math.max(0, saved.customPing));
        for (const slot of SLOTS) {
            if (saved.bindings && slot in saved.bindings) state.bindings[slot] = saved.bindings[slot];
        }
    } catch {}
}

function saveSettings() {
    const { accurate, volume, bindings, region, customPing } = state;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ accurate, volume, bindings, region, customPing }));
    } catch {}
}

/* ### AUDIO ### */

const ctx = new AudioContext();
const master = ctx.createGain();
const limiter = createLimiter();
master.connect(limiter.input);
limiter.output.connect(ctx.destination);

function createLimiter() {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -3;
    compressor.knee.value = 3;
    compressor.ratio.value = 20;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    const makeup = ctx.createGain();
    makeup.gain.value = 10 ** (-(3 * (1 - 1 / 20) * 0.6) / 20);
    const clipper = createClipper();
    compressor.connect(makeup).connect(clipper.input);
    return { input: compressor, output: clipper.output };
}

function createClipper() {
    const range = 4;
    const knee = 0.9;
    const curve = new Float32Array(8192);
    for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1) * 2 - 1) * range;
        const over = Math.abs(x) - knee;
        curve[i] = over <= 0 ? x : Math.sign(x) * (knee + (1 - knee) * Math.tanh(over / (1 - knee)));
    }
    const input = ctx.createGain();
    input.gain.value = 1 / range;
    const shaper = ctx.createWaveShaper();
    shaper.curve = curve;
    shaper.oversample = '4x';
    input.connect(shaper);
    return { input, output: shaper };
}

const rawFiles = new Map();
const decoded = new Map();
const loops = fetch('sound/loops.json').then(r => r.json()).catch(() => ({}));
const voices = new Set();
const heldVoices = new Map();

function current() {
    return INSTRUMENTS[state.instrument];
}

function modes(inst = current()) {
    return state.accurate ? inst.modes || [] : [];
}

function lastOctave(inst = current()) {
    return inst.octaves - 1 + modes(inst).length;
}

function currentMode(inst = current()) {
    return state.octave >= inst.octaves ? modes(inst)[state.octave - inst.octaves] : null;
}

function sharpsEnabled(inst = current()) {
    return inst.sharps || !state.accurate;
}

function isMono(inst = current()) {
    return inst.mono === 'always' || (inst.mono === true && state.accurate);
}

function tempoLocked(inst = current()) {
    return Boolean(state.accurate && inst.tempo && state.tempoLocked);
}

function releaseMode(inst = current()) {
    return (!state.accurate && inst.freeRelease) || inst.release || 'ring';
}

function releaseFade(inst = current()) {
    return (state.accurate ? inst.releaseFade : inst.freeReleaseFade) || FADE.release;
}

function cutFade(inst = current()) {
    return (state.accurate && inst.releaseFade) || FADE.cut;
}

function sampleUrls(id) {
    const inst = INSTRUMENTS[id];
    const urls = new Map();
    const addKit = (kit, folder) => {
        for (const sound of Object.values(kit.sounds)) {
            for (let v = 0; v < sound.variations; v++) {
                const key = `${folder}${sound.group}_${v}`;
                urls.set(key, `sound/${id}/${key}.ogg`);
            }
        }
    };
    if (inst.layout === 'drums') {
        addKit(inst.kit, '');
    } else {
        const top = inst.root + (inst.octaves - 1) * 12 + (inst.layout === 'organ' ? 11 : 12);
        for (let midi = inst.root; midi <= top; midi++) {
            urls.set(midi, `sound/${id}/${midi}.ogg`);
        }
    }
    for (const mode of inst.modes || []) addKit(mode, `${mode.id}/`);
    return urls;
}

const downloadQueue = [];
const queuedJobs = new Map();
let activeDownloads = 0;

function fetchRaw(url, urgent = false) {
    const queued = queuedJobs.get(url);
    if (urgent && queued) {
        downloadQueue.splice(downloadQueue.indexOf(queued), 1);
        downloadQueue.unshift(queued);
    }
    if (!rawFiles.has(url)) {
        const request = new Promise((resolve, reject) => {
            const job = { url, resolve, reject, attempts: 0 };
            queuedJobs.set(url, job);
            if (urgent) downloadQueue.unshift(job); else downloadQueue.push(job);
            pumpDownloads();
        });
        request.catch(() => rawFiles.delete(url));
        rawFiles.set(url, request);
    }
    return rawFiles.get(url);
}

function pumpDownloads() {
    while (activeDownloads < MAX_DOWNLOADS && downloadQueue.length) {
        const job = downloadQueue.shift();
        queuedJobs.delete(job.url);
        activeDownloads++;
        fetch(job.url)
            .then(response => {
                if (!response.ok) throw new Error(`${job.url}: ${response.status}`);
                return response.arrayBuffer();
            })
            .then(job.resolve, error => {
                if (++job.attempts >= DOWNLOAD_ATTEMPTS) return job.reject(error);
                setTimeout(() => {
                    queuedJobs.set(job.url, job);
                    downloadQueue.unshift(job);
                    pumpDownloads();
                }, 500 * job.attempts);
            })
            .finally(() => {
                activeDownloads--;
                pumpDownloads();
            });
    }
}

function loadInstrument(id) {
    if (decoded.has(id)) {
        const buffers = decoded.get(id);
        decoded.delete(id);
        decoded.set(id, buffers);
        return buffers;
    }
    const entries = [...sampleUrls(id)].map(async ([key, url]) => {
        const data = await fetchRaw(url, true);
        return [key, fadeEdges(await ctx.decodeAudioData(data.slice(0)))];
    });
    const buffers = Promise.all(entries).then(list => new Map(list));
    buffers.catch(() => decoded.delete(id));
    decoded.set(id, buffers);
    while (decoded.size > MAX_DECODED_INSTRUMENTS) {
        decoded.delete(decoded.keys().next().value);
    }
    return buffers;
}

function prefetchAll() {
    for (const id of Object.keys(INSTRUMENTS)) {
        for (const url of sampleUrls(id).values()) {
            fetchRaw(url).catch(() => {});
        }
    }
}

function unlockAudio() {
    if (ctx.state === 'suspended') ctx.resume();
}

function fadeEdges(buffer) {
    const fadeIn = Math.min(buffer.length, Math.round(FADE.in * buffer.sampleRate));
    const fadeOut = Math.min(buffer.length, Math.round(FADE.out * buffer.sampleRate));
    for (let c = 0; c < buffer.numberOfChannels; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < fadeIn; i++) data[i] *= i / fadeIn;
        for (let i = 1; i <= fadeOut; i++) data[buffer.length - i] *= (i - 1) / fadeOut;
    }
    return buffer;
}

function startVoice(buffer, { loop, attack, delay = 0, tag, extend } = {}) {
    const attackGain = ctx.createGain();
    if (attack) {
        attackGain.gain.setValueAtTime(0, ctx.currentTime + delay);
        attackGain.gain.linearRampToValueAtTime(1, ctx.currentTime + delay + attack);
    }
    const release = ctx.createGain();
    attackGain.connect(release).connect(master);

    const voice = { sources: [], release, tag, stopping: false, createdAt: ctx.currentTime, startAt: ctx.currentTime + delay };
    const addSource = (when, offset = 0) => {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        source.connect(gain).connect(attackGain);
        source.start(when, offset);
        voice.sources.push(source);
        return gain.gain;
    };

    if (extend) {
        const { from, crossfade, until } = extend;
        const end = buffer.duration - FADE.out;
        let start = ctx.currentTime + delay;
        let gain = addSource(start);
        let segmentEnd = start + end;
        while (segmentEnd < ctx.currentTime + delay + until) {
            gain.setValueAtTime(1, segmentEnd - crossfade);
            gain.linearRampToValueAtTime(0, segmentEnd);
            start = segmentEnd - crossfade;
            gain = addSource(start, from);
            gain.setValueAtTime(0, start);
            gain.linearRampToValueAtTime(1, segmentEnd);
            segmentEnd = start + end - from;
        }
    } else {
        addSource(delay ? ctx.currentTime + delay : 0);
        if (loop) {
            const [source] = voice.sources;
            source.loop = true;
            source.loopStart = loop[0];
            source.loopEnd = Math.min(loop[1], buffer.duration);
        }
    }

    voices.add(voice);
    voice.sources.at(-1).onended = () => {
        voices.delete(voice);
        release.disconnect();
        voice.onEnded?.();
    };
    if (voices.size > MAX_VOICES) stopVoice(voices.values().next().value, FADE.choke);
    return voice;
}

function stopVoice(voice, fade) {
    if (voice.stopping) return;
    voice.stopping = true;
    const t = ctx.currentTime + SCHEDULE_AHEAD;
    voice.release.gain.setValueAtTime(1, t);
    voice.release.gain.linearRampToValueAtTime(0, t + fade);
    voice.sources.forEach(source => source.stop(t + fade + 0.05));
}

function cancelVoice(voice) {
    voice.stopping = true;
    clearTimeout(voice.cutTimer);
    voice.sources.forEach(source => source.stop(0));
}

function stopAll(fade) {
    voices.forEach(voice => stopVoice(voice, fade));
    heldVoices.clear();
}

async function playNote(slot, midi, at) {
    const id = state.instrument;
    const inst = INSTRUMENTS[id];
    const buffer = (await loadInstrument(id)).get(midi);
    const loop = inst.loop ? (await loops)[id]?.[midi] : null;
    if (!buffer || id !== state.instrument) return;

    const startDelay = state.accurate ? inst.startDelay || 0 : 0;
    const delay = startDelay + untilTime(at);
    let cutTimer;
    if (isMono(inst) || tempoLocked(inst)) {
        const chain = state.accurate ? inst.chainWindow || 0 : 0;
        voices.forEach(voice => {
            const pending = voice.startAt > ctx.currentTime && ctx.currentTime - voice.createdAt < chain;
            if (!voice.stopping && pending) cancelVoice(voice);
        });
        const playing = [...voices];
        const cut = () => playing.forEach(voice => stopVoice(voice, cutFade(inst)));
        if (delay) cutTimer = setTimeout(cut, delay * 1000); else cut();
    }
    const previous = heldVoices.get(slot);
    if (previous) stopVoice(previous, FADE.choke);

    const extend = inst.extend && {
        ...inst.extend,
        until: state.accurate ? inst.noteLength : MAX_HELD_NOTE,
    };
    const voice = startVoice(buffer, { loop, attack: inst.attack, delay, extend });
    voice.cutTimer = cutTimer;
    if (releaseMode(inst) === 'hold') {
        if (pressedBy.has(slot)) {
            heldVoices.set(slot, voice);
        } else {
            stopVoice(voice, releaseFade(inst));
        }
    }
    if (inst.noteLength && state.accurate) {
        setTimeout(() => stopVoice(voice, FADE.noteEnd), (inst.noteLength - FADE.noteEnd) * 1000);
        if (releaseMode(inst) === 'ring') {
            litBy.set(slot, (litBy.get(slot) || 0) + 1);
            showPressed();
            voice.onEnded = () => {
                const count = litBy.get(slot) - 1;
                if (count) litBy.set(slot, count); else litBy.delete(slot);
                showPressed();
            };
        }
    }
}

async function playKitSound({ kit, folder, soundId }, at) {
    const id = state.instrument;
    const inst = INSTRUMENTS[id];
    const sound = kit.sounds[soundId];
    const buffers = await loadInstrument(id);
    if (state.instrument !== id) return;

    const variation = Math.floor(Math.random() * sound.variations);
    const delay = untilTime(at);

    const cut = [];
    if (isMono(inst) || tempoLocked(inst)) cut.push(...voices);
    for (const choked of sound.chokes || []) {
        voices.forEach(voice => voice.tag === choked && cut.push(voice));
    }
    const stop = () => cut.forEach(voice => stopVoice(voice, sound.chokes ? FADE.choke : cutFade(inst)));
    if (delay) setTimeout(stop, delay * 1000); else stop();
    startVoice(buffers.get(`${folder}${sound.group}_${variation}`), { tag: soundId, delay });
}

function untilTime(at) {
    return at ? Math.max(0, at - ctx.currentTime) : 0;
}

function nextBeat() {
    return Math.ceil((ctx.currentTime + 0.01) / TEMPO.step) * TEMPO.step;
}

function setVolume(volume) {
    state.volume = volume;
    master.gain.setTargetAtTime(volume / 100, ctx.currentTime, 0.01);
}

/* ### SKILLS ### */

function slotAction(slot) {
    const inst = current();
    const kitAction = (kit, folder) => {
        const soundId = kit.pads[slot];
        if (!soundId) return null;
        const { name, icon } = kit.sounds[soundId];
        return { type: 'kit', kit, folder, soundId, icon, title: name };
    };
    if (inst.layout === 'drums') return kitAction(inst.kit, '');

    const mode = currentMode(inst);
    if (mode && slot === (mode.tempoSlot || 's8') && inst.tempo) {
        return state.tempoLocked
            ? { type: 'tempo', icon: 'tempo_locked.png', title: 'Tempo Locked: notes and chords play on the beat, one per beat. Click to unlock.' }
            : { type: 'tempo', icon: 'tempo_unlocked.png', title: 'Tempo Unlocked: notes and chords play right away. Click to lock them to the beat.' };
    }
    if (mode && slot !== 's9' && slot !== 's10') return kitAction(mode, `${mode.id}/`);

    const sharp = slot.startsWith('f');
    if (sharp && !sharpsEnabled(inst)) return null;

    const noteSkills = inst.layout === 'organ' ? 7 : 8;
    const index = sharp ? 0 : Number(slot.slice(1));
    if (sharp || index <= noteSkills) {
        const midi = inst.root + state.octave * 12 + NOTE_OFFSETS[slot];
        const icon = inst.layout === 'organ' ? 'pipeskill.png' : `skill${sharp ? 'F' + slot.slice(1) : index}.png`;
        return { type: 'note', midi, icon, title: NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1) };
    }

    const down = { type: 'octaveDown', icon: 'octave_down.png', title: 'Decrease Octave', locked: state.octave === 0 };
    const up = { type: 'octaveUp', icon: 'octave_up.png', title: 'Increase Octave', locked: state.octave === lastOctave(inst) };
    if (inst.layout === 'organ') {
        return { s8: down, s9: up }[slot] || null;
    }
    if (inst.layout === 'flute' && state.accurate) {
        if (slot === 's9') return state.octave === 0 ? up : down;
        return { type: 'stop', icon: 'stop.png', title: 'Stop Playing' };
    }
    return slot === 's9' ? down : up;
}

const keysEl = document.getElementById('keys');
const skillEls = {};
document.querySelectorAll('.skill').forEach(el => {
    skillEls[el.dataset.slot] = el;
});

function renderSkills() {
    const naturals = SLOTS.filter(slot => slot.startsWith('s'));
    const unused = naturals.length - 1 - naturals.findLastIndex(slot => slotAction(slot));
    keysEl.style.setProperty('--unused', unused);
    for (const slot of SLOTS) {
        const el = skillEls[slot];
        const action = slotAction(slot);
        el.classList.toggle('empty', !action);
        el.classList.toggle('locked', Boolean(action && action.locked));
        el.style.backgroundImage = action ? `url('image/${action.locked ? 'lock.png' : action.icon}')` : '';
        el.title = action ? action.title : '';
        syncTempoCooldown(slot, action);
    }
}

let flipTimer = null;
function flipSkills(slot) {
    (slot ? skillEls[slot] : keysEl).classList.add('flipping');
    clearTimeout(flipTimer);
    flipTimer = setTimeout(() => {
        renderSkills();
        keysEl.classList.remove('flipping');
        Object.values(skillEls).forEach(el => el.classList.remove('flipping'));
    }, 250);
}

function changeOctave(delta) {
    const octave = Math.min(lastOctave(), Math.max(0, state.octave + delta));
    if (octave === state.octave) return;
    state.octave = octave;
    flipSkills();
}

const pressedBy = new Map();
const litBy = new Map();

function showPressed() {
    const held = [...pressedBy.keys()];
    const shown = state.accurate && !current().showAllHeld ? held.slice(-1) : held;
    for (const slot of SLOTS) {
        skillEls[slot].classList.toggle('pressed', shown.includes(slot) || litBy.has(slot));
    }
}

let lastNoteAt = -Infinity;
let queuedNote = null;

function playLimited(play, onBeat = tempoLocked()) {
    if (onBeat) {
        playOnBeat(play);
        return;
    }
    const inst = current();
    const interval = state.accurate ? (inst.noteInterval || 0) * 1000 : 0;
    const wait = lastNoteAt + interval - performance.now();
    if (wait > (inst.queueWindow ?? Infinity) * 1000) return;
    cancelQueuedNote();
    if (wait <= 0) {
        lastNoteAt = performance.now();
        play();
        return;
    }
    queuedNote = setTimeout(() => {
        queuedNote = null;
        lastNoteAt = performance.now();
        play();
    }, wait);
}

let claimedBeat = -Infinity;

function playOnBeat(play) {
    cancelQueuedNote();
    let beat = nextBeat();
    if (beat <= claimedBeat + 0.001) beat = claimedBeat + TEMPO.step;
    const fire = () => {
        queuedNote = null;
        claimedBeat = beat;
        play(beat);
    };
    const wait = beat - TEMPO.lead - ctx.currentTime;
    if (wait <= 0) fire(); else queuedNote = setTimeout(fire, wait * 1000);
}

function cancelQueuedNote() {
    clearTimeout(queuedNote);
    queuedNote = null;
}

function resetSpeedLimit() {
    cancelQueuedNote();
    lastNoteAt = -Infinity;
    cooldowns.forEach((timer, slot) => endCooldown(slot));
}

const cooldowns = new Map();

function startCooldown(slot, seconds, { tempo = false, total = seconds } = {}) {
    if (!seconds) return;
    endCooldown(slot);
    const el = skillEls[slot];
    if (tempo) el.dataset.cooldown = 'tempo';
    el.style.setProperty('--cooldown', `${total}s`);
    el.style.setProperty('--cooldown-elapsed', `${seconds - total}s`);
    el.classList.add('cooling');
    cooldowns.set(slot, setTimeout(() => endCooldown(slot), seconds * 1000));

    const label = document.createElement('span');
    label.className = 'cooldown-time';
    el.appendChild(label);
    const end = performance.now() + seconds * 1000;
    const tick = () => {
        if (!label.isConnected) return;
        label.textContent = Math.max(0.1, (end - performance.now()) / 1000).toFixed(1);
        requestAnimationFrame(tick);
    };
    tick();
}

const tempoReadyAt = { unlocked: 0, locked: 0 };
const tempoSkill = () => state.tempoLocked ? 'locked' : 'unlocked';

function syncTempoCooldown(slot, action) {
    const left = action?.type === 'tempo' ? tempoReadyAt[tempoSkill()] - performance.now() : 0;
    if (left > 0) startCooldown(slot, left / 1000, { tempo: true, total: TEMPO.recharge });
    else if (skillEls[slot].dataset.cooldown === 'tempo') endCooldown(slot);
}

function endCooldown(slot) {
    clearTimeout(cooldowns.get(slot));
    cooldowns.delete(slot);
    skillEls[slot].classList.remove('cooling');
    delete skillEls[slot].dataset.cooldown;
    skillEls[slot].querySelector('.cooldown-time')?.remove();
}

const droppedBy = new Map();
let swapInFlight = false;

function pressSlot(slot) {
    unlockAudio();
    const swap = state.accurate && ['octaveUp', 'octaveDown'].includes(slotAction(slot)?.type);
    if (swap && swapInFlight) {
        droppedBy.set(slot, (droppedBy.get(slot) || 0) + 1);
        return;
    }
    if (swap) swapInFlight = true;
    afterPing(() => {
        useSkill(slot);
        if (swap) setTimeout(() => swapInFlight = false, SWAP_SETTLE * 1000);
    });
}

function releaseSlot(slot) {
    const dropped = droppedBy.get(slot);
    if (dropped) {
        if (dropped > 1) droppedBy.set(slot, dropped - 1); else droppedBy.delete(slot);
        return;
    }
    afterPing(() => endSkill(slot));
}

function useSkill(slot) {
    const action = slotAction(slot);
    if (!action || action.locked || cooldowns.has(slot)) return;

    pressedBy.set(slot, (pressedBy.get(slot) || 0) + 1);
    showPressed();

    switch (action.type) {
        case 'note': playLimited(at => playNote(slot, action.midi, at)); break;
        case 'kit': playLimited(at => playKitSound(action, at), tempoLocked() || action.kit.pulse); break;
        case 'octaveDown': changeOctave(-1); break;
        case 'octaveUp': changeOctave(1); break;
        case 'stop': stopAll(FADE.stop); break;
        case 'tempo':
            tempoReadyAt[tempoSkill()] = performance.now() + TEMPO.recharge * 1000;
            state.tempoLocked = !state.tempoLocked;
            flipSkills(slot);
            break;
    }
}

function cancelNotes() {
    if (state.accurate && current().layout === 'organ') return;
    afterPing(() => {
        cancelQueuedNote();
        stopAll(FADE.cancel);
    });
}

function endSkill(slot) {
    const count = pressedBy.get(slot);
    if (!count) return;
    if (count > 1) {
        pressedBy.set(slot, count - 1);
        return;
    }
    pressedBy.delete(slot);
    showPressed();
    if (slotAction(slot)?.type === 'note') startCooldown(slot, state.accurate && current().noteCooldown);
    const voice = heldVoices.get(slot);
    if (voice) {
        heldVoices.delete(slot);
        stopVoice(voice, releaseFade());
    }
}

/* ### INSTRUMENTS ### */

const instrumentEls = {};

async function selectInstrument(id) {
    if (id === state.instrument) return;
    resetSpeedLimit();
    stopAll(FADE.swap);
    state.tempoLocked = false;
    tempoReadyAt.unlocked = tempoReadyAt.locked = 0;
    state.instrument = id;
    state.octave = current().start ?? 0;
    for (const [otherId, el] of Object.entries(instrumentEls)) {
        el.classList.toggle('selected', otherId === id);
    }
    flipSkills();
    await showLoading(id);
}

async function showLoading(id) {
    const el = instrumentEls[id];
    el.classList.add('loading');
    try {
        await loadInstrument(id);
        el.classList.remove('failed');
    } catch (e) {
        el.classList.add('failed');
        console.error(`Could not load ${INSTRUMENTS[id].name}`, e);
    } finally {
        el.classList.remove('loading');
    }
}

function buildInstrumentBar() {
    const bar = document.getElementById('instrumentbar');
    for (const [id, inst] of Object.entries(INSTRUMENTS)) {
        const el = document.createElement('button');
        el.className = 'instrument';
        el.title = inst.name;
        el.setAttribute('aria-label', inst.name);
        el.style.backgroundImage = `url('image/${inst.icon}')`;
        el.classList.toggle('selected', id === state.instrument);
        el.addEventListener('click', () => {
            unlockAudio();
            selectInstrument(id);
        });
        instrumentEls[id] = el;
        bar.appendChild(el);
    }
}

/* ### HOTKEYS ### */

const KEY_LABELS = {
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';',
    Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`', Space: 'Space',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
};

function keyLabel(code) {
    if (!code) return '';
    if (KEY_LABELS[code]) return KEY_LABELS[code];
    return code.replace(/^(Key|Digit)/, '').replace(/^Numpad/, 'Num ');
}

const menuTiles = {};

function renderHotkeys() {
    for (const slot of SLOTS) {
        const label = keyLabel(state.bindings[slot]);
        skillEls[slot].querySelector('.hotkey').textContent = label;
        const tile = menuTiles[slot];
        if (tile) {
            tile.querySelector('.hotkey-tile-key').textContent = slot === rebinding ? '…' : label || '—';
            tile.classList.toggle('unbound', !label);
        }
    }
}

function slotForKey(code) {
    return SLOTS.find(slot => state.bindings[slot] === code);
}

const HINT = 'Click a skill, then press the key you want to use for it.';
let rebinding = null;

function setHint(text, listening = false) {
    const hint = document.getElementById('hotkey-hint');
    hint.textContent = text;
    hint.classList.toggle('listening', listening);
}

function startRebinding(slot) {
    stopRebinding();
    rebinding = slot;
    menuTiles[slot].classList.add('listening');
    renderHotkeys();
    setHint(`Press a key for ${SLOT_LABELS[slot]}, or Esc to cancel.`, true);
}

function stopRebinding() {
    if (!rebinding) return;
    menuTiles[rebinding].classList.remove('listening');
    rebinding = null;
    renderHotkeys();
}

window.addEventListener('keydown', event => {
    const menu = document.getElementById('hotkey-menu');
    if (menu.hidden) return;
    event.stopImmediatePropagation();
    if (!rebinding) {
        if (event.code === 'Escape') closeHotkeyMenu();
        if (!['Tab', 'Enter', 'Space'].includes(event.code)) event.preventDefault();
        return;
    }
    event.preventDefault();
    const slot = rebinding;
    stopRebinding();
    if (event.code === 'Escape') {
        setHint(HINT);
        return;
    }
    const other = slotForKey(event.code);
    if (other && other !== slot) state.bindings[other] = null;
    state.bindings[slot] = event.code;
    saveSettings();
    renderHotkeys();
    const key = keyLabel(event.code);
    setHint(other && other !== slot
        ? `${key} moved from ${SLOT_LABELS[other]} to ${SLOT_LABELS[slot]}. ${SLOT_LABELS[other]} has no key now.`
        : `${SLOT_LABELS[slot]} is now ${key}.`);
}, true);

const heldKeys = new Map();

document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.matches('input[type="number"]')) return;
    if (event.code === 'Escape') {
        if (!event.repeat) cancelNotes();
        return;
    }
    const slot = slotForKey(event.code);
    if (!slot) return;
    event.preventDefault();
    if (event.repeat || heldKeys.has(event.code)) return;
    heldKeys.set(event.code, slot);
    pressSlot(slot);
});

document.addEventListener('keyup', event => {
    const slot = heldKeys.get(event.code);
    if (!slot) return;
    heldKeys.delete(event.code);
    releaseSlot(slot);
});

function releaseAllKeys() {
    heldKeys.forEach(slot => releaseSlot(slot));
    heldKeys.clear();
}

function buildHotkeyMenu() {
    for (const slot of SLOTS) {
        const sharp = slot.startsWith('f');
        const tile = document.createElement('button');
        tile.className = 'hotkey-tile';
        tile.title = SLOT_LABELS[slot];
        tile.setAttribute('aria-label', SLOT_LABELS[slot]);
        tile.innerHTML = '<span class="hotkey-tile-icon"></span><span class="hotkey-tile-key"></span>';
        tile.querySelector('.hotkey-tile-icon').style.backgroundImage = `url('image/${menuIcon(slot)}')`;
        if (sharp) tile.style.setProperty('--col', skillEls[slot].style.getPropertyValue('--col'));
        tile.addEventListener('click', () => startRebinding(slot));
        menuTiles[slot] = tile;
        document.getElementById(sharp ? 'hotkey-sharps' : 'hotkey-naturals').appendChild(tile);
    }

    const menu = document.getElementById('hotkey-menu');
    document.getElementById('rebind-button').addEventListener('click', () => {
        releaseAllKeys();
        setHint(HINT);
        menu.hidden = false;
        fitToScreen();
    });
    document.getElementById('close-hotkey-menu').addEventListener('click', closeHotkeyMenu);
    menu.addEventListener('click', event => {
        if (event.target === menu) closeHotkeyMenu();
    });
    document.getElementById('reset-hotkeys').addEventListener('click', () => {
        stopRebinding();
        state.bindings = { ...DEFAULT_BINDINGS };
        saveSettings();
        renderHotkeys();
        setHint('All skills are back to their default keys.');
    });
}

function closeHotkeyMenu() {
    stopRebinding();
    document.getElementById('hotkey-menu').hidden = true;
}

function menuIcon(slot) {
    if (slot === 's9') return 'octave_down.png';
    if (slot === 's10') return 'octave_up.png';
    return `skill${slot.startsWith('f') ? 'F' + slot.slice(1) : slot.slice(1)}.png`;
}

/* ### NPC VOICES ### */

const VOICE_LINES = [
    'sound/voice/violets.ogg', 'sound/voice/quality-armor.ogg', 'sound/voice/rich.ogg', 'sound/voice/golem.ogg',
    'sound/voice/bandit.ogg',
];
const VOICE_INTERVAL = { min: 300, max: 600 };
const voiceLine = { playing: null, last: null, request: 0, timer: null, buffers: new Map() };

function loadVoiceLine(url) {
    if (!voiceLine.buffers.has(url)) {
        const buffer = fetchRaw(url).then(data => ctx.decodeAudioData(data.slice(0)));
        buffer.catch(() => voiceLine.buffers.delete(url));
        voiceLine.buffers.set(url, buffer);
    }
    return voiceLine.buffers.get(url);
}

async function playVoiceLine() {
    stopVoiceLine();
    const request = voiceLine.request;
    const choices = VOICE_LINES.filter(url => url !== voiceLine.last);
    const url = choices[Math.floor(Math.random() * choices.length)];
    voiceLine.last = url;
    let buffer;
    try {
        buffer = await loadVoiceLine(url);
    } catch {
        return;
    }
    if (request !== voiceLine.request) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    source.connect(gain).connect(master);
    source.start();
    voiceLine.playing = { source, gain };
    source.onended = () => {
        if (voiceLine.playing?.source === source) voiceLine.playing = null;
    };
}

function stopVoiceLine() {
    voiceLine.request++;
    if (!voiceLine.playing) return;
    const { source, gain } = voiceLine.playing;
    gain.gain.setTargetAtTime(0, ctx.currentTime, FADE.cut / 4);
    source.stop(ctx.currentTime + FADE.cut);
    voiceLine.playing = null;
}

function scheduleVoiceLines() {
    clearTimeout(voiceLine.timer);
    if (!state.accurate) return;
    const { min, max } = VOICE_INTERVAL;
    voiceLine.timer = setTimeout(() => {
        if (!document.hidden && ctx.state === 'running') playVoiceLine();
        scheduleVoiceLines();
    }, (min + Math.random() * (max - min)) * 1000);
}

/* ### PING ### */

const ping = { ms: null, warm: false, failed: false, run: 0, timer: null };
const inputQueue = [];

function inputDelay() {
    if (!state.accurate) return 0;
    return REGIONS[state.region].aws ? ping.ms || 0 : state.customPing;
}

function afterPing(fn) {
    const now = performance.now();
    const due = Math.max(now + inputDelay(), inputQueue.at(-1)?.due ?? 0);
    if (due <= now) return fn();
    inputQueue.push({ fn, due });
    if (inputQueue.length === 1) setTimeout(drainInputs, due - now);
}

function drainInputs() {
    while (inputQueue.length && inputQueue[0].due <= performance.now()) inputQueue.shift().fn();
    if (inputQueue.length) setTimeout(drainInputs, inputQueue[0].due - performance.now());
}

async function timeRequest(url) {
    const start = performance.now();
    await fetch(url, { mode: 'no-cors', cache: 'no-store' });
    return performance.now() - start;
}

async function measurePing() {
    const run = ping.run;
    const url = `https://dynamodb.${REGIONS[state.region].aws}.amazonaws.com/ping`;
    try {
        const ms = await timeRequest(url);
        if (run !== ping.run) return;
        if (ping.warm) ping.ms = Math.round(ms) + PING.offset;
        ping.warm = true;
        ping.failed = false;
    } catch {
        if (run !== ping.run) return;
        ping.warm = false;
        ping.failed = true;
    }
    showPing();
}

function updatePing() {
    clearTimeout(ping.timer);
    const run = ++ping.run;
    ping.warm = false;
    showPing();
    if (!state.accurate || document.hidden || !REGIONS[state.region].aws) return;
    const loop = async () => {
        await measurePing();
        if (run === ping.run) ping.timer = setTimeout(loop, PING.refresh);
    };
    loop();
}

function showPing() {
    const el = document.getElementById('ping');
    const value = document.getElementById('ping-value');
    const region = REGIONS[state.region];
    el.hidden = !state.accurate;
    document.getElementById('ping-region').textContent = region.aws ? `${state.region} Ping:` : 'Ping:';
    document.getElementById('ping-custom').hidden = Boolean(region.aws);
    value.hidden = !region.aws;
    value.textContent = `${ping.ms === null ? '…' : ping.ms} ms`;
    value.classList.toggle('failed', Boolean(ping.failed));
    el.title = !region.aws ? 'Your chosen ping. '
        : ping.failed ? `Couldn't reach the ${region.name} servers. `
        : `Your estimated ping to the ${region.name} servers. `;
    el.title += 'Skills react this much later, like in game. Click to switch between NA, EU and Custom.';
}

function setupPing() {
    document.getElementById('ping').addEventListener('click', event => {
        if (event.target.closest('#ping-custom')) return;
        const ids = Object.keys(REGIONS);
        state.region = ids[(ids.indexOf(state.region) + 1) % ids.length];
        ping.ms = null;
        saveSettings();
        updatePing();
    });

    const input = document.querySelector('#ping-custom input');
    input.max = PING.max;
    input.value = state.customPing;
    input.addEventListener('input', () => {
        if (input.value === '') return;
        state.customPing = Math.min(PING.max, Math.max(0, Math.round(Number(input.value))));
        saveSettings();
    });
    input.addEventListener('change', () => input.value = state.customPing);
    input.addEventListener('keydown', event => event.key === 'Enter' && input.blur());

    document.addEventListener('visibilitychange', updatePing);
    updatePing();
}

/* ### SETTINGS BAR ### */

function setupSettingsBar() {
    const accurateToggle = document.getElementById('accurate-toggle');
    accurateToggle.checked = state.accurate;
    accurateToggle.addEventListener('change', () => {
        unlockAudio();
        state.accurate = accurateToggle.checked;
        state.octave = Math.min(state.octave, lastOctave());
        resetSpeedLimit();
        stopAll(FADE.cut);
        flipSkills();
        saveSettings();
        updatePing();
        if (state.accurate) playVoiceLine(); else stopVoiceLine();
        scheduleVoiceLines();
    });

    const slider = document.querySelector('#volume-slider input');
    const progress = document.querySelector('#volume-slider progress');
    const value = document.getElementById('volume-value');
    const icon = document.getElementById('volume-icon');
    const showVolume = () => {
        const v = state.volume;
        slider.value = progress.value = value.textContent = v;
        icon.src = `image/volume-${v > 75 ? 'up' : v > 25 ? 'mid' : v > 0 ? 'down' : 'mute'}.png`;
    };
    slider.addEventListener('input', () => {
        setVolume(Number(slider.value));
        showVolume();
    });
    slider.addEventListener('change', saveSettings);
    showVolume();
}

/* ### POINTER INPUT ### */

const pointers = new Map();

function setupPointerInput() {
    for (const slot of SLOTS) {
        skillEls[slot].addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            event.preventDefault();
            pointers.set(event.pointerId, slot);
            pressSlot(slot);
        });
    }
    const release = event => {
        const slot = pointers.get(event.pointerId);
        if (!slot) return;
        pointers.delete(event.pointerId);
        releaseSlot(slot);
    };
    document.addEventListener('pointerup', release);
    document.addEventListener('pointercancel', release);
}

/* ### STARTUP ### */

function fitToScreen() {
    for (const el of document.querySelectorAll('.content, .hotkey-menu-content')) {
        el.style.zoom = '';
        if (!el.offsetWidth) continue;
        el.style.zoom = Math.min(1, (document.documentElement.clientWidth - 16) / el.offsetWidth);
    }
}

async function init() {
    loadSettings();
    setVolume(state.volume);
    buildInstrumentBar();
    buildHotkeyMenu();
    setupSettingsBar();
    setupPing();
    scheduleVoiceLines();
    setupPointerInput();
    renderSkills();
    renderHotkeys();
    fitToScreen();
    window.addEventListener('resize', fitToScreen);
    window.addEventListener('blur', releaseAllKeys);

    if (location.protocol === 'file:') {
        const notice = document.getElementById('notice');
        notice.textContent = 'Sounds can\'t load from a file opened directly. Run a local web server instead (see README.md).';
        notice.hidden = false;
        return;
    }
    await showLoading(state.instrument);
    prefetchAll();
}

init();
