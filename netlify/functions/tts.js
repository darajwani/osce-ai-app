// tts.js — Netlify Function for Google TTS

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
      name,          // optional full voice name like en-GB-Wavenet-F
      gender = 'FEMALE',
      languageCode = 'en-GB',
      pitch = 0,
      speakingRate = 1,
    } = body;

    if (!text || text.trim().length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing or empty `text` in request.' }),
      };
    }

    const ssmlText = `<speak><prosody pitch="${pitch}st" rate="${speakingRate}">${text}</prosody></speak>`;

    const voice = name
      ? { name, languageCode }
      : { languageCode, ssmlGender: gender };

    const [response] = await client.synthesizeSpeech({
      input: { ssml: ssmlText },
      voice,
      audioConfig: {
        audioEncoding: 'MP3',
        effectsProfileId: ['small-bluetooth-speaker-class-device'],
      }
    });

    const base64Audio = Buffer.from(response.audioContent).toString('base64');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioContent: base64Audio }),
    };
  } catch (error) {
    console.error("TTS error:", error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Unknown error' }),
    };
  }
};
