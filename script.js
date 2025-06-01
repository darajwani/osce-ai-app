let isWaitingForReply = false;
let currentScenario = null;
let sessionEndTime;
let isRecording = false;
let lastMediaStream = null;
let isSpeaking = false;
let audioQueue = [];
window.currentSessionId = 'sess-' + Math.random().toString(36).slice(2) + '-' + Date.now();

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSQRS87vXmpyNTcClW-1oEgo7Uogzpu46M2V4f-Ii9UqgGfVGN2Zs-4hU17nDTEvvf7-nDe2vDnGa11/pub?gid=1523640544&single=true&output=csv';

const speakerVoices = {
  "MOTHER": { gender: "FEMALE", languageCode: "en-GB", style: "default", pitch: 0, speakingRate: 1 },
  "CHILD": { gender: "FEMALE", languageCode: "en-GB", style: "default", pitch: 2, speakingRate: 1.1 }
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
      callback(scenarios);
    });
}

function parseMultiActorScript(script) {
  const lines = script.split(/\n|\\n/).map(l => l.trim()).filter(Boolean);
  const sequence = [];
  let doctorPhase = false;
  for (const line of lines) {
    if (line.toUpperCase().includes("---DOCTOR-INTERVENTION---")) {
      doctorPhase = true;
      break; // Stop here and let VAD take over
    }
    const match = line.match(/^\[(.*?)\]\s*(.*)$/);
    if (match) {
      sequence.push({ speaker: match[1].toUpperCase(), text: match[2] });
    }
  }
  return sequence;
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

  const payload = {
    text,
    languageCode: config.languageCode,
    gender: config.gender,
    style: config.style,
    pitch: config.pitch,
    speakingRate: config.speakingRate
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

document.getElementById("start-random-btn").addEventListener("click", () => {
  getScenarios((scenarios) => {
    const randomScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    currentScenario = randomScenario;
    document.getElementById("scenario-title").textContent = randomScenario.title;
    document.getElementById("scenario-text").textContent = randomScenario.prompt_text;
    document.getElementById("scenario-box").style.display = "block";
    document.getElementById("chat-container").innerHTML = "<b>AI Replies:</b><br>";
    document.getElementById("start-station-btn").style.display = "inline-block";
  });
});

document.getElementById("start-station-btn").addEventListener("click", () => {
  document.getElementById("start-station-btn").style.display = "none";
  startTimer(300);
  sessionEndTime = Date.now() + 5 * 60 * 1000;
  isRecording = true;
  startVoiceLoopWithVAD('https://hook.eu2.make.com/gotjtejc6e7anjxxikz5fciwcl1m2nj2', showReply);
  document.getElementById("chat-container").style.display = "block";
  if (currentScenario?.script?.includes("[")) showReplyFromScript(currentScenario.script);
});

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
