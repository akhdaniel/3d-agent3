import { createContext, useContext, useEffect, useState } from "react";

const backendUrl = import.meta.env.VITE_API_URL || "http://localhost:28000";

const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const chat = async (message) => {
    setLoading(true);
    try {
      const data = await fetch(`${backendUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });
      const json = await data.json();
      if (!data.ok) {
        throw new Error(json?.error || "Failed to chat.");
      }
      const resp = json.messages || [];
      setMessages((messages) => [...messages, ...resp]);
      return json;
    } finally {
      setLoading(false);
    }
  };
  const chatFromVoice = async (audioBlob) => {
    if (!audioBlob) {
      return null;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "speech.webm");
      const data = await fetch(`${backendUrl}/chat/voice`, {
        method: "POST",
        body: formData,
      });
      const json = await data.json();
      if (!data.ok) {
        throw new Error(json?.error || "Failed to process voice chat.");
      }
      const resp = json.messages || [];
      setMessages((messages) => [...messages, ...resp]);
      return json;
    } finally {
      setLoading(false);
    }
  };
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState();
  const [loading, setLoading] = useState(false);
  const [cameraZoomed, setCameraZoomed] = useState(true);
  const onMessagePlayed = () => {
    setMessages((messages) => messages.slice(1));
  };

  useEffect(() => {
    if (messages.length > 0) {
      setMessage(messages[0]);
    } else {
      setMessage(null);
    }
  }, [messages]);

  return (
    <ChatContext.Provider
      value={{
        chat,
        chatFromVoice,
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
