// ✅ OSCE Simulation App — Final Version with Smart Triggered Script Flow (with null check fix)

let isWaitingForReply = false;
let currentScenario = null;
let allScenarios = [];
let sessionEndTime;
let isRecording = false;
let lastMediaStream = null;
let isSpeaking = false;
let audioQueue = [];
window.currentSessionId = 'sess-' + Math.random().toString(36).slice(2) + '-' + Date.now();
window.__scriptFullyPlayed = false;
window.allowOnlyChildAfterScript = false;

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSQRS87vXmpyNTcClW-1oEgo7Uogzpu46M2V4f-Ii9UqgGfVGN2Zs-4hU17nDTEvvf7-nDe2vDnGa11/pub?gid=1523640544&single=true&output=csv';

const speakerVoices = {
  "MOTHER": {
    gender: "FEMALE",
    languageCode: "en-GB",
    pitch: -2,
    speakingRate: 0.92,
    name: "en-GB-Standard-A"
  },
  "CHILD": {
    gender: "FEMALE",
    languageCode: "en-US",
    pitch: 4,
    speakingRate: 1.2,
    name: "en-US-Standard-C"
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
        const cols = row.match(/(".*?"|[^",]+)(?=,|$)/g)?.map(x => x.replace(/^"|"$/g, '').trim()) || [];
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
      }).filter(s => s.id && s.title);
      allScenarios = scenarios;
      populateScenarioDropdown(scenarios);
      if (callback) callback(scenarios);
    })
    .catch(err => {
      console.error("Failed to fetch scenarios:", err);
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
  const parts = script.split(/\[(.*?)\]/).filter(Boolean);
  const sequence = [];
  for (let i = 0; i < parts.length - 1; i += 2) {
    const speaker = parts[i].toUpperCase().trim();
    const text = parts[i + 1].split(/---DOCTOR-INTERVENTION---/)[0].trim();
    if (speaker && text && !speaker.includes("DOCTOR")) {
      sequence.push({ speaker, text });
    }
  }
  return sequence;
}

function showReplyFromScript(script) {
  const sequence = parseMultiActorScript(script);
  sequence.forEach(part => {
    const el = document.createElement('p');
    el.style.marginTop = "10px";
    el.style.padding = "8px";
    el.style.borderRadius = "6px";
    el.style.backgroundColor = "#f2f2f2";
    el.innerHTML = `<b>${part.speaker}:</b> ${part.text}`;
    document.getElementById('chat-container').appendChild(el);
    queueAndSpeakReply(part.text, part.speaker);
  });
  window.__scriptFullyPlayed = true;
  window.allowOnlyChildAfterScript = true;
}

function queueAndSpeakReply(text, speakerOverride = null) {
  if (window.allowOnlyChildAfterScript && speakerOverride === "MOTHER") return;
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

  const voiceConfig = speakerVoices[speaker] || {
    gender: currentScenario?.gender || 'FEMALE',
    languageCode: currentScenario?.languageCode || 'en-GB',
    pitch: parseFloat(currentScenario?.pitch || 0),
    speakingRate: parseFloat(currentScenario?.speakingRate || 1)
  };
  if (speakerVoices[speaker]?.name) {
    voiceConfig.name = speakerVoices[speaker].name;
  }

  fetch('/.netlify/functions/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, ...voiceConfig })
  })
    .then(res => res.json())
    .then(data => {
      if (!data.audioContent) throw new Error("No audio content returned");
      const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
      window.activeScriptedAudio = audio;
      audio.play().catch(console.warn);
      audio.onended = () => { isSpeaking = false; playNextInQueue(); };
    })
    .catch(err => {
      console.warn("TTS error:", err);
      isSpeaking = false;
      playNextInQueue();
    });
}

function showReply(replyText, isError = false) {
  if (!replyText || typeof replyText !== 'string') {
    console.warn("Received empty or invalid replyText:", replyText);
    return;
  }
  const el = document.createElement('p');
  el.style.marginTop = "10px";
  el.style.padding = "8px";
  el.style.borderRadius = "6px";
  el.style.backgroundColor = isError ? "#ffecec" : "#f2f2f2";
  const visible = isError ? "⚠️ Patient: Sorry, I didn't catch that." : "🧑‍⚕️ Patient: " + replyText.trim();
  const voiceCleaned = replyText
    .replace(/\[(.*?)\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/^(\s*)(yeah|okay|well|alright|um+|mm+|ah+|eh+|uh+)[.,\s]*/i, '')
    .replace(/🧑‍⚕️|👩‍⚕️|👨‍⚕️/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  el.innerHTML = visible;
  document.getElementById('chat-container').appendChild(el);
  if (!isError) queueAndSpeakReply(voiceCleaned, "CHILD");
}

// ... rest of your code remains unchanged (station load, voice loop, etc.) ...
