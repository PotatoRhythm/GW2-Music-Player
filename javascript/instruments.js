const INSTRUMENTS = {
    piano: {
        name: 'Ornate Grand Piano', icon: 'piano.png',
        layout: 'standard', root: 48, octaves: 3, start: 1, sharps: true,
    },
    minstrel: {
        name: 'Musical Minstrel', icon: 'minstrel.png',
        layout: 'standard', root: 48, octaves: 3, start: 1,
    },
    harp: {
        name: 'Musical Harp', icon: 'harp.png',
        layout: 'standard', root: 48, octaves: 3, start: 1,
    },
    lute: {
        name: 'Musical Lute', icon: 'lute.png',
        layout: 'standard', root: 48, octaves: 3, start: 1,
    },
    bass: {
        name: 'Musical Bass Guitar', icon: 'bass.png',
        layout: 'standard', root: 36, octaves: 2, start: 0, mono: 'always',
    },
    bell: {
        name: 'Magnanimous Choir Bell', icon: 'bell.png',
        layout: 'standard', root: 60, octaves: 2, start: 0,
    },
    choirbell: {
        name: 'Unbreakable Choir Bell', icon: 'choirbell.png',
        layout: 'standard', root: 50, octaves: 3, start: 1, noteInterval: 0.25,
    },
    flute: {
        name: 'Flute', icon: 'flute.png',
        layout: 'flute', root: 64, octaves: 2, start: 0, mono: true,
        release: 'toggle', freeRelease: 'hold', loop: true, attack: 0.3, noteLength: 5,
        releaseFade: 0.07, freeReleaseFade: 0.35,
    },
    horn: {
        name: "Marriner's Horn", icon: 'horn.png',
        layout: 'standard', root: 52, octaves: 3, start: 1, mono: true, release: 'hold',
        startDelay: 0.2, chainWindow: 0.1, releaseFade: 0.4, noteLength: 5, extend: { from: 0.5, crossfade: 0.3 },
    },
    verdarach: {
        name: 'Musical Verdarach', icon: 'verdarach.png',
        layout: 'standard', root: 24, octaves: 3, start: 1, mono: true, freeRelease: 'hold',
    },
    drums: {
        name: 'Black Lion Drum Set', icon: 'drumset.png',
        layout: 'drums',
    },
    framedrum: {
        name: 'Musical Frame Drum', icon: 'framedrum.png',
        layout: 'drums', noteInterval: 0.2,
    },
    organ: {
        name: 'Pipe Organ', icon: 'organ.png',
        layout: 'organ', root: 36, octaves: 3, start: 1, mono: true, loop: true,
        release: 'ring', freeRelease: 'hold', noteLength: 5, noteInterval: 4.85, queueWindow: 0.6,
        showAllHeld: true,
    },
    quagganorgan: {
        name: 'Quaggan Organ', icon: 'quagganorgan.png',
        layout: 'organ', root: 36, octaves: 3, start: 1, mono: true, release: 'hold', loop: true,
        noteInterval: 0.2, noteCooldown: 0.5,
    },
};

const BLACK_LION_DRUM_SET = {
    sounds: {
        bass:        { name: 'Bass Drum',              icon: 'skill1.png',  group: 0,  variations: 5 },
        snare:       { name: 'Snare Drum',             icon: 'skill2.png',  group: 1,  variations: 5 },
        crossstick:  { name: 'Snare Drum Cross Stick', icon: 'skill3.png',  group: 2,  variations: 5 },
        ghost:       { name: 'Ghost Note Snare Drum',  icon: 'skill6.png',  group: 3,  variations: 5 },
        hightom:     { name: 'High Tom',               icon: 'skill5.png',  group: 4,  variations: 5 },
        midtom:      { name: 'Mid Tom',                icon: 'skill4.png',  group: 5,  variations: 5 },
        floortom:    { name: 'Floor Tom',              icon: 'skill7.png',  group: 6,  variations: 5 },
        crash:       { name: 'Crash Cymbal',           icon: 'skillF1.png', group: 7,  variations: 5 },
        ride:        { name: 'Ride Cymbal',            icon: 'skillF2.png', group: 8,  variations: 5 },
        hihatclosed: { name: 'Hi-Hat Closed',          icon: 'skillF3.png', group: 9,  variations: 10, chokes: ['hihatopen'] },
        hihatopen:   { name: 'Hi-Hat Open',            icon: 'skillF4.png', group: 10, variations: 5 },
        hihatfoot:   { name: 'Hi-Hat Foot',            icon: 'skillF5.png', group: 11, variations: 5,  chokes: ['hihatopen'] },
    },
    pads: {
        s1: 'bass', s2: 'bass', s3: 'snare', s4: 'snare', s5: 'crossstick',
        s6: 'ghost', s7: 'ghost', s8: 'hightom', s9: 'midtom', s10: 'floortom',
        f1: 'crash', f2: 'ride', f3: 'hihatclosed', f4: 'hihatopen', f5: 'hihatfoot',
    },
};

