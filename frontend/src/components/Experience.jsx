import {
  CameraControls,
  ContactShadows,
  Environment,
  Text,
  useProgress,
} from "@react-three/drei";
import { Suspense, useEffect, useRef, useState } from "react";
import { useChat } from "../hooks/useChat";
import { Avatar } from "./Avatar";

const Dots = (props) => {
  const { loading } = useChat();
  const { active, progress } = useProgress();
  const [loadingText, setLoadingText] = useState("");
  useEffect(() => {
    if (loading) {
      const interval = setInterval(() => {
        setLoadingText((loadingText) => {
          if (loadingText.length > 2) {
            return ".";
          }
          return loadingText + ".";
        });
      }, 800);
      return () => clearInterval(interval);
    } else {
      setLoadingText("");
    }
  }, [loading]);
  if (active) {
    return (
      <group {...props}>
        <Text fontSize={0.14} anchorX={"left"} anchorY={"bottom"}>
          {`Loading ${Math.round(progress)}%`}
          <meshBasicMaterial attach="material" color="black" />
        </Text>
      </group>
    );
  }
  if (!loading) return null;
  return (
    <group {...props}>
      <Text fontSize={0.14} anchorX={"left"} anchorY={"bottom"}>
        {loadingText}
        <meshBasicMaterial attach="material" color="black" />
      </Text>
    </group>
  );
};

export const Experience = () => {
  const cameraControls = useRef();
  const { cameraZoomed, selectedAvatar } = useChat();
  const activeAvatarId = selectedAvatar || "avatar1";

  useEffect(() => {
    cameraControls.current.setLookAt(0, 1, 2, 0, 3, 4);
  }, []);

  useEffect(() => {
    if (cameraZoomed) {
      console.log(cameraZoomed)
      cameraControls.current.setLookAt(0, 1.6, 2, 0, 1.5, 0, true);
    } else {
      console.log(cameraZoomed)
      cameraControls.current.setLookAt(0, 1.6, 5, 0, 1.0, 0, true);
    }
  }, [cameraZoomed]);
  return (
    <>
      <CameraControls ref={cameraControls} />
      <Environment preset="sunset" />
      {/* Wrapping Dots into Suspense to prevent Blink when Troika/Font is loaded */}
      <Suspense>
        <Dots position-y={1.75} position-x={-0.02} />
      </Suspense>
      <Avatar key={activeAvatarId} avatarId={activeAvatarId} />
      <ContactShadows opacity={0.7} />
    </>
  );
};
