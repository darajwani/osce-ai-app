const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSQRS87vXmpyNTcClW-1oEgo7Uogzpu46M2V4f-Ii9UqgGfVGN2Zs-4hU17nDTEvvf7-nDe2vDnGa11/pub?output=csv';

let isWaitingForReply = false;
let currentScenario = null; // Stores the selected scenario
let mediaRecorder;
let isRecording = false;
let sessionEndTime;

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
      isRecording = false; // Stop further recording
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
    }
  }, 1000);
}

function showReply(replyText) {
  console.log("🧠 Showing reply:", replyText);
  const el = document.createElement('p');
  el.style.marginTop = "10px";
  el.style.padding = "8px";
  el.style.backgroundColor = "#f2f2f2";
  el.style.borderRadius = "6px";
  el.innerText = "👤 Patient: " + replyText;
  document.getElementById('chat-container').appendChild(el);

  // Restart recording for next doctor question (if session not ended)
  if (Date.now() < sessionEndTime && isRecording) {
    setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === "inactive") {
        mediaRecorder.start();
        setTimeout(() => {
          if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
          }
        }, 5000);
      }
    }, 500); // short pause before next mic activation
  }
}

document.getElementById("start-random-btn").addEventListener("click", () => {
  getScenarios((scenarios) => {
    const randomScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    currentScenario = randomScenario;

    document.getElementById("scenario-title").textContent = randomScenario.title;
    document.getElementById("scenario-text").textContent = randomScenario.prompt_text;
    document.getElementById("scenario-box").style.display = "block";

    startTimer(300); // 5 minutes
    sessionEndTime = Date.now() + 5 * 60 * 1000;

    startVoiceLoop(
      'https://hook.eu2.make.com/gotjtejc6e7anjxxikz5fciwcl1m2nj2',
      showReply
    );
  });
});

function startVoiceLoop(makeWebhookUrl, onReply) {
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    mediaRecorder = new MediaRecorder(stream);
    isRecording = true;

    mediaRecorder.ondataavailable = event => {
      const audioBlob = new Blob([event.data], { type: 'audio/webm' });
      sendToMake(audioBlob, makeWebhookUrl, onReply);
    };

    // The actual recording loop is now managed by showReply() for better UX

    mediaRecorder.start();
    setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }
    }, 5000);
  }).catch(err => {
    alert("Could not access microphone: " + err.message);
    isRecording = false;
  });
}

function sendToMake(blob, url, onReply) {
  if (isWaitingForReply) {
    console.log("⏳ Skipped: waiting for reply");
    return;
  }

  isWaitingForReply = true;

  const formData = new FormData();
  formData.append('file', blob, 'audio.webm');
  // Always send the current scenario id to Make.com
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
    console.log("📦 Data from Make:", data);
    if (data.reply) {
      onReply(data.reply);
    } else {
      console.warn("⚠️ No reply in data:", data);
      // Still restart recording to avoid dead end
      if (Date.now() < sessionEndTime && isRecording) {
        setTimeout(() => {
          if (mediaRecorder && mediaRecorder.state === "inactive") {
            mediaRecorder.start();
            setTimeout(() => {
              if (mediaRecorder && mediaRecorder.state === "recording") {
                mediaRecorder.stop();
              }
            }, 5000);
          }
        }, 500);
      }
    }
    isWaitingForReply = false;
  })
  .catch(err => {
    console.error('❌ Make.com error:', err);
    isWaitingForReply = false;
    // Try to continue the loop even if error (optional: remove this for strict error handling)
    if (Date.now() < sessionEndTime && isRecording) {
      setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state === "inactive") {
          mediaRecorder.start();
          setTimeout(() => {
            if (mediaRecorder && mediaRecorder.state === "recording") {
              mediaRecorder.stop();
            }
          }, 5000);
        }
      }, 500);
    }
  });
}
