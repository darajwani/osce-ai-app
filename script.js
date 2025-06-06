// Top-level state
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
          id: cols[0] || '', title: cols[1] || '', prompt_text: cols[2] || '',
          category: cols[3] || '', instructions: cols[4] || '', emotion: cols[5] || '',
          script: cols[6] || '', gender: cols[7] || 'FEMALE', languageCode: cols[8] || 'en-GB',
          styleTag: cols[9] || 'neutral', speakingRate: parseFloat(cols[10]) || 1,
          pitch: parseFloat(cols[11]) || 0, name: cols[12] || ''
        };
      }).filter(s => s.id && s.title);
      allScenarios = scenarios;
      populateScenarioDropdown(scenarios);
      if (callback) callback(scenarios);
    })
    .catch(err => console.error("Failed to fetch scenarios:", err));
}

function populateScenarioDropdown(scenarios) {
  const dropdown = document.getElementById("scenario-dropdown");
  if (!dropdown) return;
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
  for (const part of sequence) {
    const el = document.createElement('p');
    el.style.marginTop = "10px";
    el.style.padding = "8px";
    el.style.borderRadius = "6px";
    el.style.backgroundColor = "#f2f2f2";
    el.innerHTML = `<b>${part.speaker}:</b> ${part.text}`;
    const container = document.getElementById('chat-container');
    if (container) container.appendChild(el);
    queueAndSpeakReply(part.text, part.speaker);
  }
}

function queueAndSpeakReply(text, speakerOverride = null) {
  audioQueue.push({ text, speaker: speakerOverride });
  if (!isSpeaking) playNextInQueue();
}

function playNextInQueue() {
  if (audioQueue.length === 0) return void (isSpeaking = false);
  const { text, speaker } = audioQueue.shift();
  isSpeaking = true;

  let voiceConfig;

  if (currentScenario?.id === "64") {
    if (speaker === "MOTHER") {
      voiceConfig = { gender: "FEMALE", languageCode: currentScenario.languageCode || "en-GB", pitch: -6, speakingRate: 0.8 };
    } else if (speaker === "CHILD") {
      voiceConfig = { gender: "FEMALE", languageCode: currentScenario.languageCode || "en-GB", pitch: 6, speakingRate: 1.2 };
    }
  }

  if (!voiceConfig) {
    const matchByName = allScenarios.find(s => s.name?.toUpperCase() === speaker?.toUpperCase());
    if (matchByName) {
      voiceConfig = {
        gender: matchByName.gender || 'FEMALE', languageCode: matchByName.languageCode || 'en-GB',
        pitch: parseFloat(matchByName.pitch || 0), speakingRate: parseFloat(matchByName.speakingRate || 1)
      };
    } else {
      voiceConfig = {
        gender: currentScenario?.gender || 'FEMALE', languageCode: currentScenario?.languageCode || 'en-GB',
        pitch: parseFloat(currentScenario?.pitch || 0), speakingRate: parseFloat(currentScenario?.speakingRate || 1)
      };
    }
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
      audio.play().catch(console.warn);
      audio.onended = () => { isSpeaking = false; playNextInQueue(); };
    })
    .catch(err => {
      console.warn("TTS error:", err);
      isSpeaking = false;
      playNextInQueue();
    });
}

document.getElementById("start-random-btn").addEventListener("click", () => {
  if (allScenarios.length === 0) return;
  const randomScenario = allScenarios[Math.floor(Math.random() * allScenarios.length)];
  loadScenario(randomScenario);
});

document.getElementById("scenario-dropdown").addEventListener("change", (e) => {
  const selectedId = e.target.value;
  const selectedScenario = allScenarios.find(s => s.id === selectedId);
  if (selectedScenario) loadScenario(selectedScenario);
});

function loadScenario(scenario) {
  currentScenario = scenario;
  isRecording = false;
  showMicRecording(false);
  document.getElementById("scenario-title").textContent = scenario.title;
  document.getElementById("scenario-text").textContent = scenario.prompt_text;
  document.getElementById("scenario-box").style.display = "block";
  document.getElementById("chat-container").innerHTML = "<b>AI Replies:</b><br>";
  document.getElementById("start-station-btn").style.display = "inline-block";
  document.getElementById("stop-station-btn").style.display = "none";
}

