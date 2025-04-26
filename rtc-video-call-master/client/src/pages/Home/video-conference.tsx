"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  MdShare,
  MdContentCopy,
  MdMic,
  MdVolumeUp,
  MdVolumeOff,
  MdCircle,
  MdCallEnd,
  MdVideocam,
  MdVideocamOff,
  MdPersonOutline,
} from "react-icons/md";
import { toast } from "sonner";
import TranscriptPanel from "./transcript-panel";
import LanguageSelector from "./language-selector";
import { useWebRTC } from "@/hooks/useWebRTC";
import { LanguageCodes } from "@/constants/Language";

interface VideoConferenceProps {
  roomId: string;
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  shareableLink?: string;
  onStartRecording?: () => void;
  isRecording?: boolean;
  onLanguageChange?: (language: string) => void;
  selectedLanguage?: string;
  onToggleAudioSharing?: () => void;
  isAudioEnabled?: boolean;
  onToggleVideoSharing?: () => void;
  isVideoEnabled?: boolean;
  onDisconnect?: () => void;
  isConnected?: boolean;
  isWaitingForConnection?: boolean;
  transcripts?: Array<{
    id: string;
    text: string;
    sourceLanguage: string;
    targetLanguage: string;
    timestamp: Date;
    isUser?: boolean;
  }>;
}

