import voice from "elevenlabs-node";

const apiKey = "sk_5e90724aa1f2800186e9f4c128a9631f74062bbebd5503bc";
const defaultVoiceId = "pNInz6obpgDQGcFmaJgB";
const overrideVoiceId = "21m00Tcm4TlvDq8ikWAM";

// The elevenlabs-node package exports plain functions, not a class constructor.
voice.textToSpeech(
  apiKey,
  overrideVoiceId || defaultVoiceId,
  "audio.mp3",
  "mozzy is cool",
  0.5,
  0.5,
  "eleven_multilingual_v2"
).then((res) => {
  console.log(res);
}).catch((err) => {
  console.error("Failed to synthesize speech:", err);
});
