import { createContext, useContext, useEffect, useState } from "react";

const backendUrl = import.meta.env.VITE_API_URL || "http://localhost:28000";
const tokenStorageKey = "vgf_token";

const ChatContext = createContext();

const defaultVoiceId = "EXAVITQu4vr4xnSDxMaL";
const avatarOptions = [
  { id: "avatar1", label: "Sarah", voice_id: defaultVoiceId, gender: "female" },
  { id: "avatar2", label: "Christina", voice_id: "2qfp6zPuviqeCOZIE9RZ", gender: "female" },
  { id: "avatar3", label: "Nathaniel", voice_id: "AeRdCCKzvd23BpJoofzx", gender: "male" },
  { id: "avatar4", label: "Roger", voice_id: "CwhRBWXzGAHq8TQ4Fs17", gender: "male" },
  { id: "avatar5", label: "Laura", voice_id: "FGY2WhTYpPnrIDTdsKH5", gender: "female" },
  { id: "avatar6", label: "Charlie", voice_id: "IKne3meq5aSn9XLyUdCD", gender: "male" },
  { id: "avatar7", label: "George", voice_id: "JBFqnCBsd6RMkjVDRZzb", gender: "male" },
  { id: "avatar8", label: "Alice", voice_id: "Xb7hH8MSUJpSbSDYk0k2", gender: "female" },
  { id: "avatar9", label: "Matilda", voice_id: "XrExE9yKIg1WjnnlVkGX", gender: "female" },
  { id: "avatar10", label: "Jessica", voice_id: "cgSgspJ2msm6clMCkdW9", gender: "female" },
  { id: "avatar11", label: "Eric", voice_id: "cjVigY5qzO86Huf0OWal", gender: "male" },
  { id: "avatar12", label: "Chris", voice_id: "iP95p4xoKVk53GoZ742B", gender: "male" },
  { id: "avatar13", label: "Lily", voice_id: "pFZP5JQG7iQjIQuC4Bku", gender: "female" },
  { id: "avatar14", label: "Hamza", voice_id: "J4kQFVIiNWmFK9sHjJQZ", gender: "male" },
  { id: "avatar15", label: "Wendy", voice_id: "g6xIsTj2HwM6VR4iXFCw", gender: "female" },
  { id: "avatar16", label: "Catherine", voice_id: "LQQLqMaLCEPaf5ykcxhm", gender: "female" },
];

const getVoiceIdForAvatar = (avatarId) => {
  const match = avatarOptions.find((option) => option.id === avatarId);
  return match?.voice_id || avatarOptions[0]?.voice_id || defaultVoiceId;
};

const getAvatarName = (avatarId) => {
  const match = avatarOptions.find((option) => option.id === avatarId);
  return match?.label || avatarOptions[0]?.label || "Virtual CS";
};

const readStoredToken = () => {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(tokenStorageKey);
};

export const ChatProvider = ({ children }) => {
  const [authToken, setAuthToken] = useState(readStoredToken);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState();
  const [loading, setLoading] = useState(false);
  const [cameraZoomed, setCameraZoomed] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedAvatar, setSelectedAvatar] = useState("avatar1");
  const [pendingTranscript, setPendingTranscript] = useState("");

  const isAuthenticated = Boolean(authToken);

  const onMessagePlayed = () => {
    setMessages((messages) => {
      const next = messages.slice(1);
      if (next.length === 0) {
        setPendingTranscript("");
      }
      return next;
    });
  };

  useEffect(() => {
    if (messages.length > 0) {
      setMessage(messages[0]);
    } else {
      setMessage(null);
    }
  }, [messages]);

  const chat = async (text) => {
    if (!authToken) {
      throw new Error("Please log in first.");
    }
    setLoading(true);
    try {
      const response = await fetch(`${backendUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          message: text,
          voice_id: getVoiceIdForAvatar(selectedAvatar),
          avatarName: getAvatarName(selectedAvatar),
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        const errorMessage = json?.error || "Failed to chat.";
        if (errorMessage === "Invalid or expired token.") {
          await logout();
          throw new Error("Session expired. Please log in again.");
        }
        throw new Error(errorMessage);
      }
      const resp = json.messages || [];
      setMessages((messages) => [...messages, ...resp]);
      setPendingTranscript("");
      return json;
    } finally {
      setLoading(false);
    }
  };

  const chatFromVoice = async (audioBlob) => {
    if (!authToken) {
      throw new Error("Please log in first.");
    }
    if (!audioBlob) {
      return null;
    }
    setPendingTranscript("");
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "speech.webm");
      formData.append("voice_id", getVoiceIdForAvatar(selectedAvatar));
      formData.append("avatarName", getAvatarName(selectedAvatar));
      const response = await fetch(`${backendUrl}/chat/voice`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: formData,
      });
      const json = await response.json();
      if (!response.ok) {
        const errorMessage = json?.error || "Failed to process voice chat.";
        if (errorMessage === "Invalid or expired token.") {
          await logout();
          throw new Error("Session expired. Please log in again.");
        }
        throw new Error(errorMessage);
      }
      setPendingTranscript(json?.transcript || "");
      const resp = json.messages || [];
      setMessages((messages) => [...messages, ...resp]);
      return json;
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    setAuthLoading(true);
    setAuthError("");
    try {
      const response = await fetch(`${backendUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || "Failed to login.");
      }
      setAuthToken(json.token);
      setCurrentUser(json.username || username);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(tokenStorageKey, json.token);
      }
      return json;
    } catch (error) {
      setAuthError(error.message);
      throw error;
    } finally {
      setAuthLoading(false);
    }
  };

  const register = async (username, password) => {
    setAuthLoading(true);
    setAuthError("");
    try {
      const response = await fetch(`${backendUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || "Failed to register.");
      }
      return json;
    } catch (error) {
      setAuthError(error.message);
      throw error;
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    const token = authToken;
    setAuthToken(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(tokenStorageKey);
    }
    setMessages([]);
    setMessage(null);
    setCurrentUser(null);
    setPendingTranscript("");
    if (!token) {
      return;
    }
    try {
      await fetch(`${backendUrl}/auth/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (error) {
      console.warn("Logout request failed", error);
    }
  };

  return (
    <ChatContext.Provider
      value={{
        chat,
        chatFromVoice,
        login,
        register,
        logout,
        isAuthenticated,
        authLoading,
        authError,
        currentUser,
        pendingTranscript,
        message,
        onMessagePlayed,
        loading,
        cameraZoomed,
        setCameraZoomed,
        selectedAvatar,
        setSelectedAvatar,
        avatarOptions,
        getAvatarName,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};