document.getElementById("start-station-btn").addEventListener("click", () => {
  document.getElementById("start-station-btn").style.display = "none";
  document.getElementById("stop-station-btn").style.display = "inline-block";
  document.getElementById("chat-container").style.display = "block";
  startTimer(300);
  sessionEndTime = Date.now() + 5 * 60 * 1000;
  isRecording = true;

  let hasFirstReplyHappened = false;

  function showReply(replyText, isError = false) {
    const el = document.createElement('p');
    el.style.marginTop = "10px";
    el.style.padding = "8px";
    el.style.borderRadius = "6px";
    el.style.backgroundColor = isError ? "#ffecec" : "#f2f2f2";
    const visible = isError ? "⚠️ Patient: Sorry, I didn't catch that. Could you repeat?" :
      "🧑‍⚕️ Patient: " + replyText.replace(/\s+/g, ' ').trim();
    const voiceCleaned = replyText
      .replace(/\[(.*?)\]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/\b(um+|mm+|ah+|eh+|uh+|yeah)[.,]?/gi, '')
      .replace(/[🧑‍⚕️👩‍⚕️👨‍⚕️]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    el.innerHTML = visible;
    document.getElementById('chat-container').appendChild(el);
    if (!isError && replyText) queueAndSpeakReply(voiceCleaned);

    // Trigger scripted argument only after first reply
    if (!hasFirstReplyHappened && currentScenario?.id === "64" && currentScenario?.script && /\[.*?\]/.test(currentScenario.script.trim())) {
      hasFirstReplyHappened = true;
      setTimeout(() => showReplyFromScript(currentScenario.script), 500);
    }
  }

  startVoiceLoopWithVAD('https://hook.eu2.make.com/gotjtejc6e7anjxxikz5fciwcl1m2nj2', showReply);
});

document.getElementById("stop-station-btn").addEventListener("click", () => location.reload());

function startTimer(duration) {
  let timer = duration;
  const timerDisplay = document.getElementById("timer");
  const interval = setInterval(() => {
    const minutes = Math.floor(timer / 60);
    const seconds = timer % 60;
    timerDisplay.textContent = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
    if (--timer < 0) {
      clearInterval(interval);
      alert("OSCE session complete!");
      isRecording = false;
      showMicRecording(false);
      if (lastMediaStream) lastMediaStream.getTracks().forEach(t => t.stop());
    }
  }, 1000);
}

async function startVoiceLoopWithVAD(makeWebhookUrl, onReply) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  lastMediaStream = stream;
  let recorder = null;
  let chunks = [];

  const myvad = await vad.MicVAD.new({
    onSpeechStart: () => {
      showMicRecording(true);
      chunks = [];
      recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      recorder.ondataavailable = e => e.data.size > 0 && chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        sendToMake(blob, makeWebhookUrl, (reply, error) => {
          if (reply) onReply(reply);
          else onReply(null, true);
        });
      };
      recorder.start();
    },
    onSpeechEnd: () => {
      showMicRecording(false);
      if (recorder?.state === 'recording') recorder.stop();
    },
    modelURL: "./vad/silero_vad.onnx"
  });

  myvad.start();

  setTimeout(() => {
    isRecording = false;
    myvad.destroy();
    stream.getTracks().forEach(track => track.stop());
    showMicRecording(false);
  }, 5 * 60 * 1000);
}

function sendToMake(blob, url, onReply) {
  if (isWaitingForReply) return;
  isWaitingForReply = true;
  const formData = new FormData();
  formData.append('file', blob, 'audio.webm');
  if (currentScenario?.id) formData.append('id', currentScenario.id);
  if (window.currentSessionId) formData.append('session_id', window.currentSessionId);

  fetch(url, { method: 'POST', body: formData })
    .then(async res => {
      const raw = await res.text();
      try {
        const json = JSON.parse(raw);
        const decoded = atob(json.reply);
        const bytes = Uint8Array.from(decoded, c => c.charCodeAt(0));
        const cleanedReply = new TextDecoder('utf-8').decode(bytes).trim();
        onReply(cleanedReply);
      } catch (e) {
        console.error("Failed to decode:", e);
        onReply(null, true);
      }
      isWaitingForReply = false;
    })
    .catch(err => {
      console.error("Fetch error:", err);
      onReply(null, true);
      isWaitingForReply = false;
    });
}

window.addEventListener("DOMContentLoaded", () => getScenarios());
