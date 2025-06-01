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
    const {
      text,
      languageCode = 'en-GB',
      gender = 'FEMALE',
      speakingRate,
      pitch,
    } = JSON.parse(event.body);

    if (!text) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing `text` in request body.' }),
      };
    }

    // Voice name defaults (can be customized if you want)
    const defaultVoices = {
      'en-GB': { MALE: 'en-GB-Standard-A', FEMALE: 'en-GB-Standard-C' },
      'en-IN': { MALE: 'en-IN-Standard-B', FEMALE: 'en-IN-Standard-A' },
      'en-US': { MALE: 'en-US-Standard-B', FEMALE: 'en-US-Standard-C' },
    };

    const voiceName =
      (defaultVoices[languageCode]?.[gender?.toUpperCase()]) || 'en-GB-Standard-C';

    const prosodyParts = [];
    if (speakingRate) prosodyParts.push(`rate="${speakingRate}"`);
    if (pitch) prosodyParts.push(`pitch="${pitch}st"`);

    const prosodyAttr = prosodyParts.join(' ');
    const ssml = `<speak><prosody ${prosodyAttr}>${text}</prosody></speak>`;

    const [response] = await client.synthesizeSpeech({
      input: { ssml },
      voice: {
        languageCode,
        name: voiceName,
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
