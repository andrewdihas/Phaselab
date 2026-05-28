const noteFrequencies = {
    "C3": 130.81, "C#3": 138.59, "D3": 146.83, "D#3": 155.56, "E3": 164.81, "F3": 174.61, 
    "F#3": 185.00, "G3": 196.00, "G#3": 207.65, "A3": 220.00, "A#3": 233.08, "B3": 246.94,
    "C4": 261.63, "C#4": 277.18, "D4": 293.66, "D#4": 311.13, "E4": 329.63, "F4": 349.23, 
    "F#4": 369.99, "G4": 392.00, "G#4": 415.30, "A4": 440.00, "A#4": 466.16, "B4": 493.88,
    "C5": 523.25, "C#5": 554.37, "D5": 587.33, "D#5": 622.25, "E5": 659.25, "F5": 698.46, 
    "F#5": 739.99, "G5": 783.99, "G#5": 830.61, "A5": 880.00, "A#5": 932.33, "B5": 987.77,
    "C6": 1046.50
};

const drumTypes = ["Crash", "Ride", "TomH", "TomL", "OpenHat", "HiHat", "Snare", "Kick"];

let audioCtx = null;
let masterGainNode = null;
let filterNode = null;
let driveNode = null;
let pannerNode = null;
let delayNode = null;
let delayFeedback = null;
let analyserNode = null;
let dataArray = null;
let bufferLength = 0;
let canvas = null;
let canvasCtx = null;

let activeOscillators = {};
let pressedComputerKeys = {};

let isPlaying = false;
let currentStep = 0;
let playbackInterval = null;
let metronomeOn = false;
const totalSteps = 288;

let currentPattern = "1";
let sequencerData = { "1": {}, "2": {}, "3": {}, "4": {} };

const computerKeyboardMap = {
    'a': 'C4', 'w': 'C#4', 's': 'D4', 'e': 'D#4', 'd': 'E4', 'f': 'F4', 't': 'F#4',
    'g': 'G4', 'y': 'G#4', 'h': 'A4', 'u': 'A#4', 'j': 'B4', 'k': 'C5', 'o': 'C#5',
    'l': 'D5', 'p': 'D#5', ';': 'E5', "'": 'F5'
};

function makeDistortionCurve(amount) {
    const k = typeof amount === 'number' ? amount : 0;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
        const x = (i * 2) / n_samples - 1;
        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
}

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        masterGainNode = audioCtx.createGain();
        masterGainNode.gain.value = parseFloat(document.getElementById('volume').value) * 0.5; 
        masterGainNode.connect(audioCtx.destination);
        
        filterNode = audioCtx.createBiquadFilter();
        filterNode.type = 'lowpass';
        const sliderVal = parseFloat(document.getElementById('cutoff').value);
        const fraction = (sliderVal - 20) / (20000 - 20);
        filterNode.frequency.value = 20 * Math.pow(20000 / 20, fraction);

        driveNode = audioCtx.createWaveShaper();
        const initialDrive = parseFloat(document.getElementById('drive').value);
        driveNode.curve = makeDistortionCurve(initialDrive);
        driveNode.oversample = '4x';

        pannerNode = audioCtx.createStereoPanner();
        pannerNode.pan.value = parseFloat(document.getElementById('pan').value);

        delayNode = audioCtx.createDelay(2.0);
        delayNode.delayTime.value = 0.33; 
        delayFeedback = audioCtx.createGain();
        delayFeedback.gain.value = parseFloat(document.getElementById('delay').value);

        filterNode.connect(driveNode);
        driveNode.connect(pannerNode);
        
        pannerNode.connect(masterGainNode); 
        
        pannerNode.connect(delayNode);
        delayNode.connect(delayFeedback);
        delayFeedback.connect(delayNode);
        delayNode.connect(masterGainNode);

        analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 2048;
        masterGainNode.connect(analyserNode); 

        bufferLength = analyserNode.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        canvas = document.getElementById('oscilloscreen');
        canvasCtx = canvas.getContext('2d');
        resizeCanvas();
        
        draw();
    }
}