const VideoConference = ({
  roomId,
  localStream,
  remoteStream,
  shareableLink,
  onStartRecording,
  isRecording = false,
  onLanguageChange,
  selectedLanguage = "en-US",
  onToggleAudioSharing,
  isAudioEnabled = true,
  onToggleVideoSharing,
  isVideoEnabled = true,
  onDisconnect,
  isConnected: propIsConnected,
  isWaitingForConnection = false,
  transcripts = [],
}: VideoConferenceProps) => {
  const [sourceLanguage, setSourceLanguage] = useState(selectedLanguage);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  // Sync sourceLanguage with parent's selectedLanguage when it changes
  useEffect(() => {
    setSourceLanguage(selectedLanguage);
  }, [selectedLanguage]);

  // Fallback to useWebRTC hook when streams are not provided from parent
  const {
    isConnected: hookIsConnected,
    localVideoRef: hookLocalVideoRef,
    remoteVideoRef: hookRemoteVideoRef,
  } = useWebRTC({ roomId });

  // Determine which values to use based on whether parent streams are provided
  const isConnected =
    propIsConnected !== undefined
      ? propIsConnected
      : remoteStream
      ? true
      : hookIsConnected;
  const effectiveLocalVideoRef = localStream
    ? localVideoRef
    : hookLocalVideoRef;
  const effectiveRemoteVideoRef = remoteStream
    ? remoteVideoRef
    : hookRemoteVideoRef;

  // Set video streams if provided from parent
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      console.log("Setting local video stream in VideoConference");
      localVideoRef.current.srcObject = localStream;
    }

    if (remoteStream && remoteVideoRef.current) {
      console.log("Setting remote video stream in VideoConference");
      remoteVideoRef.current.srcObject = remoteStream;

      // Ensure video plays automatically
      remoteVideoRef.current.onloadedmetadata = () => {
        remoteVideoRef.current
          ?.play()
          .catch((e) => console.error("Error playing remote video:", e));
      };
    }
  }, [localStream, remoteStream]);

  // Fix for video playback when toggling isVideoEnabled
  useEffect(() => {
    if (isVideoEnabled && localStream && effectiveLocalVideoRef.current) {
      console.log("Refreshing video stream after enabling");

      // Set a small timeout to ensure DOM updates are processed
      setTimeout(() => {
        if (effectiveLocalVideoRef.current) {
          // Store current stream first
          const currentStream = localStream;

          // Reset srcObject
          effectiveLocalVideoRef.current.srcObject = null;

          // Apply stream again after a small delay
          setTimeout(() => {
            if (effectiveLocalVideoRef.current) {
              effectiveLocalVideoRef.current.srcObject = currentStream;
              effectiveLocalVideoRef.current
                .play()
                .catch((e) =>
                  console.error("Error playing local video after toggle:", e)
                );
            }
          }, 50);
        }
      }, 50);
    }
  }, [isVideoEnabled, localStream]);

  // Function to handle video element loading
  const handleVideoLoaded = () => {
    console.log("Local video element loaded");
    if (
      effectiveLocalVideoRef.current &&
      effectiveLocalVideoRef.current.paused
    ) {
      effectiveLocalVideoRef.current
        .play()
        .catch((e) => console.error("Error playing video on load:", e));
    }
  };

  const shareRoomLink = () => {
    const linkToShare =
      shareableLink ||
      `${window.location.origin}${window.location.pathname}?roomId=${roomId}`;
    navigator.clipboard.writeText(linkToShare);
    toast("Room link has been copied to clipboard", {
      description: "Share this link with others to join your room",
    });
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    toast("Room ID has been copied to clipboard", {
      description: "Share this ID with others to join your room",
    });
  };

  const handleSourceLanguageChange = (languageCode: string) => {
    // Update local state
    setSourceLanguage(languageCode);

    // Call the parent's language change handler if provided
    if (onLanguageChange) {
      onLanguageChange(languageCode);
    }

    toast("Source language changed", {
      description: `Source language set to ${
        LanguageCodes[languageCode] || languageCode
      }`,
    });
  };

  return (
    <div className="container mx-auto pt-4 px-4 flex flex-col pb-10">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-teal-700">NexTalk</h1>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={copyRoomId}
            className="flex items-center gap-2 border-teal-600 text-teal-600"
          >
            <MdContentCopy className="h-4 w-4" /> Room ID: {roomId}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={shareRoomLink}
            className="flex items-center gap-2 border-teal-600 text-teal-600"
          >
            <MdShare className="h-4 w-4" /> Share Link
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-grow">
        <div className="md:col-span-2">
          <Card className="relative h-max overflow-hidden p-0">
            {/* Remote video (or waiting state) */}
            {isConnected ? (
              <video
                ref={effectiveRemoteVideoRef}
                autoPlay
                playsInline
                muted={false}
                className="w-full aspect-video object-cover"
                id="remote-video"
              />
            ) : (
              <div className="w-full aspect-video flex items-center justify-center bg-gray-200">
                <div className="text-center">
                  <p className="text-2xl text-gray-600">
                    {isWaitingForConnection
                      ? "Waiting for another user to join..."
                      : "Establishing connection..."}
                  </p>
                  {isWaitingForConnection && (
                    <p className="mt-2 text-gray-500">
                      Share the room ID or link with someone to start the call
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Local video thumbnail */}
            <div className="absolute bottom-4 right-4 w-1/4 h-1/4 bg-teal-400 rounded overflow-hidden">
              {isVideoEnabled ? (
                <video
                  ref={effectiveLocalVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                  id="local-video"
                  onLoadedMetadata={handleVideoLoaded}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-200">
                  <MdPersonOutline className="h-12 w-12 text-gray-600" />
                </div>
              )}
            </div>
          </Card>

          <div className="flex justify-center mt-4 space-x-4 items-center">
            <div className="flex items-center gap-2">
              {/* Audio sharing toggle button */}
              {onToggleAudioSharing && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onToggleAudioSharing}
                  className={`${
                    !isAudioEnabled
                      ? "bg-gray-100 border-gray-600 text-gray-600"
                      : "border-blue-600 text-blue-600"
                  }`}
                  title={
                    isAudioEnabled ? "Mute microphone" : "Unmute microphone"
                  }
                >
                  {isAudioEnabled ? (
                    <MdVolumeUp className="h-5 w-5" />
                  ) : (
                    <MdVolumeOff className="h-5 w-5" />
                  )}
                </Button>
              )}

              {/* Video sharing toggle button */}
              {onToggleVideoSharing && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onToggleVideoSharing}
                  className={`${
                    !isVideoEnabled
                      ? "bg-gray-100 border-gray-600 text-gray-600"
                      : "border-blue-600 text-blue-600"
                  }`}
                  title={isVideoEnabled ? "Pause video" : "Resume video"}
                >
                  {isVideoEnabled ? (
                    <MdVideocam className="h-5 w-5" />
                  ) : (
                    <MdVideocamOff className="h-5 w-5" />
                  )}
                </Button>
              )}

              {/* Audio recording button */}
              {onStartRecording && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onStartRecording}
                  className={`${
                    isRecording
                      ? "bg-red-100 border-red-600 text-red-600"
                      : "border-teal-600 text-teal-600"
                  }`}
                  title={isRecording ? "Stop recording" : "Start recording"}
                >
                  {isRecording ? (
                    <MdCircle className="h-5 w-5 fill-red-600" />
                  ) : (
                    <MdMic className="h-5 w-5" />
                  )}
                </Button>
              )}

              {/* Disconnect button */}
              {onDisconnect && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onDisconnect}
                  className="bg-red-100 border-red-600 text-red-600"
                  title="Disconnect call"
                >
                  <MdCallEnd className="h-5 w-5" />
                </Button>
              )}
            </div>

            <LanguageSelector
              onLanguageChange={handleSourceLanguageChange}
              selectedLanguage={sourceLanguage}
            />
          </div>
        </div>

        <div className="h-full">
          <TranscriptPanel transcripts={transcripts} />
        </div>
      </div>
    </div>
  );
};

export default VideoConference;
