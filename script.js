const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSQRS87vXmpyNTcClW-1oEgo7Uogzpu46M2V4f-Ii9UqgGfVGN2Zs-4hU17nDTEvvf7-nDe2vDnGa11/pub?output=csv';

let isWaitingForReply = false;
let currentScenario = null;
let sessionEndTime;
let isRecording = false;
let stopSession = false;

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
      stopSession = true;
      showMicRecording(false); // Stop glowing mic
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

    stopSession = false;
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
    if (!isRecording || Date.now() >= sessionEndTime || stopSession) {
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
        stream.getTracks().forEach(track => track.stop()); // Release mic!
        if (chunks.length > 0) {
          const audioBlob = new Blob(chunks, { type: 'audio/webm' });
          sendToMake(audioBlob, makeWebhookUrl, (reply) => {
            if (reply) {
              onReply(reply);
              setTimeout(recordChunk, 500); // Continue loop after AI reply
            } else {
              // No reply, but continue loop after short pause
              setTimeout(recordChunk, 700);
            }
          });
        } else {
          // No audio, continue loop
          setTimeout(recordChunk, 700);
        }
      };
      recorder.start();
      setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 5000);
    }).catch(err => {
      alert("Could not access microphone: " + err.message + "\n\nTip: Allow mic access, use Chrome/Edge/Firefox, or check browser settings.");
      isRecording = false;
      stopSession = true;
      showMicRecording(false);
    });
  }
  recordChunk();
}

function sendToMake(blob, url, onReply) {
  if (isWaitingForReply) {
    setTimeout(() => onReply && onReply(null), 600); // Continue after delay if blocked
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
    } else {
      // Don't show error to user, just continue the loop silently
      onReply(null);
    }
    isWaitingForReply = false;
  })
  .catch(err => {
    isWaitingForReply = false;
    // Continue the loop even if network error
    onReply(null);
  });
}
