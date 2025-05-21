const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSQRS87vXmpyNTcClW-1oEgo7Uogzpu46M2V4f-Ii9UqgGfVGN2Zs-4hU17nDTEvvf7-nDe2vDnGa11/pub?output=csv';

let currentScenario = null;
let sessionEndTime;
let isRecording = false;
let lastMediaStream = null;
let isWaitingForReply = false;

// Generate a unique session ID
window.currentSessionId = 'sess-' + Math.random().toString(36).slice(2) + '-' + Date.now();

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
  timerDisplay.textContent = "5:00";
  const interval = setInterval(() => {
    const minutes = Math.floor(timer / 60);
    const seconds = timer % 60;
    timerDisplay.textContent = minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
    if (--timer < 0) {
      clearInterval(interval);
      alert("OSCE session complete!");
      isRecording = false;
      showMicRecording(false);
      if (lastMediaStream) {
        lastMediaStream.getTracks().forEach(track => track.stop());
        lastMediaStream = null;
      }
    }
  }, 1000);
}

function showReply(replyText, isError) {
  const el = document.createElement('p');
  el.style.marginTop = "10px";
  el.style.padding = "8px";
  el.style.borderRadius = "6px";
  el.style.backgroundColor = isError ? "#fff5ea" : "#f2f2f2";
  if (isError) {
    el.innerHTML = `<span style="color:#a75c00;">&#128172; <b>Patient:</b> Sorry, I didn’t catch that. Could you please repeat your question?</span>`;
  } else {
    el.innerText = "👤 Patient: " + replyText;
  }
  document.getElementById('chat-container').appendChild(el);
  document.getElementById('chat-container').scrollTop = document.getElementById('chat-container').scrollHeight;
}

document.getElementById("start-random-btn").addEventListener("click", () => {
  getScenarios((scenarios) => {
    const randomScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    currentScenario = randomScenario;

    document.getElementById("scenario-title").textContent = randomScenario.title;
    document.getElementById("scenario-text").textContent = randomScenario.prompt_text;
    document.getElementById("scenario-box").style.display = "block";
    document.getElementById("chat-container").innerHTML = "<h3 style='margin-bottom:8px;'>AI Patient Replies:</h3>";

    startTimer(300);
    sessionEndTime = Date.now() + 5 * 60 * 1000;
  });
});

document.getElementById("mic-icon").addEventListener("click", () => {
  if (!currentScenario) {
    alert("Start a scenario first!");
    return;
  }
  if (isRecording || isWaitingForReply) {
    alert("Wait for the AI to finish replying first.");
    return;
  }
  isRecording = true;
  showMicRecording(true);
  startVADRecording(audioBlob => {
    isRecording = false;
    showMicRecording(false);

    if (!audioBlob) {
      showReply(null, true);
      return;
    }
    sendToMake(audioBlob, 'https://hook.eu2.make.com/gotjtejc6e7anjxxikz5fciwcl1m2nj2', (reply, error) => {
      if (reply) showReply(reply, false);
      if (error) showReply(null, true);
    });
  });
});

function startVADRecording(onStop, maxRecordingTime = 15000) {
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    lastMediaStream = stream;
    const recorder = new MediaRecorder(stream);
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    let chunks = [];
    let lastVoiceTime = Date.now();
    const SILENCE_THRESHOLD = 0.03; // tweak for environment!
    const SILENCE_DURATION = 1200; // ms of silence before stopping

    function detectVoice() {
      const arr = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(arr);
      let sum = 0;
      for (let i = 0; i < arr.length; ++i) {
        const norm = (arr[i] - 128) / 128;
        sum += norm * norm;
      }
      const rms = Math.sqrt(sum / arr.length);
      if (rms > SILENCE_THRESHOLD) {
        lastVoiceTime = Date.now();
      }
      if (Date.now() - lastVoiceTime > SILENCE_DURATION) {
        if (recorder.state === "recording") {
          recorder.stop();
        }
        audioCtx.close();
      } else if (recorder.state === "recording") {
        setTimeout(detectVoice, 150);
      }
    }

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop());
      if (chunks.length > 0) {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        onStop(audioBlob);
      } else {
        onStop(null);
      }
    };

    recorder.start();
    detectVoice();

    setTimeout(() => {
      if (recorder.state === "recording") {
        recorder.stop();
        audioCtx.close();
      }
    }, maxRecordingTime);

  }).catch(err => {
    alert("Could not access microphone: " + err.message);
    isRecording = false;
    showMicRecording(false);
  });
}

function sendToMake(blob, url, onReply) {
  if (isWaitingForReply) return;
  isWaitingForReply = true;

  const formData = new FormData();
  if (blob) {
    formData.append('file', blob, 'audio.webm');
  }
  if (currentScenario && currentScenario.id) {
    formData.append('id', currentScenario.id);
  }
  if (window.currentSessionId) {
    formData.append('session_id', window.currentSessionId);
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
      onReply(data.reply, false);
    } else {
      onReply(null, true);
    }
    isWaitingForReply = false;
  })
  .catch(err => {
    onReply(null, true);
    isWaitingForReply = false;
  });
}
