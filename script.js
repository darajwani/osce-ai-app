// Top-level state
let isWaitingForReply = false;
let currentScenario = null;
let allScenarios = [];
let sessionEndTime;
let isRecording = false;
let lastMediaStream = null;
let isSpeaking = false;
let userStartedSpeakingAfterLastVAD = false;
let audioQueue = [];
let isSessionOver = false;
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
      const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
      const scenarios = parsed.data.map(row => ({
        id: row["ID"] || '',
        title: row["Title"] || '',
        prompt_text: row["Prompt_text"] || '',
        category: row["Category"] || '',
        instructions: row["Instructions"] || '',
        emotion: row["Emotion"] || '',
        script: row["Script"] || '',
        gender: row["gender"] || 'FEMALE',
        languageCode: row["LanguageCode"] || 'en-GB',
        styleTag: row["VoiceStyleTag"] || 'neutral',
        speakingRate: parseFloat(row["SpeakingRate"] || 1),
        pitch: parseFloat(row["VoicePitch"] || 0),
        name: row["PatientName"] || '',
        speakingGuide: row["Speaking_Guide"] || '' // ✅ Column O, now parsed correctly
      })).filter(s => s.id && s.title);
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
  if (isSessionOver) return;
  audioQueue.push({ text, speaker: speakerOverride });
  if (!isSpeaking) waitForUserPauseThenPlay();
}

function waitForUserPauseThenPlay() {
  if (userStartedSpeakingAfterLastVAD) {
    setTimeout(waitForUserPauseThenPlay, 300); // Wait until user is silent
  } else {
    playNextInQueue();
  }
}

