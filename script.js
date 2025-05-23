const micButton = document.getElementById('mic-button');
const patientReplies = document.getElementById('patient-replies');

let mediaRecorder;
let audioChunks = [];

micButton.addEventListener('click', async () => {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    startRecording();
  } else {
    stopRecording();
  }
});

function startRecording() {
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        try {
          const response = await fetch('https://hook.eu2.make.com/gotjtejc6e7anjxxikz5fciwcl1m2nj2', {
            method: 'POST',
            body: formData
          });

          const textResponse = await response.text();
          console.log("Raw response from Make:", textResponse);

          // Extract reply content using regex
          const match = textResponse.match(/"reply"\s*:\s*"([\s\S]*?)"/);
          const reply = match ? match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n') : "";

          console.log("Parsed reply:", reply);
          if (reply) {
            const messageDiv = document.createElement('div');
            messageDiv.classList.add('patient-reply');
            messageDiv.textContent = `🧑‍⚕️ Patient: ${reply}`;
            patientReplies.appendChild(messageDiv);
          } else {
            showError("No AI reply received. (Empty reply)");
          }

        } catch (error) {
          console.error("Error:", error);
          showError("No AI reply received. (Check logs!)");
        }
      };

      mediaRecorder.start();
      micButton.classList.add('recording');
    })
    .catch(err => {
      console.error("Microphone access denied:", err);
      showError("Microphone access denied.");
    });
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    micButton.classList.remove('recording');
  }
}

function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.classList.add('error-message');
  errorDiv.textContent = `⚠️ ${message}`;
  patientReplies.appendChild(errorDiv);
}
