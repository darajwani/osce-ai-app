let isWaitingForReply = false;
let currentScenario = null;
let sessionEndTime;
let isRecording = false;
let lastMediaStream = null;
let isSpeaking = false;
let audioQueue = [];
let allScenarios = [];
window.currentSessionId = 'sess-' + Math.random().toString(36).slice(2) + '-' + Date.now();

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSQRS87vXmpyNTcClW-1oEgo7Uogzpu46M2V4f-Ii9UqgGfVGN2Zs-4hU17nDTEvvf7-nDe2vDnGa11/pub?gid=1523640544&single=true&output=csv';

const voices = {
  Nadia: { gender: 'FEMALE', languageCode: 'en-IN', speakingRate: 1.1, pitch: 2 },
  Parent: { gender: 'FEMALE', languageCode: 'en-GB', speakingRate: 0.95, pitch: 0 }
};

window.addEventListener("DOMContentLoaded", () => {
  getScenarios((scenarios) => {
    allScenarios = scenarios;
    populateScenarioDropdown(allScenarios);
  });
});

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
      callback(scenarios);
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

document.getElementById("start-random-btn").addEventListener("click", () => {
  if (allScenarios.length === 0) return alert("Scenarios not loaded yet.");
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
  document.getElementById("chat-container").innerHTML = "<b>AI Patient Replies:</b><br>";
  document.getElementById("chat-container").style.display = "none";
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
  startVoiceLoopWithVAD('https://hook.eu2.make.com/gotjtejc6e7anjxxikz5fciwcl1m2nj2', showReply);
  if (currentScenario.id === "64") {
    const dialogueScript = [
      { Speaker: "Nadia", Text: "I just can’t do this unless I’m asleep. I’ll freak out." },
      { Speaker: "Parent", Text: "That’s dramatic, Nadia. Local is simple. Why complicate things?" },
      { Speaker: "Nadia", Text: "You don’t understand! I’ve always hated the dentist. I want GA." },
      { Speaker: "Parent", Text: "You’re an adult now, act like it. You’ll be fine with local." },
      { Speaker: "Nadia", Text: "You’re not the one in the chair!" }
    ];
    playDialogueScript(dialogueScript);
  }
});

document.getElementById("stop-station-btn").addEventListener("click", () => {
  location.reload();
});

function showReply(replyText, isError) {
  const el = document.createElement('p');
  el.style.marginTop = "10px";
  el.style.padding = "8px";
  el.style.borderRadius = "6px";
  el.style.backgroundColor = isError ? "#ffecec" : "#f2f2f2";
  const visible = isError
    ? "⚠️ Patient: Sorry, I didn't catch that. Could you repeat?"
    : "🧑‍⚕️ Patient: " + replyText.replace(/\s+/g, ' ').trim();
  const voiceCleaned = replyText
    .replace(/\[(.*?)\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\b(um+|mm+|ah+|eh+|uh+)[.,]?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  el.innerHTML = visible;
  document.getElementById('chat-container').appendChild(el);
  if (!isError && replyText) queueAndSpeakReply(voiceCleaned);
}

function queueAndSpeakReply(text) {
  audioQueue.push(text);
  if (!isSpeaking) playNextInQueue();
}

function playNextInQueue() {
  if (audioQueue.length === 0) {
    isSpeaking = false;
    return;
  }
  const text = audioQueue.shift();
  isSpeaking = true;
  const gender = (currentScenario?.gender || '').toUpperCase();
  const validatedGender = ['MALE', 'FEMALE'].includes(gender) ? gender : 'FEMALE';
  const payload = {
    text,
    languageCode: currentScenario?.languageCode || 'en-GB',
    gender: validatedGender,
    style: currentScenario?.styleTag || 'neutral',
    pitch: parseFloat(currentScenario?.pitch || 0),
    speakingRate: parseFloat(currentScenario?.speakingRate || 1)
  };
  fetch('/.netlify/functions/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(data => {
      if (!data.audioContent) {
        isSpeaking = false;
        playNextInQueue();
        return;
      }
      const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
      audio.play().catch(err => console.warn("Audio error:", err));
      audio.onended = () => {
        isSpeaking = false;
        playNextInQueue();
      };
    })
    .catch(err => {
      console.warn("TTS error:", err);
      isSpeaking = false;
      playNextInQueue();
    });
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

async function playDialogueScript(dialogue) {
  for (const line of dialogue) {
    const voice = voices[line.Speaker] || voices.Parent;
    const payload = {
      text: line.Text,
      languageCode: voice.languageCode,
      gender: voice.gender,
      speakingRate: voice.speakingRate,
      pitch: voice.pitch
    };
    await fetch('/.netlify/functions/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(res => res.json()).then(data => {
      if (data.audioContent) {
        return new Promise(resolve => {
          const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
          audio.onended = resolve;
          audio.play();
        });
      }
    });
  }
}