function draw() {
    requestAnimationFrame(draw);
    if (!analyserNode) return;

    analyserNode.getByteTimeDomainData(dataArray);

    canvasCtx.fillStyle = '#050607';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = '#00ffcc';
    canvasCtx.beginPath();

    let sliceWidth = canvas.width * 1.0 / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        let v = dataArray[i] / 128.0;
        let y = v * canvas.height / 2;

        if (i === 0) {
            canvasCtx.moveTo(x, y);
        } else {
            canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
    }

    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();
}

function playDrum(type) {
    initAudio();
    const time = audioCtx.currentTime;

    if (type === 'Kick') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(masterGainNode);
        
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.15);
        
        gain.gain.setValueAtTime(3.5, time); // Boosted heavily for a louder kick
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
        
        osc.start(time);
        osc.stop(time + 0.15);
    } else if (type === 'Snare') {
        const osc = audioCtx.createOscillator();
        const oscGain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.connect(oscGain);
        oscGain.connect(masterGainNode);
        
        osc.frequency.setValueAtTime(250, time);
        oscGain.gain.setValueAtTime(0.7, time);
        oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
        osc.start(time);
        osc.stop(time + 0.1);

        const bufferSize = audioCtx.sampleRate * 0.2;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        
        const noiseFilter = audioCtx.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 1000;
        
        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(1, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
        
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(masterGainNode);
        noise.start(time);
    } else if (type === 'HiHat' || type === 'OpenHat') {
        const duration = type === 'HiHat' ? 0.05 : 0.3;
        const bufferSize = audioCtx.sampleRate * duration;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        
        const noiseFilter = audioCtx.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 7000;
        
        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.7, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, time + duration);
        
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(masterGainNode);
        noise.start(time);
    } else if (type === 'TomL' || type === 'TomH') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(masterGainNode);
        const freq = type === 'TomH' ? 150 : 90;
        osc.frequency.setValueAtTime(freq, time);
        osc.frequency.exponentialRampToValueAtTime(10, time + 0.3);
        gain.gain.setValueAtTime(0.8, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
        osc.start(time);
        osc.stop(time + 0.3);
    } else if (type === 'Crash' || type === 'Ride') {
        const duration = type === 'Crash' ? 1.8 : 0.9;
        const oscGain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();
        
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(type === 'Crash' ? 5500 : 7500, time);
        
        oscGain.connect(filter);
        filter.connect(masterGainNode);
        
        // Metallic inharmonic ratios
        const ratios = [1.0, 1.34, 1.42, 1.53, 1.68, 1.95];
        const baseFreq = type === 'Crash' ? 350 : 450;
        
        ratios.forEach(ratio => {
            const osc = audioCtx.createOscillator();
            osc.type = 'square';
            osc.frequency.setValueAtTime(baseFreq * ratio, time);
            osc.connect(oscGain);
            osc.start(time);
            osc.stop(time + duration);
        });
        
        oscGain.gain.setValueAtTime(0.15, time); // Keep it low so the squares don't clip
        oscGain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    }
}

function playNote(note, keyElement) {
    initAudio();

    if (drumTypes.includes(note)) {
        playDrum(note);
        if (keyElement) keyElement.classList.add('active');
        return;
    }

    if (activeOscillators[note]) return;

    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    const waveform = document.getElementById('waveform').value;
    const attackTime = parseFloat(document.getElementById('attack').value);
    
    const freq = noteFrequencies[note];
    osc.type = waveform;
    osc.frequency.value = freq;
    
    const intensityCompensation = Math.max(0.45, Math.min(1.0, freq / 440));
    
    oscGain.gain.setValueAtTime(0, audioCtx.currentTime);
    oscGain.gain.linearRampToValueAtTime(intensityCompensation, audioCtx.currentTime + attackTime);
    
    osc.connect(oscGain);
    oscGain.connect(filterNode);
    osc.start();
    
    activeOscillators[note] = { osc, oscGain };
    if (keyElement) keyElement.classList.add('active');
}

