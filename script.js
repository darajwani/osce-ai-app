// ✅ Final version with distinct voices and dual-speaker logic improvements

let isWaitingForReply = false;
let currentScenario = null;
let allScenarios = [];
let sessionEndTime;
let isRecording = false;
let lastMediaStream = null;
let isSpeaking = false;
let audioQueue = [];
window.currentSessionId = 'sess-' + Math.random().toString(36).slice(2) + '-' + Date.now();

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSQRS87vXmpyNTcClW-1oEgo7Uogzpu46M2V4f-Ii9UqgGfVGN2Zs-4hU17nDTEvvf7-nDe2vDnGa11/pub?gid=1523640544&single=true&output=csv';

const speakerVoices = {
  "MOTHER": {
    voiceName: "en-GB-Wavenet-F",
    languageCode: "en-GB",
    ssmlGender: "FEMALE",
    pitch: -2,
    speakingRate: 0.5
  },
  "CHILD": {
    voiceName: "en-GB-Wavenet-C",
    languageCode: "en-GB",
    ssmlGender: "FEMALE",
    pitch: 4,
    speakingRate: 1.5
  }
};

function showMicRecording(isRec) {
  const mic = document.getElementById("mic-icon");
  if (!mic) return;
  mic.classList.toggle("mic-recording", isRec);
}

function getScenarios(callback) {
  fetch(csvUrl)
    .then(res => res.text())
    .then(csv => {
      const rows = csv.split("\n").slice(1);
      const scenarios = rows.map(row => {
        const cols = row.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(x => x.replace(/^"|"$/g, '').trim()) || [];
        return {
          id: cols[0] || '',
          title: cols[1] || '',
          prompt_text: cols[2] || '',
          category: cols[3] || '',
          instructions: cols[4] || '',
          emotion: cols[5] || '',
          script: cols[6] || '',
          gender: cols[7] || 'FEMALE',
          languageCode: cols[8] || 'en-GB',
          styleTag: cols[9] || 'neutral',
          speakingRate: parseFloat(cols[10]) || 1,
          pitch: parseFloat(cols[11]) || 0
        };
      }).filter(s => s.title && s.id);
      allScenarios = scenarios;
      populateScenarioDropdown(scenarios);
      if (callback) callback(scenarios);
    });
}

function populateScenarioDropdown(scenarios) {
  const dropdown = document.getElementById("scenario-dropdown");
  dropdown.innerHTML = '<option value="">-- Select a scenario --</option>';
  scenarios.forEach(s => {
    const option = document.createElement("option");
    option.value = s.id;
    option.textContent = `${s.id} - ${s.title}`;
    dropdown.appendChild(option);
  });
}

function parseMultiActorScript(script) {
  const lines = script.split(/\n|\\n/).map(l => l.trim()).filter(Boolean);
  const sequence = [];
  for (const line of lines) {
    if (line.toUpperCase().includes("---DOCTOR-INTERVENTION---")) break;
    const match = line.match(/^\[(.*?)\]\s*(.*)$/);
    if (match) sequence.push({ speaker: match[1].toUpperCase(), text: match[2] });
  }
  return sequence;
}

function showReplyFromScript(script) {
  const sequence = parseMultiActorScript(script);
  for (const part of sequence) {
    const el = document.createElement('p');
    el.style.marginTop = "10px";
    el.style.padding = "8px";
    el.style.borderRadius = "6px";
    el.style.backgroundColor = "#f2f2f2";
    el.innerHTML = `<b>${part.speaker}:</b> ${part.text}`;
    document.getElementById('chat-container').appendChild(el);
    queueAndSpeakReply(part.text, part.speaker);
  }
}

function queueAndSpeakReply(text, speakerOverride = null) {
  audioQueue.push({ text, speaker: speakerOverride });
  if (!isSpeaking) playNextInQueue();
}

function playNextInQueue() {
  if (audioQueue.length === 0) {
    isSpeaking = false;
    return;
  }
  const { text, speaker } = audioQueue.shift();
  isSpeaking = true;
  const config = speakerVoices[speaker] || {
    gender: currentScenario?.gender || 'FEMALE',
    languageCode: currentScenario?.languageCode || 'en-GB',
    style: currentScenario?.styleTag || 'neutral',
    pitch: parseFloat(currentScenario?.pitch || 0),
    speakingRate: parseFloat(currentScenario?.speakingRate || 1)
  };
  fetch('/.netlify/functions/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      languageCode: config.languageCode,
      gender: config.ssmlGender,
      pitch: config.pitch,
      speakingRate: config.speakingRate,
      voiceName: config.voiceName
    })
  })
    .then(res => res.json())
    .then(data => {
      if (!data.audioContent) return;
      const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
      audio.play().catch(console.warn);
      audio.onended = () => { isSpeaking = false; playNextInQueue(); };
    })
    .catch(err => { console.warn("TTS error", err); isSpeaking = false; playNextInQueue(); });
}

// Other functions stay the same...
// If you need those too, let me know and I’ll send them separately to avoid redundancy.

window.addEventListener('DOMContentLoaded', () => {
  getScenarios();
});
