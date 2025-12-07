import { createContext, useContext, useEffect, useState } from "react";

const backendUrl = import.meta.env.VITE_API_URL || "http://localhost:28000";
const tokenStorageKey = "vgf_token";

const ChatContext = createContext();

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
        body: JSON.stringify({ message: text }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || "Failed to chat.");
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
      const response = await fetch(`${backendUrl}/chat/voice`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: formData,
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || "Failed to process voice chat.");
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
