document.addEventListener('DOMContentLoaded', function () {
  const startButton = document.getElementById('start-button');
  const micIcon = document.getElementById('mic-icon');
  const aiResponseContainer = document.getElementById('ai-response');

  let mediaRecorder;
  let audioChunks = [];

  function log(message) {
    console.log(message);
  }

  function displayReply(reply) {
    const bubble = document.createElement('div');
    bubble.className = 'ai-bubble';
    bubble.textContent = `👨‍⚕️ Patient: ${reply}`;
    aiResponseContainer.appendChild(bubble);
  }

  async function sendAudioToMake(audioBlob) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');

    try {
      const response = await fetch('https://hook.eu2.make.com/gotjtejc6e7anjxxikz5fciwcl1m2nj2', {
        method: 'POST',
        body: formData
      });

      const text = await response.text();
      log('Raw response from Make: ' + text);

      const json = JSON.parse(text);
      const reply = json.reply;
      log('Parsed reply: ' + reply);
      displayReply(reply);

    } catch (error) {
      console.error('Error sending audio:', error);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.addEventListener('dataavailable', event => {
        audioChunks.push(event.data);
      });

      mediaRecorder.addEventListener('stop', () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        log('Recording stopped, sending to Make...');
        sendAudioToMake(audioBlob);
      });

      mediaRecorder.start();
      log('Speech started');
    } catch (err) {
      console.error('Error accessing microphone:', err);
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      log('Speech ended');
    }
  }

  micIcon.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      stopRecording();
    } else {
      startRecording();
    }
  });

  startButton.addEventListener('click', () => {
    aiResponseContainer.innerHTML = '';
  });
});
