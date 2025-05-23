window.addEventListener("DOMContentLoaded", function () {
  const startButton = document.getElementById("startButton");
  const micButton = document.getElementById("micButton");
  const responseContainer = document.getElementById("response");

  const webhookURL = "https://hook.eu2.make.com/gotjtejc6e7anjxxikz5fciwcl1m2nj2";
  let mediaRecorder;
  let audioChunks = [];

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);

      audioChunks = [];
      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
        const formData = new FormData();
        formData.append("audio", audioBlob, "recording.wav");

        const response = await fetch(webhookURL, {
          method: "POST",
          body: formData,
        });

        const text = await response.text();
        try {
          const data = JSON.parse(text);
          const cleanReply = data.reply
            .replace(/`/g, "")
            .replace(/\n/g, " ")
            .replace(/\r/g, " ");
          responseContainer.innerText = cleanReply;
        } catch (error) {
          console.error("Failed to parse JSON:", error);
          responseContainer.innerText = "⚠️ No AI reply received. (Check logs!)";
        }
      };

      mediaRecorder.start();
      setTimeout(() => mediaRecorder.stop(), 5000); // Record for 5 seconds
    } catch (err) {
      console.error("Error accessing microphone:", err);
      responseContainer.innerText = "⚠️ Microphone error.";
    }
  }

  if (startButton) {
    startButton.addEventListener("click", () => {
      responseContainer.innerText = "Waiting for AI reply...";
      startRecording();
    });
  }

  if (micButton) {
    micButton.addEventListener("click", () => {
      responseContainer.innerText = "Waiting for AI reply...";
      startRecording();
    });
  }
});