function stopNote(note, keyElement) {

    if (drumTypes.includes(note)) {
        if (keyElement) keyElement.classList.remove('active');
        return; 
    }

    if (activeOscillators[note]) {
        const { osc, oscGain } = activeOscillators[note];
        const releaseTime = parseFloat(document.getElementById('release').value);
        
        oscGain.gain.setValueAtTime(oscGain.gain.value, audioCtx.currentTime);
        oscGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + releaseTime);
        
        osc.stop(audioCtx.currentTime + releaseTime);
        
        setTimeout(() => {
            osc.disconnect();
            oscGain.disconnect();
        }, releaseTime * 1000 + 50);

        delete activeOscillators[note];
    }
    if (keyElement) keyElement.classList.remove('active');
}

function startSequence() {
    if (isPlaying) return;
    initAudio();
    isPlaying = true;
    document.getElementById('playBtn').classList.add('playing');
    
    const bpm = parseInt(document.getElementById('bpmInput').value) || 120;
    const stepTimeMs = (60000 / bpm) / 4; 

    playbackInterval = setInterval(() => {
        triggerSequenceStep();
    }, stepTimeMs);
}

function stopSequence() {
    if (!isPlaying) return;
    isPlaying = false;
    document.getElementById('playBtn').classList.remove('playing');
    clearInterval(playbackInterval);
    
    document.querySelectorAll('.grid-cell').forEach(cell => {
        cell.classList.remove('playing-step');
    });
    document.querySelectorAll('.timeline-step').forEach(step => {
        step.classList.remove('active-step');
    });
    
    currentStep = 0;
}

function triggerSequenceStep() {
    document.querySelectorAll('.grid-cell').forEach(cell => {
        cell.classList.remove('playing-step');
    });
    document.querySelectorAll('.timeline-step').forEach(step => {
        step.classList.remove('active-step');
    });

    const timelineSteps = document.querySelectorAll('.timeline-step');
    if (timelineSteps[currentStep]) {
        timelineSteps[currentStep].classList.add('active-step');
    }

    if (metronomeOn && currentStep % 4 === 0) {
        const clickOsc = audioCtx.createOscillator();
        const clickGain = audioCtx.createGain();
        clickOsc.type = 'triangle';
        clickOsc.frequency.setValueAtTime(currentStep === 0 ? 880 : 440, audioCtx.currentTime);
        clickGain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        clickGain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.04);
        
        clickOsc.connect(clickGain);
        clickGain.connect(audioCtx.destination);
        clickOsc.start();
        clickOsc.stop(audioCtx.currentTime + 0.05);
    }

    const currentCells = document.querySelectorAll(`.grid-cell[data-step="${currentStep}"]`);
    
    currentCells.forEach(cell => {
        cell.classList.add('playing-step');
        
        if (cell.classList.contains('active-block')) {
            const note = cell.dataset.note;
            const dummyKey = document.querySelector(`.key[data-note="${note}"]`);
            const cellKey = `${note}-${currentStep}`; 
            
            playNote(note, dummyKey);
            
            const bpm = parseInt(document.getElementById('bpmInput').value) || 120;
            const baseStepTimeMs = (60000 / bpm) / 4;
            
            let stepMultiplier = sequencerData[currentPattern][cellKey];
            if (stepMultiplier === true) stepMultiplier = 1; // Failsafe for older saves
            if (!stepMultiplier) stepMultiplier = 1;
            
            const durationMs = (baseStepTimeMs * stepMultiplier) - 15;
            
            setTimeout(() => {
                stopNote(note, dummyKey);
            }, durationMs);
        }
    });

    currentStep = (currentStep + 1) % totalSteps;
}

function updatePatternGridDisplay() {
    document.querySelectorAll('.grid-cell').forEach(cell => {
        const cellKey = `${cell.dataset.note}-${cell.dataset.step}`;
        if (sequencerData[currentPattern][cellKey]) {
            cell.classList.add('active-block');
        } else {
            cell.classList.remove('active-block');
        }
    });
}

