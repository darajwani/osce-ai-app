const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSQRS87vXmpyNTcClW-1oEgo7Uogzpu46M2V4f-Ii9UqgGfVGN2Zs-4hU17nDTEvvf7-nDe2vDnGa11/pub?output=csv';

let isWaitingForReply = false;
let currentScenario = null;
let sessionEndTime;
let isRecording = false;

function showMicRecording(isRec) {
  const mic = document.getElementById("mic-icon");
  if (!mic) return;
  if (isRec) {
    mic.classList.add("mic-recording");
  } else {
    mic.classList.remove("mic-recording");
  }
}

function getScenarios(callback) {
  fetch(csvUrl)
    .then(res => res.text())
    .then(csv => {
      const rows = csv.split("\n").slice(1);
      const scenarios = rows.map(row => {
        const [id, title, prompt_text, category] = row.split(",");
        return { id: id && id.trim(), title: title && title.trim(), prompt_text: prompt_text && prompt_text.trim() };
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
    timerDisplay.textContent = minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
    if (--timer < 0) {
      clearInterval(interval);
      alert("OSCE session complete!");
      isRecording = false; // Stop voice loop
      showMicRecording(false);
    }
  }, 1000);
}

function showReply(replyText) {
  const el = document.createElement('p');
  el.style.marginTop = "10px";
  el.style.padding = "8px";
  el.style.backgroundColor = "#f2f2f2";
  el.style.borderRadius = "6px";
  el.innerText = "👤 Patient: " + replyText;
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
    startVoiceLoop(
      'https://hook.eu2.make.com/gotjtejc6e7anjxxikz5fciwcl1m2nj2',
      showReply
    );
  });
});

function startVoiceLoop(makeWebhookUrl, onReply) {
  function recordChunk() {
    if (!isRecording || Date.now() >= sessionEndTime) {
      showMicRecording(false);
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const recorder = new MediaRecorder(stream);
      let chunks = [];
      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstart = () => showMicRecording(true);
      recorder.onstop = () => {
        showMicRecording(false);
        if (chunks.length > 0) {
          const audioBlob = new Blob(chunks, { type: 'audio/webm' });
          sendToMake(audioBlob, makeWebhookUrl, (reply) => {
            if (reply) onReply(reply);
            // Continue the voice loop after reply
            setTimeout(recordChunk, 500); // Short gap
          });
        } else {
          // If nothing was recorded, just continue loop
          setTimeout(recordChunk, 500);
        }
      };
      recorder.start();
      setTimeout(() => recorder.state === "recording" && recorder.stop(), 5000);
    }).catch(err => {
      alert("Could not access microphone: " + err.message);
      isRecording = false;
      showMicRecording(false);
    });
  }
  recordChunk();
}

function sendToMake(blob, url, onReply) {
  if (isWaitingForReply) {
    return;
  }
  isWaitingForReply = true;

  const formData = new FormData();
  formData.append('file', blob, 'audio.webm');
  if (currentScenario && currentScenario.id) {
    formData.append('id', currentScenario.id);
  }

  fetch(url, {
    method: 'POST',
    body: formData,
  })
  .then(async res => {
    let data;
    try {
      data = await res.json();
    } catch (e) {
      data = {};
    }
    if (data.reply) {
      onReply(data.reply);
    }
    isWaitingForReply = false;
  })
  .catch(err => {
    isWaitingForReply = false;
  });
}
