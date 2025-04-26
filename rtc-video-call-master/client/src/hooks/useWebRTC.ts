"use client";

import { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { SOCKET_SERVER_URL, ICE_SERVERS } from "@/config/constants";

interface UseWebRTCProps {
  roomId: string;
}

export const useWebRTC = ({ roomId }: UseWebRTCProps) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  // Initialize socket connection
  useEffect(() => {
    socketRef.current = io(SOCKET_SERVER_URL);

    // Clean up on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, [localStream]);

  // Join room and handle socket events
  useEffect(() => {
    if (!socketRef.current) return;

    // Join the room
    socketRef.current.emit("join-room", { roomId });

    // Another user connected to the room
    socketRef.current.on("user-connected", () => {
      console.log("Another user joined the room");
      createOffer();
    });

    // Handle incoming offer
    socketRef.current.on("offer", async (offer) => {
      if (!peerConnectionRef.current) await setupPeerConnection();
      await peerConnectionRef.current!.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      const answer = await peerConnectionRef.current!.createAnswer();
      await peerConnectionRef.current!.setLocalDescription(answer);
      socketRef.current!.emit("answer", answer, roomId);
    });

    // Handle incoming answer
    socketRef.current.on("answer", async (answer) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(answer)
        );
      }
    });

    // Handle incoming ICE candidates
    socketRef.current.on("ice-candidate", async (candidate) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      }
    });

    // Handle user disconnect
    socketRef.current.on("user-disconnected", () => {
      setIsConnected(false);
      setRemoteStream(null);
    });
  }, [roomId]);

  // Setup media stream
  useEffect(() => {
    const setupMediaStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        setLocalStream(stream);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        if (peerConnectionRef.current) {
          stream.getTracks().forEach((track) => {
            peerConnectionRef.current!.addTrack(track, stream);
          });
        }
      } catch (error) {
        console.error("Error accessing media devices:", error);
      }
    };

    setupMediaStream();
  }, []);

  // Setup peer connection
  const setupPeerConnection = async () => {
    peerConnectionRef.current = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
    });

    if (localStream) {
      localStream.getTracks().forEach((track) => {
        peerConnectionRef.current!.addTrack(track, localStream);
      });
    }

    // Handle remote stream
    peerConnectionRef.current.ontrack = (event) => {
      console.log("Received remote track:", event.track.kind);

      setRemoteStream(event.streams[0]);

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }

      setIsConnected(true);
    };

    // Handle ICE candidates
    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current!.emit("ice-candidate", event.candidate, roomId);
      }
    };

    return peerConnectionRef.current;
  };

  // Create and send offer
  const createOffer = async () => {
    try {
      if (!peerConnectionRef.current) {
        await setupPeerConnection();
      }

      const offer = await peerConnectionRef.current!.createOffer();
      await peerConnectionRef.current!.setLocalDescription(offer);
      socketRef.current!.emit("offer", offer, roomId);
    } catch (error) {
      console.error("Error creating offer:", error);
    }
  };

  // Toggle mute
  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  // Toggle video
  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  return {
    localStream,
    remoteStream,
    isConnected,
    isMuted,
    isVideoOff,
    localVideoRef,
    remoteVideoRef,
    toggleMute,
    toggleVideo,
  };
};