function generatePianoRoll() {
    const noteGrid = document.getElementById('noteGrid');
    const timelineBar = document.querySelector('.timeline-bar');
    if (!noteGrid || !timelineBar) return;

    noteGrid.innerHTML = '';
    timelineBar.innerHTML = '';

    timelineBar.style.gridTemplateColumns = `60px repeat(${totalSteps}, minmax(40px, 1fr))`;

    const spacer = document.createElement('div');
    spacer.className = 'row-label';
    spacer.style.borderBottom = 'none';
    timelineBar.appendChild(spacer);

    for (let i = 1; i <= totalSteps; i++) {
        const stepNum = document.createElement('div');
        stepNum.className = 'timeline-step';
        stepNum.textContent = i < 10 ? '0' + i : i;
        
        stepNum.addEventListener('mousedown', () => {
            currentStep = i - 1;
            document.querySelectorAll('.timeline-step').forEach(s => s.classList.remove('active-step'));
            stepNum.classList.add('active-step');
        });

        timelineBar.appendChild(stepNum);
    }

    const notesInOrder = [...drumTypes, ...Object.keys(noteFrequencies).reverse()];

    notesInOrder.forEach(note => {
        const row = document.createElement('div');
        row.className = 'grid-row';
        
        if (note === drumTypes[drumTypes.length - 1]) {
            row.classList.add('drum-divider');
        }

        row.style.gridTemplateColumns = `60px repeat(${totalSteps}, minmax(40px, 1fr))`;

        const label = document.createElement('div');
        label.className = 'row-label';
        label.textContent = note;
        row.appendChild(label);

        for (let step = 0; step < totalSteps; step++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.dataset.note = note;
            cell.dataset.step = step;

            cell.addEventListener('mousedown', () => {
                const cellKey = `${note}-${step}`;
                if (sequencerData[currentPattern][cellKey]) {
                    delete sequencerData[currentPattern][cellKey];
                    cell.classList.remove('active-block');
                } else {
                    const noteLength = parseFloat(document.getElementById('noteLengthSelect').value) || 1;
                    sequencerData[currentPattern][cellKey] = noteLength;
                    cell.classList.add('active-block');
                    const dummyKey = document.querySelector(`.key[data-note="${note}"]`);
                    playNote(note, dummyKey);
                    setTimeout(() => {
                        stopNote(note, dummyKey);
                    }, 150);
                }
            });

            row.appendChild(cell);
        }

        noteGrid.appendChild(row);
    });
}

function resizeCanvas() {
    if (canvas && canvasCtx) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    }
}

window.addEventListener('resize', resizeCanvas);

