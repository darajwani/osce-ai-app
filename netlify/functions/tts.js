const textToSpeech = require('@google-cloud/text-to-speech');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' }),
    };
  }

  let credentials;
  try {
    credentials = JSON.parse(process.env.GOOGLE_TTS_KEY);
  } catch (e) {
    console.error("GOOGLE_TTS_KEY missing or invalid", e);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid or missing GOOGLE_TTS_KEY.' }),
    };
  }

  const client = new textToSpeech.TextToSpeechClient({ credentials });

  try {
    const body = JSON.parse(event.body);
    const {
      text,
      voiceName,
      languageCode = 'en-GB',
      gender = 'FEMALE',
      pitch = 0,
      speakingRate = 1,
    } = body;

    if (!text) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing `text` in request body.' }),
      };
    }

    const ssmlText = `<speak><prosody pitch="${pitch}st" rate="${speakingRate}">${text}</prosody></speak>`;

    console.log("TTS request config:", { text, voiceName, languageCode, gender, pitch, speakingRate });
    console.log("Generated SSML:", ssmlText);

    const [response] = await client.synthesizeSpeech({
      input: { ssml: ssmlText },
      voice: voiceName
        ? { name: voiceName, languageCode }
        : { languageCode, ssmlGender: gender },
      audioConfig: {
        audioEncoding: 'MP3',
        effectsProfileId: ['small-bluetooth-speaker-class-device'],
      },
    });

    const base64Audio = Buffer.from(response.audioContent).toString('base64');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioContent: base64Audio }),
    };
  } catch (error) {
    console.error("TTS Error:", error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Unknown error' }),
    };
  }
};
