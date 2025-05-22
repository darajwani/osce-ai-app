export default class VAD {
  static async new(options) {
    console.log("VAD.new() called with stream:", options.stream);
    return {
      waitForSpeechStart: async () => {
        console.log("Mock VAD: waiting for speech start...");
        await new Promise((res) => setTimeout(res, 1000));
        return true;
      },
      waitForSpeechEnd: async () => {
        console.log("Mock VAD: waiting for speech end...");
        await new Promise((res) => setTimeout(res, 1000));
        return true;
      },
      destroy: () => {
        console.log("Mock VAD: destroyed");
      }
    };
  }
}
