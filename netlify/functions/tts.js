const textToSpeech = require('@google-cloud/text-to-speech');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: 'Method Not Allowed',
    };
  }

  const credentials = JSON.parse(process.env.GOOGLE_TTS_KEY);
  const client = new textToSpeech.TextToSpeechClient({ credentials });

  const { text } = JSON.parse(event.body);
  if (!text) {
    return {
      statusCode: 400,
      body: 'Missing text',
    };
  }

  const [response] = await client.synthesizeSpeech({
    input: { ssml: `<speak><prosody rate="medium">${text}</prosody></speak>` },
    voice: { languageCode: 'en-US', name: 'en-US-Wavenet-D' },
    audioConfig: { audioEncoding: 'MP3' }
  });

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Access-Control-Allow-Origin': '*'
    },
    body: response.audioContent,
    isBase64Encoded: true  // ✅ tells Netlify this is binary base64 audio
  };
};
