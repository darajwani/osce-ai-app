let isWaitingForReply = false;
let currentScenario = null;
let sessionEndTime;
let isRecording = false;
let lastMediaStream = null;
window.currentSessionId = 'sess-' + Math.random().toString(36).slice(2) + '-' + Date.now();

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSQRS87vXmpyNTcClW-1oEgo7Uogzpu46M2V4f-Ii9UqgGfVGN2Zs-4hU17nDTEvvf7-nDe2vDnGa11/pub?output=csv';

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
        const [id, title, prompt_text] = row.split(",");
        return { id: id?.trim(), title: title?.trim(), prompt_text: prompt_text?.trim() };
      }).filter(s => s.title && s.id);
      callback(scenarios);
    });
}

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

function showReply(replyText, isError) {
  const el = document.createElement('p');
  el.style.marginTop = "10px";
  el.style.padding = "8px";
  el.style.borderRadius = "6px";
  el.style.backgroundColor = isError ? "#ffecec" : "#f2f2f2";
  el.innerHTML = isError
    ? `<span style="color:#b22;">⚠️ No AI reply received. (Check logs!)</span>`
    : "👤 Patient: " + replyText;
  document.getElementById('chat-container').appendChild(el);
}

document.getElementById("start-random-btn").addEventListener("click", () => {
  getScenarios((scenarios) => {
    const randomScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    currentScenario = randomScenario;
    document.getElementById("scenario-title").textContent = randomScenario.title;
    document.getElementById("scenario-text").textContent = randomScenario.prompt_text;
    document.getElementById("scenario-box").style.display = "block";
    document.getElementById("chat-container").innerHTML = "<b>AI Patient Replies:</b><br>";
    startTimer(300);
    sessionEndTime = Date.now() + 5 * 60 * 1000;
    isRecording = true;
    startVoiceLoopWithVAD('https://hook.eu2.make.com/gotjtejc6e7anjxxikz5fciwcl1m2nj2', showReply);
  });
});

async function startVoiceLoopWithVAD(makeWebhookUrl, onReply) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  lastMediaStream = stream;

  const myvad = await vad.MicVAD.new({
    onSpeechStart: () => {
      console.log("🟢 Speech started");
      showMicRecording(true);
    },
    onSpeechEnd: (audio) => {
      console.log("🔴 Speech ended, sending...");
      showMicRecording(false);
      const blob = new File([audio], "audio.webm", { type: 'audio/webm' });
      sendToMake(blob, makeWebhookUrl, (reply, error) => {
        if (reply) onReply(reply);
        if (error) onReply(null, true);
      });
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
  formData.append('file', blob, 'audio.webm'); // ✅ Corrected extension
  if (currentScenario?.id) formData.append('id', currentScenario.id);
  if (window.currentSessionId) formData.append('session_id', window.currentSessionId);

  fetch(url, { method: 'POST', body: formData })
    .then(async res => {
      const data = await res.json().catch(() => ({}));
      onReply(data.reply || null, !data.reply);
      isWaitingForReply = false;
    })
    .catch(() => {
      onReply(null, true);
      isWaitingForReply = false;
    });
}
