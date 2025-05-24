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
      body: JSON.stringify({ error: 'Invalid or missing GOOGLE_TTS_KEY.' }),
    };
  }

  const client = new textToSpeech.TextToSpeechClient({ credentials });

  try {
    const { text } = JSON.parse(event.body);
    if (!text) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing `text` in request body.' }),
      };
    }

    const [response] = await client.synthesizeSpeech({
      input: { ssml: `<speak><prosody rate="medium">${text}</prosody></speak>` },
      voice: { languageCode: 'en-US', name: 'en-US-Wavenet-D' },
      audioConfig: { audioEncoding: 'MP3' },
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioContent: response.audioContent }),
    };
  } catch (error) {
    console.error("TTS Error:", error);  // helpful during local Netlify dev
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Unknown error' }),
    };
  }
};
