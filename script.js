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
    : "🧑‍⚕️ Patient: " + replyText;
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

  let recorder = null;
  let chunks = [];

  const myvad = await vad.MicVAD.new({
    onSpeechStart: () => {
      console.log("🟢 Speech started");
      showMicRecording(true);

      chunks = [];
      recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        console.log("🎤 Recording stopped, sending to Make...");
        const blob = new Blob(chunks, { type: 'audio/webm' });
        sendToMake(blob, makeWebhookUrl, (reply, error) => {
          if (reply) onReply(reply);
          else onReply(null, true);
        });
      };

      recorder.start();
    },
    onSpeechEnd: () => {
      console.log("🔴 Speech ended");
      showMicRecording(false);
      if (recorder && recorder.state === 'recording') {
        recorder.stop();
      }
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
      console.log("📨 Raw response from Make:", raw);

      try {
        const json = JSON.parse(raw);
        let decodedReply = '';
        try {
          decodedReply = atob(json.reply);
        } catch (decodeErr) {
          console.error("❌ Failed to decode base64 reply:", decodeErr);
          onReply(null, true);
          isWaitingForReply = false;
          return;
        }

      try {
  const decoded = atob(json.reply);
  const bytes = Uint8Array.from(decoded, c => c.charCodeAt(0));
  const cleanedReply = new TextDecoder('utf-8').decode(bytes).trim();
  console.log("✅ Decoded reply:", cleanedReply);
  onReply(cleanedReply);
} catch (decodeError) {
  console.error("❌ Failed to decode UTF-8:", decodeError);
  onReply(null, true);
}



        console.log("✅ Decoded reply:", cleanedReply);
        onReply(cleanedReply);
      } catch (e) {
        console.error("❌ Failed to parse JSON:", e);
        onReply(null, true);
      }

      isWaitingForReply = false;
    })
    .catch(err => {
      console.error("❌ Fetch error:", err);
      onReply(null, true);
      isWaitingForReply = false;
    });
}
