const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSQRS87vXmpyNTcClW-1oEgo7Uogzpu46M2V4f-Ii9UqgGfVGN2Zs-4hU17nDTEvvf7-nDe2vDnGa11/pub?output=csv';

function getScenarios(callback) {
  fetch(csvUrl)
    .then(res => res.text())
    .then(csv => {
      const rows = csv.split("\n").slice(1); // skip header
      const scenarios = rows.map(row => {
        const [id, title, prompt_text, category] = row.split(",");
        return { title, prompt_text };
      }).filter(s => s.title);
      callback(scenarios);
    });
}

function startTimer(duration) {
  let timer = duration;
  const timerDisplay = document.getElementById("timer");
  const interval = setInterval(() => {
    const minutes = Math.floor(timer / 60);
    const seconds = timer % 60;
    timerDisplay.textContent = minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
    if (--timer < 0) {
      clearInterval(interval);
      alert("OSCE session complete!");
    }
  }, 1000);
}

// ✅ Display AI reply in chat box
function showReply(replyText) {
  console.log("🧠 Showing reply:", replyText);
  const el = document.createElement('p');
  el.style.marginTop = "10px";
  el.style.padding = "8px";
  el.style.backgroundColor = "#f2f2f2";
  el.style.borderRadius = "6px";
  el.innerText = "👤 Patient: " + replyText;
  document.getElementById('chat-container').appendChild(el);
}

// ✅ Start Scenario + Voice
document.getElementById("start-random-btn").addEventListener("click", () => {
  getScenarios((scenarios) => {
    const randomScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    document.getElementById("scenario-title").textContent = randomScenario.title;
    document.getElementById("scenario-text").textContent = randomScenario.prompt_text;
    document.getElementById("scenario-box").style.display = "block";

    startTimer(300); // 5 minutes
    sessionEndTime = Date.now() + 5 * 60 * 1000;

    startVoiceLoop(
      'https://hook.eu2.make.com/9n6ssq53b1wrme3c1by54im39gj3ujg9', // Replace with your own Make webhook
      showReply
    );
  });
});

// 🎤 Voice Loop Logic
let mediaRecorder;
let isRecording = false;
let sessionEndTime;

function startVoiceLoop(makeWebhookUrl, onReply) {
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    mediaRecorder = new MediaRecorder(stream);
    isRecording = true;

    mediaRecorder.ondataavailable = event => {
      const audioBlob = new Blob([event.data], { type: 'audio/webm' });
      sendToMake(audioBlob, makeWebhookUrl, onReply);
    };

    mediaRecorder.onstop = () => {
      if (Date.now() < sessionEndTime && isRecording) {
        mediaRecorder.start();
        setTimeout(() => mediaRecorder.stop(), 5000);
      }
    };

    mediaRecorder.start();
    setTimeout(() => mediaRecorder.stop(), 5000);
  });
}

// 🌐 Send to Make + log response
function sendToMake(blob, url, onReply) {
  const formData = new FormData();
  formData.append('file', blob, 'audio.webm');

  fetch(url, {
    method: 'POST',
    body: formData,
  })
  .then(res => res.json())
  .then(data => {
    console.log("📦 Data received from Make:", data);
    if (data.reply) {
      onReply(data.reply);
    } else {
      console.warn("⚠️ No 'reply' field in data:", data);
    }
  })
  .catch(err => console.error('❌ Make.com error:', err));
}
