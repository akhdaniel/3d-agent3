import { useEffect, useRef, useState } from "react";
import { useChat } from "../hooks/useChat";

export const UI = ({ hidden, ...props }) => {
  const input = useRef();
  const {
    chat,
    chatFromVoice,
    login,
    register,
    logout,
    isAuthenticated,
    authLoading,
    authError,
    loading,
    cameraZoomed,
    setCameraZoomed,
    message,
    currentUser,
    pendingTranscript,
  } = useChat();
  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const listeningStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const monitorIdRef = useRef(null);
  const silenceTimeoutRef = useRef(null);
  const isListeningRef = useRef(false);
  const isRecordingRef = useRef(false);
  const latestLoadingRef = useRef(loading);
  const latestMessageRef = useRef(message);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");

  useEffect(() => {
    latestLoadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    latestMessageRef.current = message;
  }, [message]);

  const sendMessage = () => {
    const text = input.current.value;
    if (!text.trim() || loading || message) {
      return;
    }
    chat(text.trim());
    input.current.value = "";
  };

  const requireAuthFields = () => {
    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthMessage("Please enter both username and password.");
      return false;
    }
    return true;
  };

  const handleLogin = async () => {
    if (!requireAuthFields()) {
      return;
    }
    setAuthMessage("");
    try {
      await login(authUsername.trim(), authPassword);
      setAuthPassword("");
    } catch (error) {
      setAuthMessage(error.message);
    }
  };

  const handleRegister = async () => {
    if (!requireAuthFields()) {
      return;
    }
    setAuthMessage("");
    try {
      await register(authUsername.trim(), authPassword);
      setAuthMessage("Account created! Please log in.");
      setAuthPassword("");
    } catch (error) {
      setAuthMessage(error.message);
    }
  };

  const cleanupSilenceTimer = () => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  };

  const stopRecordingInternal = () => {
    cleanupSilenceTimer();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  };

  const handleRecorderStop = async () => {
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    setIsRecording(false);
    isRecordingRef.current = false;
    const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
    if (!blob.size) {
      return;
    }
    try {
      await chatFromVoice(blob);
    } catch (err) {
      console.error("Failed to send voice chat", err);
    }
  };

  const startRecording = () => {
    if (
      !listeningStreamRef.current ||
      mediaRecorderRef.current ||
      latestLoadingRef.current ||
      latestMessageRef.current
    ) {
      return;
    }
    audioChunksRef.current = [];
    const recorder = new MediaRecorder(listeningStreamRef.current, {
      mimeType: "audio/webm",
    });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };
    recorder.onstop = handleRecorderStop;
    mediaRecorderRef.current = recorder;
    cleanupSilenceTimer();
    recorder.start();
    setIsRecording(true);
    isRecordingRef.current = true;
  };

  const monitorAudio = () => {
    if (!isListeningRef.current || !analyserRef.current) {
      return;
    }
    const analyser = analyserRef.current;
    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += Math.abs(dataArray[i] - 128);
    }
    const normalizedVolume = sum / bufferLength / 128;
    const speechThreshold = 0.06;
    const silenceThreshold = 0.02;

    if (!isRecordingRef.current && normalizedVolume > speechThreshold) {
      startRecording();
    } else if (isRecordingRef.current) {
      if (normalizedVolume < silenceThreshold) {
        if (!silenceTimeoutRef.current) {
          silenceTimeoutRef.current = setTimeout(() => {
            stopRecordingInternal();
          }, 1500);
        }
      } else {
        cleanupSilenceTimer();
      }
    }
    monitorIdRef.current = requestAnimationFrame(monitorAudio);
  };

  const stopListening = () => {
    setIsListening(false);
    isListeningRef.current = false;
    cleanupSilenceTimer();
    if (monitorIdRef.current) {
      cancelAnimationFrame(monitorIdRef.current);
      monitorIdRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    const stream = listeningStreamRef.current;
    listeningStreamRef.current = null;
    if (isRecordingRef.current) {
      stopRecordingInternal();
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    analyserRef.current = null;
  };

  const startListening = async () => {
    if (isListeningRef.current) {
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      listeningStreamRef.current = stream;
      const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextImpl();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      setIsListening(true);
      isListeningRef.current = true;
      monitorAudio();
    } catch (err) {
      console.error("Unable to start microphone monitoring", err);
      stopListening();
    }
  };

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);
  if (hidden) {
    return null;
  }

  if (!isAuthenticated) {
    const statusMessage = authMessage || authError;
    return (
      <div className="fixed inset-0 z-20 flex items-center justify-center p-4">
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-2xl w-full max-w-md p-6 pointer-events-auto">
          <h2 className="text-2xl font-bold mb-4 text-center">Welcome Back</h2>
          <div className="flex flex-col gap-3">
            <input
              className="p-3 rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pink-500"
              placeholder="Username"
              value={authUsername}
              onChange={(e) => setAuthUsername(e.target.value)}
              autoComplete="username"
            />
            <input
              type="password"
              className="p-3 rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pink-500"
              placeholder="Password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              autoComplete="current-password"
            />
            {statusMessage && (
              <p className="text-sm text-red-600">{statusMessage}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleLogin}
                disabled={authLoading}
                className={`flex-1 bg-pink-500 hover:bg-pink-600 text-white font-semibold rounded-md p-3 ${
                  authLoading ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                Log In
              </button>
              <button
                onClick={handleRegister}
                disabled={authLoading}
                className={`flex-1 bg-violet-500 hover:bg-violet-600 text-white font-semibold rounded-md p-3 ${
                  authLoading ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                Register
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const listenButtonDisabled = authLoading && !isListening;

  return (
    <>
      <div className="fixed top-0 left-0 right-0 bottom-0 z-10 flex justify-between p-4 flex-col pointer-events-none">
        <div className="self-start pointer-events-auto backdrop-blur-md bg-white bg-opacity-50 p-4 rounded-lg">
          <h1 className="font-black text-xl">Virtual CS</h1>
          <p>Ask me anything...in any language 😅</p>
          <div className="mt-2 flex items-center gap-2 text-sm">
            {currentUser && (
              <span className="text-gray-700">Logged in as {currentUser}</span>
            )}
            <button
              onClick={logout}
              className="pointer-events-auto bg-gray-900 text-white px-3 py-1 rounded-md text-xs uppercase tracking-wider"
            >
              Logout
            </button>
          </div>
        </div>
        <div className="w-full flex flex-col items-end justify-center gap-4">
          <button
            onClick={() => setCameraZoomed(!cameraZoomed)}
            className="pointer-events-auto bg-pink-500 hover:bg-pink-600 text-white p-4 rounded-md"
          >
            {cameraZoomed ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-6 h-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-6 h-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6"
                />
              </svg>
            )}
          </button>
          <button
            onClick={() => {
              const body = document.querySelector("body");
              if (body.classList.contains("greenScreen")) {
                body.classList.remove("greenScreen");
              } else {
                body.classList.add("greenScreen");
              }
            }}
            className="pointer-events-auto bg-pink-500 hover:bg-pink-600 text-white p-4 rounded-md"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6"
            >
              <path
                strokeLinecap="round"
                d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
          </button>
        </div>
        {pendingTranscript && (
          <div className="pointer-events-auto w-full max-w-screen-sm mx-auto mb-2">
            <div className="bg-white/80 backdrop-blur rounded-md px-4 py-2 text-sm text-gray-900 border border-white/70 shadow">
              <span className="font-semibold text-gray-700">You said:</span>{" "}
              <span className="italic">“{pendingTranscript}”</span>
            </div>
          </div>
        )}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pointer-events-auto max-w-screen-sm w-full mx-auto">
          <input
            className="w-full placeholder:text-gray-800 placeholder:italic p-4 rounded-md bg-opacity-50 bg-white backdrop-blur-md"
            placeholder="Type a message..."
            ref={input}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                sendMessage();
              }
            }}
          />
          <button
            disabled={loading || message}
            onClick={sendMessage}
            className={`bg-pink-500 hover:bg-pink-600 text-white p-4 px-10 font-semibold uppercase rounded-md w-full sm:w-auto  whitespace-nowrap ${
              loading || message ? "cursor-not-allowed opacity-30" : ""
            }`}
          >
            <span className="mr-2">►</span>Send
          </button>
          <button
            disabled={listenButtonDisabled}
            onClick={isListening ? stopListening : startListening}
            className={`${
              isListening
                ? "bg-red-500 hover:bg-red-600"
                : "bg-violet-500 hover:bg-violet-600"
            } text-white p-4 px-6 font-semibold uppercase rounded-md w-full sm:w-auto flex-none whitespace-nowrap ${
              listenButtonDisabled ? "cursor-not-allowed opacity-30" : ""
            }`}
          >
            {isListening ? (
              <>
                <span className="mr-2">⏹</span>Stop Listening
              </>
            ) : (
              <>
                <span className="mr-2">⏺</span>Start Listening
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
};