function playNextInQueue() {
  if (audioQueue.length === 0) return void (isSpeaking = false);
  const { text, speaker } = audioQueue.shift();
  isSpeaking = true;

  let voiceConfig;

  if (currentScenario?.id === "64") {
    if (speaker === "MOTHER") {
      voiceConfig = {
        gender: "FEMALE",
        languageCode: currentScenario.languageCode || "en-GB",
        pitch: -6,
        speakingRate: 0.8
      };
    } else if (speaker === "CHILD") {
      voiceConfig = {
        gender: "FEMALE",
        languageCode: currentScenario.languageCode || "en-GB",
        pitch: 6,
        speakingRate: 1.2
      };
    }
  }

  if (!voiceConfig) {
    const matchByName = allScenarios.find(
      s => s.name?.toUpperCase() === speaker?.toUpperCase()
    );
    if (matchByName) {
      voiceConfig = {
        gender: matchByName.gender || 'FEMALE',
        languageCode: matchByName.languageCode || 'en-GB',
        pitch: parseFloat(matchByName.pitch || 0),
        speakingRate: parseFloat(matchByName.speakingRate || 1)
      };
    } else {
      voiceConfig = {
        gender: currentScenario?.gender || 'FEMALE',
        languageCode: currentScenario?.languageCode || 'en-GB',
        pitch: parseFloat(currentScenario?.pitch || 0),
        speakingRate: parseFloat(currentScenario?.speakingRate || 1)
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
  const guideContainer = document.getElementById("guide-toggle-container");
const guideCheckbox = document.getElementById("guide-toggle");
const guideText = document.getElementById("speaking-guide-text");

if (guideContainer && guideCheckbox && guideText) {
  if (scenario.speakingGuide) {
    guideContainer.style.display = "block";
    guideText.textContent = scenario.speakingGuide;
    guideText.style.display = "none";
    guideCheckbox.checked = false;
  } else {
    guideContainer.style.display = "none";
    guideText.style.display = "none";
  }
}
  document.getElementById("chat-container").innerHTML = "<b>AI Replies:</b><br>";
  document.getElementById("start-station-btn").style.display = "inline-block";
  document.getElementById("stop-station-btn").style.display = "none";
}

document.getElementById("start-station-btn").addEventListener("click", () => {
  document.getElementById("start-station-btn").style.display = "none";
  document.getElementById("stop-station-btn").style.display = "inline-block";
  document.getElementById("chat-container").style.display = "block";
  startTimer(360);
  sessionEndTime = Date.now() + 360 * 1000;
  isRecording = true;

  let hasFirstReplyHappened = false;

  function showReply(replyText, isError = false) {
    const el = document.createElement('p');
    el.style.marginTop = "10px";
    el.style.padding = "8px";
    el.style.borderRadius = "6px";
    el.style.backgroundColor = isError ? "#ffecec" : "#f2f2f2";
const visible = isError
  ? "⚠️ Patient: Sorry, I didn't catch that. Could you repeat?"
  : "🧑‍⚕️ Patient: " + (replyText || "").replace(/\s+/g, ' ').trim();
 const voiceCleaned = (replyText ?? "")
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
startVoiceLoopWithVAD('https://hook.eu2.make.com/ww75pnuxjg16wifpsbq1xcrvo3ajorag', showReply);

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
      endSessionAndShowFeedback(); // ✅ Replace inline feedback logic
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
    userStartedSpeakingAfterLastVAD = true; // ✅ Mark that user resumed speaking
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

    // ✅ Reset flag shortly after silence, assuming user has stopped
    setTimeout(() => {
      userStartedSpeakingAfterLastVAD = false;
    }, 400); // tweak if needed

    if (recorder?.state === 'recording') recorder.stop();
  },
  modelURL: "./vad/silero_vad.onnx"
});


  myvad.start();
}

let lastSentToMake = 0;

function sendToMake(blob, url, onReply) {
  const now = Date.now();
  if (now - lastSentToMake < 4000) return; // throttle: once every 4 seconds
  lastSentToMake = now;

  if (isWaitingForReply) return;
  isWaitingForReply = true;

  const formData = new FormData();
  formData.append('file', blob, 'audio.webm');
  if (currentScenario?.id) formData.append('id', currentScenario.id);
  if (window.currentSessionId) formData.append('session_id', window.currentSessionId);
  formData.append('scenario_id', currentScenario?.id); // ✅ Fixed indentation

  fetch(url, { method: 'POST', body: formData })
    .then(async res => {
      const raw = await res.text();
      try {
        const json = JSON.parse(raw);
        const decoded = atob(json.reply);
        const bytes = Uint8Array.from(decoded, c => c.charCodeAt(0));
        const cleanedReply = new TextDecoder('utf-8').decode(bytes).trim();
        onReply(cleanedReply);
      } 
      catch (e) {
  console.error("Failed to decode Make.com response:", e, raw);
  alert("⚠️ There was a problem interpreting the response. Please try again.");
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

let feedbackAlreadySent = false;

async function endSessionAndShowFeedback() {
  if (feedbackAlreadySent) return;
  feedbackAlreadySent = true;

  isRecording = false;
  isSessionOver = true;
  audioQueue = [];
  isSpeaking = false;
  if (lastMediaStream) lastMediaStream.getTracks().forEach(t => t.stop());
  showMicRecording(false);

  const chatContainer = document.getElementById('chat-container');
  const loadingEl = document.createElement('p');
  loadingEl.style.color = "#666";
  loadingEl.style.fontStyle = "italic";
  loadingEl.textContent = "📝 Generating feedback, please wait";
  chatContainer.appendChild(loadingEl);

  let dotCount = 0;
  const dotInterval = setInterval(() => {
    dotCount = (dotCount + 1) % 4;
    loadingEl.textContent = "📝 Generating feedback, please wait" + ".".repeat(dotCount);
  }, 500);

  try {
    const res = await fetch("https://hook.eu2.make.com/sa0h4ioj4uetd5yv2m7nzg3eyicn8d2c", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: window.currentSessionId,
        scenario_id: currentScenario?.id
      })
    });

    const data = await res.json();
    console.log("🧪 Available domain keys:", Object.keys(data));
    console.log("🔍 Feedback response from Make.com:", data);
    console.log("💬 Full feedback object:", data);
        clearInterval(dotInterval);
    loadingEl.remove();

    // Build the feedback text
    let feedbackText = "";

    if (data.overall_comments) {
      feedbackText += `📝 Overall Comments:\n${data.overall_comments}\n\n`;
    }

 const domains = ["Clinical", "Communication", "Professionalism", "ManagementAndLeadership"];
domains.forEach(domain => {
  const domainData = data[domain];
  if (domainData) {
    feedbackText += `📌 ${domain}:\n`;
    if (domainData.grade) feedbackText += `- Grade: ${domainData.grade}\n`;
    if (domainData.rationale) feedbackText += `- Rationale: ${domainData.rationale}\n`;
    feedbackText += `\n`;
      }
});


    feedbackText = feedbackText.trim() || "No feedback available.";
   

    // Clear previous content
    chatContainer.innerHTML = "";

    // Add feedback header
    const headerEl = document.createElement('b');
    headerEl.textContent = "📝 Feedback:";
    chatContainer.appendChild(headerEl);
    chatContainer.appendChild(document.createElement("br"));

    // Display feedback
    const feedbackEl = document.createElement('p');
    feedbackEl.style.marginTop = "10px";
    feedbackEl.style.padding = "10px";
    feedbackEl.style.backgroundColor = "#e8f5e9";  // light green
    feedbackEl.style.border = "1px solid #a5d6a7";
    feedbackEl.style.borderRadius = "6px";
    feedbackEl.style.whiteSpace = "pre-wrap"; // maintain line breaks
    feedbackEl.textContent = feedbackText;
    chatContainer.appendChild(feedbackEl);

  } catch (err) {
    console.error("Feedback fetch error:", err);
    clearInterval(dotInterval);
    loadingEl.textContent = "⚠️ Could not load feedback. Please try again later.";
    loadingEl.style.color = "red";
  }
}

// ✅ Moved outside of endSessionAndShowFeedback()
window.addEventListener("DOMContentLoaded", () => {
  getScenarios();

  // Checkbox toggle for speaking guide
  const guideCheckbox = document.getElementById("guide-toggle");
  const guideText = document.getElementById("speaking-guide-text");

  if (guideCheckbox && guideText) {
    guideCheckbox.addEventListener("change", () => {
      guideText.style.display = guideCheckbox.checked ? "block" : "none";
    });
  }
});
