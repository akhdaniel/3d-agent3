import { exec, execFile } from "child_process";
import crypto from "crypto";
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
const authDbPath = path.join(process.cwd(), "auth.db");
const activeTokens = new Map();

const runSqlite = (sql, { json = false } = {}) => {
  return new Promise((resolve, reject) => {
    const args = [];
    if (json) {
      args.push("-json");
    }
    args.push(authDbPath, sql);
    execFile("sqlite3", args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }
      if (json) {
        const trimmed = stdout.trim();
        if (!trimmed) {
          resolve([]);
          return;
        }
        try {
          resolve(JSON.parse(trimmed));
        } catch (parseError) {
          reject(parseError);
        }
        return;
      }
      resolve(stdout.trim());
    });
  });
};

const sqliteValue = (value = "") => `'${value.replace(/'/g, "''")}'`;

let authInitialized = false;
const initializeAuthStore = async () => {
  if (authInitialized) {
    return;
  }
  await runSqlite(
    "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL)"
  );
  authInitialized = true;
};

const hashPassword = (password, salt) =>
  crypto.scryptSync(password, salt, 64).toString("hex");

const createUserRecord = async (username, password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, salt);
  const sql = `INSERT INTO users (username, password_hash, salt) VALUES (${sqliteValue(
    username
  )}, ${sqliteValue(passwordHash)}, ${sqliteValue(salt)})`;
  await runSqlite(sql);
};

const getUserByUsername = async (username) => {
  const sql = `SELECT id, username, password_hash, salt FROM users WHERE username = ${sqliteValue(
    username
  )} LIMIT 1`;
  const rows = await runSqlite(sql, { json: true });
  return rows[0];
};

const verifyPassword = (password, user) => {
  if (!user) {
    return false;
  }
  const computed = hashPassword(password, user.salt);
  const storedBuffer = Buffer.from(user.password_hash, "hex");
  const computedBuffer = Buffer.from(computed, "hex");
  if (storedBuffer.length !== computedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(storedBuffer, computedBuffer);
};

const normalizeCredential = (value) => (value || "").trim();

const authenticateRequest = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).send({ error: "Missing authentication token." });
    return;
  }
  const token = authHeader.slice(7);
  const username = activeTokens.get(token);
  if (!username) {
    res.status(401).send({ error: "Invalid or expired token." });
    return;
  }
  req.user = { username, token };
  next();
};

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/voices", async (req, res) => {
  res.send(await voice.getVoices(elevenLabsApiKey));
});

app.post("/auth/register", async (req, res) => {
  const username = normalizeCredential(req.body?.username);
  const password = req.body?.password || "";
  if (!username || !password) {
    res.status(400).send({ error: "Username and password are required." });
    return;
  }
  if (password.length < 4) {
    res
      .status(400)
      .send({ error: "Password should be at least 4 characters long." });
    return;
  }
  try {
    const existing = await getUserByUsername(username);
    if (existing) {
      res.status(409).send({ error: "Username is already taken." });
      return;
    }
    await createUserRecord(username, password);
    res.send({ status: "registered" });
  } catch (error) {
    console.error("[auth/register] Failed to register user", error);
    res.status(500).send({ error: "Failed to register user." });
  }
});

app.post("/auth/login", async (req, res) => {
  const username = normalizeCredential(req.body?.username);
  const password = req.body?.password || "";
  if (!username || !password) {
    res.status(400).send({ error: "Username and password are required." });
    return;
  }
  try {
    const user = await getUserByUsername(username);
    if (!verifyPassword(password, user)) {
      res.status(401).send({ error: "Invalid username or password." });
      return;
    }
    const token = crypto.randomBytes(24).toString("hex");
    activeTokens.set(token, username);
    res.send({ token, username });
  } catch (error) {
    console.error("[auth/login] Failed to login user", error);
    res.status(500).send({ error: "Failed to login." });
  }
});

app.post("/auth/logout", authenticateRequest, (req, res) => {
  activeTokens.delete(req.user.token);
  res.send({ status: "logged_out" });
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
        You are a virtual assistant.
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

app.post("/chat", authenticateRequest, async (req, res) => {
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

app.post(
  "/chat/voice",
  authenticateRequest,
  upload.single("audio"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).send({ error: "Audio file is required." });
      return;
    }

    try {
      const transcript = await transcribeAudioToText(req.file);
      if (!transcript) {
        res
          .status(400)
          .send({ error: "Unable to transcribe the provided audio." });
        return;
      }

      const payload = await processChatFlow(transcript);
      res.send({ transcript, ...payload });
    } catch (error) {
      console.error("[chat/voice] Failed to handle voice request", error);
      res.status(500).send({ error: "Failed to process voice chat request." });
    }
  }
);

const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

const startServer = async () => {
  try {
    await initializeAuthStore();
    app.listen(port, () => {
      console.log(`Virtual CS listening on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to initialize authentication store", error);
    process.exit(1);
  }
};

startServer();