const MUSICAL_FRAME_DRUM = {
    sounds: {
        drum1:   { name: 'Drum #1',  icon: 'framedrum_1.png',       group: 0, variations: 8 },
        drum2:   { name: 'Drum #2',  icon: 'framedrum_2.png',       group: 2, variations: 13 },
        drum3:   { name: 'Drum #3',  icon: 'framedrum_3.png',       group: 1, variations: 9 },
        drum4:   { name: 'Drum #4',  icon: 'framedrum_4.png',       group: 3, variations: 10 },
        rimshot: { name: 'Rim Shot', icon: 'framedrum_rimshot.png', group: 4, variations: 7 },
    },
    pads: { s1: 'drum1', s2: 'drum2', s3: 'drum3', s4: 'drum4', s5: 'rimshot' },
};

const LUTE_CHORDS = {
    id: 'chords', name: 'Chords',
    sounds: {
        c:    { name: 'C Major Chord',      icon: 'skill1.png', group: 0, variations: 6 },
        dm:   { name: 'D Minor Chord',      icon: 'skill2.png', group: 1, variations: 6 },
        em:   { name: 'E Minor Chord',      icon: 'skill3.png', group: 2, variations: 6 },
        f:    { name: 'F Major Chord',      icon: 'skill4.png', group: 3, variations: 6 },
        g:    { name: 'G Major Chord',      icon: 'skill5.png', group: 4, variations: 6 },
        am:   { name: 'A Minor Chord',      icon: 'skill6.png', group: 5, variations: 6 },
        bdim: { name: 'B Diminished Chord', icon: 'skill7.png', group: 6, variations: 6 },
    },
    pads: { s1: 'c', s2: 'dm', s3: 'em', s4: 'f', s5: 'g', s6: 'am', s7: 'bdim' },
};

const BASS_LOOPS = {
    id: 'loops', name: 'Preset Loops', pulse: true, // always start on the beat, even when unlocked
    tempoSlot: 's10', // the top octave, so the tempo skill takes the place of octave up
    sounds: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map(n =>
        [`loop${n}`, { name: `Preset Loop ${n}`, icon: `skill${n}.png`, group: n - 1, variations: 1 }])),
    pads: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map(n => [`s${n}`, `loop${n}`])),
};


function pianoChords(id, quality) {
    const roots = [
        ['c', 'C', 0, 's1'], ['cs', 'C sharp', 1, 'f1'], ['d', 'D', 2, 's2'], ['eb', 'Eb', 3, 'f2'],
        ['e', 'E', 4, 's3'], ['f', 'F', 5, 's4'], ['fs', 'F sharp', 6, 'f3'], ['g', 'G', 7, 's5'],
        ['ab', 'Ab', 8, 'f4'], ['a', 'A', 9, 's6'], ['bb', 'Bb', 10, 'f5'], ['b', 'B', 11, 's7'],
    ];
    const icon = slot => `skill${slot[0] === 'f' ? 'F' + slot.slice(1) : slot.slice(1)}.png`;
    return {
        id, name: `${quality} Chords`,
        sounds: Object.fromEntries(roots.map(([key, name, group, slot]) =>
            [key, { name: `${name} ${quality} Chord`, icon: icon(slot), group, variations: 1 }])),
        pads: Object.fromEntries(roots.map(([key, , , slot]) => [slot, key])),
    };
}

INSTRUMENTS.piano.modes = [pianoChords('minor', 'Minor'), pianoChords('major', 'Major')];
INSTRUMENTS.lute.modes = [LUTE_CHORDS];
INSTRUMENTS.bass.modes = [BASS_LOOPS];

INSTRUMENTS.piano.tempo = true;
INSTRUMENTS.lute.tempo = true;
INSTRUMENTS.bass.tempo = true;
INSTRUMENTS.drums.kit = BLACK_LION_DRUM_SET;
INSTRUMENTS.framedrum.kit = MUSICAL_FRAME_DRUM;