window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') return;

    const key = e.key.toLowerCase();
    if (computerKeyboardMap[key]) {
        const targetNote = computerKeyboardMap[key];
        pressedComputerKeys[key] = targetNote;
        const keyElement = document.querySelector(`.key[data-note="${targetNote}"]`);
        playNote(targetNote, keyElement);
    }
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (pressedComputerKeys[key]) {
        const targetNote = pressedComputerKeys[key];
        delete pressedComputerKeys[key];
        const keyElement = document.querySelector(`.key[data-note="${targetNote}"]`);
        stopNote(targetNote, keyElement);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('oscilloscreen');
    generatePianoRoll();
    resizeCanvas();
    
    const keys = document.querySelectorAll('.key');
    keys.forEach(key => {
        const note = key.getAttribute('data-note');
        key.addEventListener('mousedown', () => playNote(note, key));
        key.addEventListener('mouseup', () => stopNote(note, key));
        key.addEventListener('mouseleave', () => stopNote(note, key));
    });

    document.getElementById('playBtn').addEventListener('click', startSequence);
    document.getElementById('stopBtn').addEventListener('click', stopSequence);
    
    document.getElementById('clearBtn').addEventListener('click', () => {
        stopSequence();
        sequencerData[currentPattern] = {};
        document.querySelectorAll('.grid-cell').forEach(cell => {
            cell.classList.remove('active-block');
        });
    });

    document.getElementById('metroBtn').addEventListener('click', (e) => {
        metronomeOn = !metronomeOn;
        e.target.classList.toggle('metro-on', metronomeOn);
    });

    document.getElementById('patternSelect').addEventListener('change', (e) => {
        currentPattern = e.target.value;
        updatePatternGridDisplay();
    });

    document.getElementById('bpmInput').addEventListener('change', () => {
        if (isPlaying) {
            stopSequence();
            startSequence();
        }
    });

    document.getElementById('cutoff').addEventListener('input', (e) => {
        if (filterNode) {
            const sliderVal = parseFloat(e.target.value);
            const fraction = (sliderVal - 20) / (20000 - 20);
            const val = 20 * Math.pow(20000 / 20, fraction);
            filterNode.frequency.setValueAtTime(val, audioCtx.currentTime);
        }
    });

    document.getElementById('drive').addEventListener('input', (e) => {
        if (driveNode) {
            driveNode.curve = makeDistortionCurve(parseFloat(e.target.value));
        }
    });

    document.getElementById('pan').addEventListener('input', (e) => {
        if (pannerNode) {
            pannerNode.pan.setValueAtTime(parseFloat(e.target.value), audioCtx.currentTime);
        }
    });

    document.getElementById('delay').addEventListener('input', (e) => {
        if (delayFeedback) {
            delayFeedback.gain.setValueAtTime(parseFloat(e.target.value), audioCtx.currentTime);
        }
    });

    document.getElementById('volume').addEventListener('input', (e) => {
        if (masterGainNode) {
            masterGainNode.gain.setValueAtTime(parseFloat(e.target.value) * 0.5, audioCtx.currentTime);
        }
    });

    document.getElementById('exportBtn').addEventListener('click', () => {
        const projectData = {
            settings: {
                bpm: document.getElementById('bpmInput').value,
                waveform: document.getElementById('waveform').value,
                attack: document.getElementById('attack').value,
                release: document.getElementById('release').value,
                cutoff: document.getElementById('cutoff').value,
                drive: document.getElementById('drive').value,
                pan: document.getElementById('pan').value,
                volume: document.getElementById('volume').value
            },
            sequencerData: sequencerData
        };

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(projectData));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "fl_project.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });

    document.getElementById('importBtn').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parsed = JSON.parse(event.target.result);
                
                if (parsed.settings && parsed.sequencerData) {
                    sequencerData = parsed.sequencerData;
                    
                    document.getElementById('bpmInput').value = parsed.settings.bpm;
                    document.getElementById('waveform').value = parsed.settings.waveform;
                    document.getElementById('attack').value = parsed.settings.attack;
                    document.getElementById('release').value = parsed.settings.release;
                    document.getElementById('cutoff').value = parsed.settings.cutoff;
                    document.getElementById('drive').value = parsed.settings.drive;
                    document.getElementById('pan').value = parsed.settings.pan;
                    document.getElementById('volume').value = parsed.settings.volume;
                    document.getElementById('delay').value = parsed.settings.delay || 0;
                    
                    if (masterGainNode) masterGainNode.gain.setValueAtTime(parseFloat(parsed.settings.volume) * 0.5, audioCtx.currentTime);
                    if (filterNode) {
                        const sliderVal = parseFloat(parsed.settings.cutoff);
                        const fraction = (sliderVal - 20) / (20000 - 20);
                        filterNode.frequency.setValueAtTime(20 * Math.pow(20000 / 20, fraction), audioCtx.currentTime);
                    }
                    if (driveNode) driveNode.curve = makeDistortionCurve(parseFloat(parsed.settings.drive));
                    if (pannerNode) pannerNode.pan.setValueAtTime(parseFloat(parsed.settings.pan), audioCtx.currentTime);
                } else {
                    sequencerData = parsed;
                }
                    if (delayFeedback) delayFeedback.gain.setValueAtTime(parseFloat(parsed.settings.delay || 0), audioCtx.currentTime);
                
                updatePatternGridDisplay();
            } catch (error) {
                alert("That is a terrible method. You must upload a valid .json project file.");
            }
        };
        reader.readAsText(file);
        e.target.value = ''; 
    });

});