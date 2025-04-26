"use client";

import { useState, useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import JoinRoom from "./pages/Home/join-room";
import VideoConference from "./pages/Home/video-conference";
import SocketManager from "./config/socket";
import { generateShareableLink, updateUrlWithRoomId } from "./lib/function";

// WebRTC configuration
const configuration: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    // Add multiple TURN servers for better reliability
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:80?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: "all" as RTCIceTransportPolicy,
  bundlePolicy: "max-bundle" as RTCBundlePolicy,
  rtcpMuxPolicy: "require" as RTCRtcpMuxPolicy,
};

function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isJoined, setIsJoined] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const rtcConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const [socketReady, setSocketReady] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [, setHasRemoteStream] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState("en-US");
  const selectedLanguageRef = useRef("en-US"); // Create a ref to keep current value for callbacks
  const [isConnected, setIsConnected] = useState(false); // Add state for connection status
  const [transcripts, setTranscripts] = useState<
    Array<{
      id: string;
      text: string;
      sourceLanguage: string;
      targetLanguage: string;
      timestamp: Date;
      isUser?: boolean;
    }>
  >([]);
  const [isWaitingForConnection, setIsWaitingForConnection] = useState(false);

  // Update ref when selectedLanguage changes
  useEffect(() => {
    selectedLanguageRef.current = selectedLanguage;
  }, [selectedLanguage]);

  // Track component mounting/unmounting for socket lifecycle
  useEffect(() => {
    // Check if there's a room ID in the URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomIdParam = urlParams.get("roomId");

    if (roomIdParam) {
      setRoomId(roomIdParam);
    }

    return () => {
      // Cleanup media and RTC
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (rtcConnectionRef.current) {
        rtcConnectionRef.current.close();
      }

      // Stop media recorder if active
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }

      // Disconnect socket on unmount
      SocketManager.disconnect();
    };
  }, []);

  // Setup socket connection after joining
  useEffect(() => {
    if (!isJoined || !roomId) return;

    // Set the room ID in the manager
    SocketManager.setRoomId(roomId);

    try {
      // Connect to socket
      const socket = SocketManager.connect(() => {
        setSocketReady(true);
        // Refresh the session timestamp when joining a room
      });

      // Only set up event listeners once
      if (!SocketManager.hasEventListeners()) {
        // Extra check to prevent duplicate listeners
        socket.off("offer");
        socket.off("answer");
        socket.off("ice-candidate");
        socket.off("user-joined");
        socket.off("user-left");
        socket.off("room-full");
        socket.off("transcription");
        socket.off("text-to-speech-response");
        socket.off("text-to-speech-error");

        socket.on("offer", async (offerData) => {
          // Extract session ID and socket ID if available
          const fromSessionId = offerData.fromSessionId;
          const fromSocketId = offerData.fromSocketId;

          console.log(
            "Received offer",
            fromSocketId ? `from socket ${fromSocketId}` : "",
            fromSessionId ? `(Session: ${fromSessionId})` : "",
            "Offer data:",
            offerData
          );

          try {
            if (!rtcConnectionRef.current) {
              console.log("Creating new RTCPeerConnection for answering offer");
              rtcConnectionRef.current = new RTCPeerConnection(configuration);
              setupRTCListeners();
            }

            let offer;
            // Handle both formats of offer
            if (offerData.type && offerData.sdp) {
              // Direct format
              offer = {
                type: offerData.type,
                sdp: offerData.sdp,
              };
            } else if (
              offerData.offer &&
              offerData.offer.type &&
              offerData.offer.sdp
            ) {
              // Nested format
              offer = {
                type: offerData.offer.type,
                sdp: offerData.offer.sdp,
              };
            } else {
              throw new Error("Invalid offer format received");
            }

            console.log("Setting remote description from offer");
            await rtcConnectionRef.current.setRemoteDescription(
              new RTCSessionDescription(offer)
            );

            console.log("Creating answer after receiving offer");
            const answer = await rtcConnectionRef.current.createAnswer();
            console.log("Setting local description for answer:", answer);
            await rtcConnectionRef.current.setLocalDescription(answer);

            console.log("Sending answer back to peer");
            socket.emit("answer", {
              answer: answer,
              roomId: SocketManager.getRoomId(),
            });
          } catch (error) {
            console.error("Error processing offer:", error);
            toast("Connection error", {
              description: "Failed to process connection offer",
            });
          }
        });

        socket.on("answer", async (answerData) => {
          // Extract session ID and socket ID if available
          const fromSessionId = answerData.fromSessionId;
          const fromSocketId = answerData.fromSocketId;

          console.log(
            "Received answer",
            fromSocketId ? `from socket ${fromSocketId}` : "",
            fromSessionId ? `(Session: ${fromSessionId})` : "",
            "Answer data:",
            answerData
          );

          try {
            if (rtcConnectionRef.current) {
              let answer;
              // Handle both formats of answer
              if (answerData.type && answerData.sdp) {
                // Direct format
                answer = {
                  type: answerData.type,
                  sdp: answerData.sdp,
                };
              } else if (
                answerData.answer &&
                answerData.answer.type &&
                answerData.answer.sdp
              ) {
                // Nested format
                answer = {
                  type: answerData.answer.type,
                  sdp: answerData.answer.sdp,
                };
              } else {
                throw new Error("Invalid answer format received");
              }

              console.log("Setting remote description from answer");
              await rtcConnectionRef.current.setRemoteDescription(
                new RTCSessionDescription(answer)
              );
              console.log("Remote description set successfully after answer");
            } else {
              console.error(
                "Cannot set remote description, no RTCPeerConnection"
              );
            }
          } catch (error) {
            console.error("Error processing answer:", error);
            toast("Connection error", {
              description: "Failed to establish connection with peer",
            });
          }
        });

        socket.on("ice-candidate", async (candidateData) => {
          // Extract session ID and socket ID if available
          const fromSessionId = candidateData.fromSessionId;
          const fromSocketId = candidateData.fromSocketId;

          console.log(
            "Received ICE candidate",
            fromSocketId ? `from socket ${fromSocketId}` : "",
            fromSessionId ? `(Session: ${fromSessionId})` : "",
            "Candidate data:",
            candidateData
          );

          try {
            if (rtcConnectionRef.current) {
              // Handle both possible formats of ice candidate
              let candidate;

              if (
                candidateData.candidate &&
                typeof candidateData.candidate === "string"
              ) {
                // Format 1: direct string candidate
                candidate = new RTCIceCandidate({
                  candidate: candidateData.candidate,
                  sdpMid: candidateData.sdpMid || null,
                  sdpMLineIndex: candidateData.sdpMLineIndex || 0,
                  usernameFragment: candidateData.usernameFragment || null,
                });
              } else if (
                candidateData.candidate &&
                typeof candidateData.candidate === "object"
              ) {
                // Format 2: candidate is an object
                candidate = new RTCIceCandidate(candidateData.candidate);
              } else {
                // Try to use the candidateData directly if it has candidate property
                candidate = new RTCIceCandidate(candidateData);
              }

              console.log("Adding ICE candidate:", candidate);
              await rtcConnectionRef.current.addIceCandidate(candidate);
              console.log("Added ICE candidate successfully");
            } else {
              console.warn(
                "Received ICE candidate but no RTCPeerConnection exists"
              );
            }
          } catch (error) {
            console.error(
              "Error adding ICE candidate:",
              error,
              "Candidate data:",
              candidateData
            );
          }
        });

        socket.on("user-joined", (data) => {
          // Store the remote user's session ID if available
          const remoteSessionId = data.sessionId;
          console.log(
            "User joined:",
            data.userId,
            remoteSessionId ? `(Session: ${remoteSessionId})` : ""
          );

          toast(`Another user joined the room`, {
            description: "Establishing connection...",
          });

          // Set waiting state to false when user joins
          setIsWaitingForConnection(false);

          // Both creator and joiner should initiate call to improve connection success rate
          initiateCall();
        });

        socket.on("user-left", (data) => {
          const remoteSessionId = data.sessionId;
          console.log(
            "User left:",
            data.userId,
            remoteSessionId ? `(Session: ${remoteSessionId})` : ""
          );

          toast(`The other user left the room`);

          // Clear remote stream when user leaves
          remoteStreamRef.current = null;

          // Set connection status to false when user leaves
          setIsConnected(false);

          // Set waiting state to true when user leaves
          setIsWaitingForConnection(true);
        });

        socket.on("room-full", (data) => {
          console.log("Room is full:", data.roomId);
          setJoinError("This room is already full (maximum 2 participants)");
          setIsJoined(false);

          toast("Room is full", {
            description: "This room already has 2 participants",
          });
        });

        // Add listener for transcription event from server
        socket.on("transcription", (data) => {
          console.log("Received transcription from server:", data);

          // Add the transcription to our state
          setTranscripts((prevTranscripts) => [
            ...prevTranscripts,
            {
              id: Date.now().toString(),
              text: data.transcription, // server sends 'transcription' field
              sourceLanguage: data.language || "Unknown",
              targetLanguage: selectedLanguageRef.current, // Use ref to ensure latest value
              timestamp: new Date(),
              isUser: data.isOwnMessage, // Use isOwnMessage flag from server
            },
          ]);
        });

        // Set up text-to-speech response handler
        socket.on("text-to-speech-response", (data) => {
          console.log("Received text-to-speech audio from server");

          // Create an audio element to play the speech
          const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);

          // Play the audio
          audio.play().catch((error) => {
            console.error("Error playing audio:", error);
            toast("Error playing audio", {
              description: "Could not play the generated speech",
            });
          });
        });

        // Handle text-to-speech errors
        socket.on("text-to-speech-error", (error) => {
          console.error("Text-to-speech error:", error);
          toast("Text-to-speech error", {
            description: error.error || "Failed to generate speech",
          });
        });

        SocketManager.setEventListenersSet(true);
        console.log("Socket event listeners set up");
      }
    } catch (error) {
      console.error("Error setting up socket connection:", error);
      toast("Connection Error", {
        description: "Failed to connect to server",
      });
    }

    return () => {
      // Do not disconnect here, just notify that we're leaving the room
      if (isJoined && roomId) {
        console.log(`Leaving room ${roomId}`);
        const socket = SocketManager.getSocket();
        socket?.emit("leave-room", { roomId });

        // Stop media recorder if active
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state !== "inactive"
        ) {
          mediaRecorderRef.current.stop();
        }
      }
    };
  }, [isJoined, roomId, isCreator]);

  // Handle room actions after joining/creating and socket is ready
  useEffect(() => {
    if (!isJoined || !roomId || !socketReady) return;

    console.log(`Socket ready, handling room actions for ${roomId}`);

    const setupRoom = async () => {
      // Setup media stream first
      await setupMediaStream();

      const socket = SocketManager.getSocket();
      if (!socket) return;

      if (isCreator) {
        console.log(`Creating room ${roomId}`);
        // Create room via socket
        socket.emit("create-room", { roomId });

        toast("Room created successfully", {
          description: `Your room ID: ${roomId}`,
        });
      } else {
        console.log(`Joining room ${roomId}`);
        // Join room via socket
        socket.emit("join-room", { roomId });

        toast("Connecting to room", {
          description: `Attempting to join room: ${roomId}`,
        });

        // Note: We'll wait for the user-joined event before initiating call
      }
    };

    setupRoom();
    // Only run this once when socket becomes ready
  }, [isJoined, roomId, socketReady]);

  const setupRTCListeners = () => {
    if (!rtcConnectionRef.current) return;

    rtcConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("Generated ICE candidate:", event.candidate);
        const socket = SocketManager.getSocket();

        // Send in a consistent format
        socket?.emit("ice-candidate", {
          candidate: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            usernameFragment: event.candidate.usernameFragment,
          },
          roomId: SocketManager.getRoomId(),
        });
      }
    };

    rtcConnectionRef.current.ontrack = (event) => {
      console.log("Received remote track:", event.track.kind);

      // Make sure we're creating a new remote stream or adding to existing one
      if (!remoteStreamRef.current) {
        console.log("Creating new remote stream");
        remoteStreamRef.current = new MediaStream();
      }

      // Add the track to our remote stream
      remoteStreamRef.current.addTrack(event.track);

      // Update state to trigger rerender
      setHasRemoteStream(true);

      // Set connection status to true when we receive tracks
      setIsConnected(true);

      // Let the VideoConference component handle the video rendering
      // No direct DOM manipulation needed here
    };

    // Debugging connection state changes
    rtcConnectionRef.current.onconnectionstatechange = () => {
      console.log(
        "Connection state changed:",
        rtcConnectionRef.current?.connectionState
      );

      // Update connection state when connection is successful
      if (rtcConnectionRef.current?.connectionState === "connected") {
        toast("Call connected", {
          description: "Successfully established connection",
        });
        setIsConnected(true);
      } else if (
        rtcConnectionRef.current?.connectionState === "disconnected" ||
        rtcConnectionRef.current?.connectionState === "failed" ||
        rtcConnectionRef.current?.connectionState === "closed"
      ) {
        setIsConnected(false);
      }
    };

    rtcConnectionRef.current.oniceconnectionstatechange = () => {
      console.log(
        "ICE connection state changed:",
        rtcConnectionRef.current?.iceConnectionState
      );
    };

    // Add local stream tracks to the connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        if (localStreamRef.current && rtcConnectionRef.current) {
          console.log("Adding local track to connection:", track.kind);
          rtcConnectionRef.current.addTrack(track, localStreamRef.current);
        }
      });
    } else {
      console.warn("No local stream available when setting up RTC listeners");
    }
  };

  const setupMediaStream = async () => {
    try {
      console.log("Setting up media stream...");

      // Check if we need to create a new stream
      if (localStreamRef.current) {
        console.log("Local stream already exists, reusing it");
        return localStreamRef.current;
      }

      // Check what devices are available
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasAudio = devices.some((device) => device.kind === "audioinput");
      const hasVideo = devices.some((device) => device.kind === "videoinput");

      if (!hasAudio && !hasVideo) {
        throw new Error("No audio or video devices found");
      }

      console.log("Available devices:", {
        audio: hasAudio,
        video: hasVideo,
      });

      // Request media with constraints
      const constraints = {
        audio: hasAudio,
        video: hasVideo
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : false,
      };

      console.log("Requesting media with constraints:", constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      console.log("Media stream created with tracks:", {
        audioTracks: stream.getAudioTracks().length,
        videoTracks: stream.getVideoTracks().length,
      });

      // Ensure video tracks are ready
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length > 0) {
        console.log("Ensuring video tracks are ready");
        // Make sure video track is enabled
        videoTracks.forEach((track) => {
          track.enabled = true;
        });
      }

      localStreamRef.current = stream;

      // No direct DOM manipulation - VideoConference will handle displaying local video
      return stream;
    } catch (error) {
      console.error("Error accessing media devices:", error);
      toast("Error accessing camera/microphone", {
        description: "Please check your device permissions",
      });
      return null;
    }
  };

  const initiateCall = async () => {
    if (!localStreamRef.current) {
      console.log("No local stream, setting up media first");
      await setupMediaStream();
    }

    console.log("Initiating call, creating new RTCPeerConnection");
    // Close existing connection if any
    if (rtcConnectionRef.current) {
      console.log("Closing existing connection before creating a new one");
      rtcConnectionRef.current.close();
    }

    rtcConnectionRef.current = new RTCPeerConnection(configuration);
    setupRTCListeners();

    try {
      console.log("Creating offer");
      const offer = await rtcConnectionRef.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      console.log("Setting local description for offer:", offer);
      await rtcConnectionRef.current.setLocalDescription(offer);

      console.log("Sending offer");
      const socket = SocketManager.getSocket();
      socket?.emit("offer", {
        offer: {
          type: offer.type,
          sdp: offer.sdp,
        },
        roomId: SocketManager.getRoomId(),
      });
    } catch (error) {
      console.error("Error creating or sending offer:", error);
      toast("Connection error", {
        description: "Failed to initiate call",
      });
    }
  };

  const handleJoinRoom = async (id: string) => {
    setRoomId(id);
    setIsJoined(true);
    setIsCreator(false);
    setJoinError(null);
    setIsConnected(false); // Initially not connected when joining a room
    setIsWaitingForConnection(false); // Not waiting for others when joining an existing room

    // Update URL with room ID
    updateUrlWithRoomId(id);
  };

  const handleCreateRoom = async () => {
    // Generate a random room ID
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomId(newRoomId);
    setIsJoined(true);
    setIsCreator(true);
    setJoinError(null);
    setIsConnected(false); // Initially not connected when creating a room
    setIsWaitingForConnection(true); // Initially waiting for connection when creating a room

    // Update URL with room ID
    updateUrlWithRoomId(newRoomId);
  };

  const startAudioRecording = () => {
    console.log("Manual audio recording requested");

    // If already recording, stop it
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      console.log("Already recording, stopping current recording");
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      return;
    }

    // Check if we have a stream
    if (!localStreamRef.current) {
      console.log("No local stream available, can't start recording");
      toast("Can't start recording", {
        description: "Microphone not available yet",
      });
      return;
    }

    // Create a new audio stream with just the audio track
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (!audioTrack) {
      console.log("No audio track available");
      toast("Can't start recording", {
        description: "No audio track available",
      });
      return;
    }

    const audioStream = new MediaStream([audioTrack]);
    console.log("Starting manual audio recording");

    // Set up MediaRecorder with compatible format
    try {
      // Check for supported MIME types
      console.log("Checking supported audio MIME types for MediaRecorder");
      const supportedMimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
        "audio/mpeg",
      ];

      let selectedMimeType = "";
      for (const mimeType of supportedMimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          console.log(`Found supported MIME type: ${mimeType}`);
          selectedMimeType = mimeType;
          break;
        } else {
          console.log(`MIME type not supported: ${mimeType}`);
        }
      }

      let options = {};
      if (selectedMimeType) {
        options = { mimeType: selectedMimeType };
        console.log(`Using MediaRecorder with MIME type: ${selectedMimeType}`);
      } else {
        console.log("No supported MIME types found, using default");
      }

      try {
        const recorder = new MediaRecorder(audioStream, options);
        console.log("MediaRecorder created successfully:", {
          state: recorder.state,
          mimeType: recorder.mimeType,
        });
        mediaRecorderRef.current = recorder;

        // Clear existing chunks
        audioChunksRef.current = [];

        // Set up event handlers
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            console.log(
              `Manual recording: Audio data available: size=${event.data.size}, type=${event.data.type}`
            );
            audioChunksRef.current.push(event.data);
            console.log(
              `Manual recording: Audio chunks array length: ${audioChunksRef.current.length}`
            );
          } else {
            console.log("Received empty audio data");
          }
        };

        recorder.onstop = () => {
          console.log(
            "MediaRecorder stopped. Chunks:",
            audioChunksRef.current.length
          );
          setIsRecording(false);

          if (audioChunksRef.current.length === 0) {
            console.log("No audio chunks collected, skipping processing");
            return;
          }

          const audioBlob = new Blob(audioChunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });

          console.log("Manual recording: Audio blob created:", {
            type: audioBlob.type,
            size: audioBlob.size,
            mimeType: recorder.mimeType,
          });

          // Log the audio blob to console
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
            const base64data = reader.result as string;
            console.log(
              "Audio data as base64 (first 100 chars):",
              base64data.substring(0, 100) + "..."
            );

            // Send to server without expecting a response back
            const socket = SocketManager.getSocket();
            if (socket && roomId) {
              console.log("Sending audio data for silent transcription");
              socket.emit("speech-to-text", {
                audioChunk: base64data.split(",")[1],
                mimeType: recorder.mimeType || "audio/webm",
                language: selectedLanguageRef.current, // Use ref for latest value
              });
            }
          };
        };

        // Start recording
        try {
          recorder.start(1000);
          console.log(
            "Manual audio recording started. MediaRecorder state:",
            recorder.state
          );
          setIsRecording(true);

          toast("Recording started", {
            description: "Audio recording is now active",
          });
        } catch (startError) {
          console.error("Error starting MediaRecorder:", startError);
        }
      } catch (mediaRecorderError) {
        console.error("Error creating MediaRecorder:", mediaRecorderError);
      }
    } catch (error) {
      console.error("Error setting up manual audio recording:", error);
      toast("Recording failed", {
        description: "Could not start audio recording",
      });
    }
  };

  const handleLanguageChange = (language: string) => {
    console.log("Language changed to:", language);
    setSelectedLanguage(language);
    // Update the ref immediately
    selectedLanguageRef.current = language;
  };

  const toggleAudioSharing = () => {
    if (localStreamRef.current) {
      // Get all audio tracks
      const audioTracks = localStreamRef.current.getAudioTracks();

      if (audioTracks.length > 0) {
        // Toggle audio state
        const newState = !isAudioEnabled;
        setIsAudioEnabled(newState);

        // Update local stream tracks
        audioTracks.forEach((track) => {
          track.enabled = newState;
        });

        // Update WebRTC connection if it exists
        if (rtcConnectionRef.current) {
          const senders = rtcConnectionRef.current.getSenders();
          const audioSender = senders.find(
            (sender) => sender.track && sender.track.kind === "audio"
          );

          if (audioSender && audioSender.track) {
            audioSender.track.enabled = newState;
          }
        }

        // Show toast notification
        toast(newState ? "Audio unmuted" : "Audio muted", {
          description: newState
            ? "Your audio is now being shared"
            : "Your audio is now muted",
        });
      } else {
        toast("No audio track available", {
          description: "Cannot toggle audio sharing",
        });
      }
    } else {
      toast("Audio device not available", {
        description: "Cannot toggle audio sharing",
      });
    }
  };

  const toggleVideoSharing = () => {
    if (localStreamRef.current) {
      // Get all video tracks
      const videoTracks = localStreamRef.current.getVideoTracks();

      if (videoTracks.length > 0) {
        // Toggle video state
        const newState = !isVideoEnabled;
        setIsVideoEnabled(newState);

        if (newState) {
          // If turning video back on, first try to get fresh tracks
          navigator.mediaDevices
            .getUserMedia({ video: true })
            .then((newStream) => {
              // Replace the existing video track with the new one
              const newVideoTrack = newStream.getVideoTracks()[0];
              if (newVideoTrack && localStreamRef.current) {
                const oldVideoTrack =
                  localStreamRef.current.getVideoTracks()[0];

                if (oldVideoTrack) {
                  // Replace track in local stream
                  localStreamRef.current.removeTrack(oldVideoTrack);
                  localStreamRef.current.addTrack(newVideoTrack);

                  // If we have an RTC connection, replace the track there too
                  if (rtcConnectionRef.current) {
                    const senders = rtcConnectionRef.current.getSenders();
                    const videoSender = senders.find(
                      (sender) => sender.track && sender.track.kind === "video"
                    );

                    if (videoSender) {
                      console.log("Replacing video track in RTC connection");
                      videoSender.replaceTrack(newVideoTrack);
                    } else {
                      // If no sender found, add the track directly
                      console.log("Adding new video track to RTC connection");
                      rtcConnectionRef.current.addTrack(
                        newVideoTrack,
                        localStreamRef.current
                      );
                    }
                  }

                  // Stop old track
                  oldVideoTrack.stop();
                } else {
                  // Just add the new track if there's no old one to replace
                  localStreamRef.current.addTrack(newVideoTrack);
                }

                // VideoConference component will handle the video display
                // No need to manually manipulate the DOM here
              }
            })
            .catch((err) => {
              console.error("Error getting fresh video stream:", err);
              // Fallback: just enable existing tracks
              videoTracks.forEach((track) => {
                track.enabled = true;
              });
            });
        } else {
          // If turning video off, just disable tracks
          videoTracks.forEach((track) => {
            track.enabled = false;
          });
        }

        // Show toast notification
        toast(isVideoEnabled ? "Video paused" : "Video resumed", {
          description: isVideoEnabled
            ? "Your video is now paused"
            : "Your video is now being shared",
        });
      } else {
        // No video tracks - try to get new ones
        navigator.mediaDevices
          .getUserMedia({ video: true })
          .then((newStream) => {
            const newVideoTrack = newStream.getVideoTracks()[0];

            if (newVideoTrack && localStreamRef.current) {
              // Add new video track to existing stream
              localStreamRef.current.addTrack(newVideoTrack);

              // Add to RTC connection if it exists
              if (rtcConnectionRef.current) {
                rtcConnectionRef.current.addTrack(
                  newVideoTrack,
                  localStreamRef.current
                );
              }

              // VideoConference component will handle the video display
              setIsVideoEnabled(true);
            }
          })
          .catch((err) => {
            console.error("Failed to get video stream:", err);
            toast("Video device not available", {
              description: "Could not access your camera",
            });
          });
      }
    } else {
      // No local stream at all, try to create one
      setupMediaStream().then(() => {
        setIsVideoEnabled(true);
      });
    }
  };

  const handleDisconnect = () => {
    // Get the current socket
    const socket = SocketManager.getSocket();

    // If we have a socket and are in a room, notify server we're leaving
    if (socket && roomId) {
      console.log(`Disconnecting from room ${roomId}`);
      socket.emit("leave-room", { roomId });

      // Show a toast notification about leaving
      toast("Leaving the call", {
        description: "You are being disconnected from the room...",
      });
    }

    // Stop all media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Close RTCPeerConnection
    if (rtcConnectionRef.current) {
      rtcConnectionRef.current.close();
      rtcConnectionRef.current = null;
    }

    // Stop media recorder if active
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    // Clear remote stream
    remoteStreamRef.current = null;

    // Reset connection states
    setIsConnected(false);
    setIsWaitingForConnection(false);

    // Clear transcripts
    setTranscripts([]);

    // Reset state to show join page
    setIsJoined(false);
    setRoomId(null);

    // Remove roomId from URL
    const url = new URL(window.location.href);
    url.searchParams.delete("roomId");
    window.history.pushState({}, "", url.toString());

    // Show a final toast notification
    toast("Call ended", {
      description:
        "You have successfully left the room. You can join or create a new room.",
    });
  };

  // Add new function to restart connection process
  const restartConnection = () => {
    console.log("Restarting connection...");

    // Close existing connection if any
    if (rtcConnectionRef.current) {
      console.log("Closing existing connection");
      rtcConnectionRef.current.close();
      rtcConnectionRef.current = null;
    }

    // Clear remote stream
    remoteStreamRef.current = null;
    setHasRemoteStream(false);
    setIsConnected(false);

    // Reset media stream if needed
    if (!localStreamRef.current) {
      console.log("No local stream, setting up media first");
      setupMediaStream().then(() => {
        initiateCall();
      });
    } else {
      initiateCall();
    }
  };

  // Connection retry logic
  useEffect(() => {
    if (!isJoined || !socketReady) return;

    // If we're connected, we don't need to retry
    if (isConnected) return;

    let retryCount = 0;
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 5000; // 5 seconds

    const retryConnection = () => {
      if (retryCount >= MAX_RETRIES) {
        console.log("Max retries reached, giving up");
        toast("Connection failed", {
          description: "Could not establish connection after multiple attempts",
        });
        return;
      }

      console.log(`Retry attempt ${retryCount + 1} of ${MAX_RETRIES}`);
      restartConnection();
      retryCount++;
    };

    // Set up a timer to check and retry connection if needed
    const connectionTimer = setInterval(() => {
      if (!isConnected && rtcConnectionRef.current) {
        const connectionState = rtcConnectionRef.current.connectionState;
        const iceConnectionState = rtcConnectionRef.current.iceConnectionState;

        console.log("Current connection states:", {
          connectionState,
          iceConnectionState,
        });

        // If connection failed or stalled, retry
        if (
          connectionState === "failed" ||
          connectionState === "closed" ||
          iceConnectionState === "failed" ||
          iceConnectionState === "disconnected" ||
          (connectionState === "new" &&
            iceConnectionState === "new" &&
            retryCount < MAX_RETRIES)
        ) {
          retryConnection();
        }
      }
    }, RETRY_DELAY);

    return () => {
      clearInterval(connectionTimer);
    };
  }, [isJoined, socketReady, isConnected]);

  return (
    <div className="min-h-screen bg-slate-50">
      {!isJoined ? (
        <JoinRoom
          onJoinRoom={handleJoinRoom}
          onCreateRoom={handleCreateRoom}
          initialRoomId={roomId || ""}
          error={joinError}
        />
      ) : (
        <VideoConference
          roomId={roomId!}
          localStream={localStreamRef.current}
          remoteStream={remoteStreamRef.current}
          shareableLink={generateShareableLink(roomId)}
          onStartRecording={startAudioRecording}
          isRecording={isRecording}
          onLanguageChange={handleLanguageChange}
          selectedLanguage={selectedLanguage}
          transcripts={transcripts}
          onToggleAudioSharing={toggleAudioSharing}
          isAudioEnabled={isAudioEnabled}
          onToggleVideoSharing={toggleVideoSharing}
          isVideoEnabled={isVideoEnabled}
          onDisconnect={handleDisconnect}
          isConnected={isConnected}
          isWaitingForConnection={isWaitingForConnection}
        />
      )}
      <Toaster />
    </div>
  );
}

export default App;
