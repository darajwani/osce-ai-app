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
