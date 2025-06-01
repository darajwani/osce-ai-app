// Updated tts.js with logging for debugging pitch, rate, and SSML
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

    // Log input for debugging
    console.log("TTS request body:", body);
    console.log("Generated SSML:", ssmlText);

    const [response] = await client.synthesizeSpeech({
      input: {
        ssml: ssmlText,
      },
      voice: {
        languageCode,
        ssmlGender: gender,
      },
      audioConfig: {
        audioEncoding: 'MP3',
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
