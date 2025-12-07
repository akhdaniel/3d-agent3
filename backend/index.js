import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import voice from "elevenlabs-node";
import express from "express";
import { promises as fs, createReadStream } from "fs";
import multer from "multer";
import OpenAI from "openai";
import path from "path";
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "-", // Your OpenAI API key here, I used "-" to avoid errors when the key is not set but you should not do that
});

const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const voiceID = "EXAVITQu4vr4xnSDxMaL";


const app = express();
app.use(express.json());
app.use(cors());
const port = 28000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});
const tempUploadDir = path.join(process.cwd(), ".tmp-voice");

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/voices", async (req, res) => {
  res.send(await voice.getVoices(elevenLabsApiKey));
});

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve(stdout);
    });
  });
};

const lipSyncMessage = async (message) => {
  const time = new Date().getTime();
  console.log(`Starting conversion for message ${message}`);
  await execCommand(
    `ffmpeg -y -i audios/message_${message}.mp3 audios/message_${message}.wav`
    // -y to overwrite the file
  );
  console.log(`Conversion done in ${new Date().getTime() - time}ms`);
  await execCommand(
    `./bin/rhubarb -f json -o audios/message_${message}.json audios/message_${message}.wav -r phonetic`
  );
  // -r phonetic is faster but less accurate
  console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
};

const introMessages = async () => [
  {
    text: "Hey dear... How was your day?",
    audio: await audioFileToBase64("audios/intro_0.wav"),
    lipsync: await readJsonTranscript("audios/intro_0.json"),
    facialExpression: "smile",
    animation: "Talking_1",
  },
  {
    text: "I missed you so much... Please don't go for so long!",
    audio: await audioFileToBase64("audios/intro_1.wav"),
    lipsync: await readJsonTranscript("audios/intro_1.json"),
    facialExpression: "sad",
    animation: "Crying",
  },
];

const missingKeyMessages = async () => [
  {
    text: "Please my dear, don't forget to add your API keys!",
    audio: await audioFileToBase64("audios/api_0.wav"),
    lipsync: await readJsonTranscript("audios/api_0.json"),
    facialExpression: "angry",
    animation: "Angry",
  },
  {
    text: "You don't want to ruin Wawa Sensei with a crazy ChatGPT and ElevenLabs bill, right?",
    audio: await audioFileToBase64("audios/api_1.wav"),
    lipsync: await readJsonTranscript("audios/api_1.json"),
    facialExpression: "smile",
    animation: "Laughing",
  },
];

const processChatFlow = async (userMessage) => {
  if (!userMessage) {
    return { messages: await introMessages() };
  }
  if (!elevenLabsApiKey || openai.apiKey === "-") {
    return { messages: await missingKeyMessages() };
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo-1106",
    max_tokens: 1000,
    temperature: 0.6,
    response_format: {
      type: "json_object",
    },
    messages: [
      {
        role: "system",
        content: `
        You are a virtual girlfriend.
        You will always reply with a JSON array of messages. With a maximum of 3 messages.
        Each message has a text, facialExpression, and animation property.
        The different facial expressions are: smile, sad, angry, surprised, funnyFace, and default.
        The different animations are: Talking_0, Talking_1, Talking_2, Crying, Laughing, Rumba, Idle, Terrified, and Angry. 
        `,
      },
      {
        role: "user",
        content: userMessage || "Hello",
      },
    ],
  });
  let messages = JSON.parse(completion.choices[0].message.content);
  if (messages.messages) {
    messages = messages.messages; // ChatGPT is not 100% reliable, sometimes it directly returns an array and sometimes a JSON object with a messages property
  }
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    // generate audio file
    const fileName = `audios/message_${i}.mp3`; // The name of your audio file
    const textInput = message.text; // The text you wish to convert to speech
    console.log(
      `[audio] Generating speech for message ${i}`,
      JSON.stringify({ voiceID, fileName, textPreview: textInput.slice(0, 40) })
    );
    try {
      const response = await voice.textToSpeech(
        elevenLabsApiKey,
        voiceID,
        fileName,
        textInput,
        0.5,
        0.5,
        "eleven_multilingual_v2"
      );
      if (!response) {
        console.warn(`[audio] ElevenLabs returned no payload for message ${i}`);
      } else {
        console.log(`[audio] ElevenLabs response for message ${i}`, response);
      }
      try {
        const stats = await fs.stat(fileName);
        console.log(
          `[audio] File written for message ${i}`,
          JSON.stringify({ sizeBytes: stats.size, mtime: stats.mtime })
        );
      } catch (fileErr) {
        console.warn(
          `[audio] Could not stat generated file for message ${i}`,
          fileErr
        );
      }
    } catch (err) {
      console.error(
        `[audio] Failed to synthesize message ${i}`,
        err?.response?.data || err
      );
      throw err;
    }
    // generate lipsync
    await lipSyncMessage(i);
    message.audio = await audioFileToBase64(fileName);
    message.lipsync = await readJsonTranscript(`audios/message_${i}.json`);
  }

  return { messages };
};

app.post("/chat", async (req, res) => {
  try {
    const payload = await processChatFlow(req.body?.message);
    res.send(payload);
  } catch (error) {
    console.error("[chat] Failed to build response", error);
    res.status(500).send({ error: "Failed to process chat request." });
  }
});

const transcribeAudioToText = async (file) => {
  if (!file) {
    throw new Error("No audio provided for transcription.");
  }

  await fs.mkdir(tempUploadDir, { recursive: true });
  const extension =
    (file.originalname && path.extname(file.originalname)) || ".webm";
  const tempPath = path.join(
    tempUploadDir,
    `voice-${Date.now()}${extension || ".webm"}`
  );
  await fs.writeFile(tempPath, file.buffer);

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(tempPath),
      model: "gpt-4o-mini-transcribe",
      response_format: "text",
    });
    return typeof transcription === "string"
      ? transcription.trim()
      : transcription?.text?.trim();
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
};

app.post("/chat/voice", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    res.status(400).send({ error: "Audio file is required." });
    return;
  }

  try {
    const transcript = await transcribeAudioToText(req.file);
    if (!transcript) {
      res.status(400).send({ error: "Unable to transcribe the provided audio." });
      return;
    }

    const payload = await processChatFlow(transcript);
    res.send({ transcript, ...payload });
  } catch (error) {
    console.error("[chat/voice] Failed to handle voice request", error);
    res.status(500).send({ error: "Failed to process voice chat request." });
  }
});

const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

app.listen(port, () => {
  console.log(`Virtual Girlfriend listening on port ${port}`);
});
