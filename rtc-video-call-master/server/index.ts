import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { config } from "dotenv";
import { transcribeAudio, initSpeechClient } from "./services/speechToText";
import {
  synthesizeSpeech,
  initTextToSpeechClient,
} from "./services/textToSpeech";
import { protos } from "@google-cloud/speech";
import path from "path";
import fs from "fs";

// WebRTC type definitions
interface RTCSessionDescriptionInit {
  type: "offer" | "answer" | "pranswer" | "rollback";
  sdp: string;
}

interface RTCIceCandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

// Load environment variables
config();

// Initialize Google Speech-to-Text client
const credentialsPathFromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
console.log("Credentials path from env:", credentialsPathFromEnv);

// Try multiple potential paths for the credentials
const possiblePaths = [
  credentialsPathFromEnv, // Absolute path as provided
  path.join(process.cwd(), credentialsPathFromEnv), // Relative to CWD
  path.join(__dirname, credentialsPathFromEnv), // Relative to __dirname
  path.resolve(path.join(process.cwd(), "server", credentialsPathFromEnv)), // From server directory
  path.resolve(path.join(process.cwd(), credentialsPathFromEnv)), // From project root
];

let credentialsPath = "";
for (const pathToCheck of possiblePaths) {
  if (pathToCheck && fs.existsSync(pathToCheck)) {
    credentialsPath = pathToCheck;
    console.log(`Found credentials at: ${credentialsPath}`);
    break;
  }
}

if (!credentialsPath) {
  console.error(
    "ERROR: Google credentials file not found in any of these locations:"
  );
  possiblePaths.forEach((p) => p && console.error(`- ${p}`));
  console.error(
    "Please make sure the file exists or set the correct path in GOOGLE_APPLICATION_CREDENTIALS env variable"
  );
} else {
  try {
    // Initialize both speech services with the same credentials
    initSpeechClient(credentialsPath);
    initTextToSpeechClient(credentialsPath);
  } catch (error) {
    console.error("Failed to initialize speech clients:", error);
  }
}

const app = express();
const server = createServer(app);

// Configure CORS
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  })
);

// Create Socket.IO server with CORS configuration
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Track active rooms and users
interface RoomData {
  [roomId: string]: {
    sessionIds: string[]; // Store session IDs instead of socket IDs
    socketIds: string[]; // Keep socket IDs for backward compatibility
  };
}

// Track which user is in which room
interface UserRooms {
  [sessionId: string]: string; // sessionId -> roomId (track by session instead of socket)
}

// Track socket connections for each session
interface SessionConnections {
  [sessionId: string]: string[]; // sessionId -> array of socketIds
}

// Track user session IDs
interface UserSessions {
  [socketId: string]: string; // socketId -> sessionId
}

// Map session IDs to their primary socket IDs
interface SessionToSocket {
  [sessionId: string]: string; // sessionId -> primary socketId
}

// Track rooms with pending cleanup for reconnection
interface PendingRoomCleanup {
  [roomId: string]: {
    sessionId: string;
    timeoutId: NodeJS.Timeout;
  };
}

const rooms: RoomData = {};
const userRooms: UserRooms = {};
const sessionConnections: SessionConnections = {};
const userSessions: UserSessions = {};
const sessionToSocket: SessionToSocket = {};
const pendingRoomCleanups: PendingRoomCleanup = {};
const MAX_USERS_PER_ROOM = 2;
const ROOM_CLEANUP_DELAY = 20000; // 20 seconds to allow for reconnection

// Express route to check room availability
app.get("/api/check-room/:roomId", (req, res) => {
  const { roomId } = req.params;

  if (!rooms[roomId]) {
    return res.json({
      available: true,
      exists: false,
      message: "Room does not exist and can be created",
    });
  }

  const isFull = rooms[roomId].sessionIds.length >= MAX_USERS_PER_ROOM;

  return res.json({
    available: !isFull,
    exists: true,
    userCount: rooms[roomId].sessionIds.length,
    message: isFull ? "Room is full" : "Room is available to join",
  });
});

// API endpoint to get all rooms and their users
app.get("/api/rooms", (req, res) => {
  try {
    const roomsData: Record<
      string,
      {
        uniqueUsers: number;
        uniqueSessions: string[];
        totalConnections: number;
        users: Array<{
          sessionId: string;
          connections: number;
          socketIds: string[];
        }>;
      }
    > = {};

    // Build a clean representation of rooms data
    for (const [roomId, roomData] of Object.entries(rooms)) {
      roomsData[roomId] = {
        uniqueUsers: roomData.sessionIds.length,
        uniqueSessions: [...roomData.sessionIds], // Convert to array to avoid reference issues
        totalConnections: roomData.socketIds.length,
        users: [],
      };

      // Add user information for each session
      for (const sessionId of roomData.sessionIds) {
        // Find all sockets for this session
        const sessionSockets = sessionConnections[sessionId] || [];

        roomsData[roomId].users.push({
          sessionId,
          connections: sessionSockets.length,
          socketIds: sessionSockets,
        });
      }
    }

    return res.json({
      totalRooms: Object.keys(rooms).length,
      rooms: roomsData,
    });
  } catch (error: unknown) {
    console.error("Error in /api/rooms endpoint:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: (error as Error)?.message || "Unknown error",
    });
  }
});

// Socket.IO connection handler
io.on("connection", (socket: any) => {
  // Get the session ID from the client auth
  const sessionId = socket.handshake.auth.sessionId;
  const roomIdFromAuth = socket.handshake.auth.roomId;
  console.log(
    "User connected:",
    socket.id,
    "Session ID:",
    sessionId,
    "Room ID from auth:",
    roomIdFromAuth
  );

  if (!sessionId) {
    console.warn(`Socket ${socket.id} connected without a session ID`);
    // We could disconnect the socket here, but for backward compatibility we'll allow it
  } else {
    // Store the session ID for this socket
    userSessions[socket.id] = sessionId;

    // Track this socket under the session ID
    if (!sessionConnections[sessionId]) {
      sessionConnections[sessionId] = [];
    }

    if (!sessionConnections[sessionId].includes(socket.id)) {
      sessionConnections[sessionId].push(socket.id);
    }

    // If this is the first connection for this session, set it as the primary socket
    if (!sessionToSocket[sessionId]) {
      sessionToSocket[sessionId] = socket.id;
    }

    // If room ID was provided in auth, automatically join that room
    if (roomIdFromAuth) {
      console.log(
        `Auto-joining room ${roomIdFromAuth} for session ${sessionId} from auth`
      );
      joinRoom(socket, sessionId, roomIdFromAuth);
    } else {
      // Check if this session is already in a room
      const roomId = userRooms[sessionId];
      if (roomId) {
        // Join the room with this socket too
        socket.join(roomId);

        // Add the socket to the room's tracking
        if (!rooms[roomId].socketIds.includes(socket.id)) {
          rooms[roomId].socketIds.push(socket.id);
        }

        console.log(
          `Added new socket ${socket.id} to existing room ${roomId} for session ${sessionId}`
        );

        // Cancel any pending cleanup for this room/session
        if (
          pendingRoomCleanups[roomId] &&
          pendingRoomCleanups[roomId].sessionId === sessionId
        ) {
          console.log(
            `Cancelling pending cleanup for room ${roomId} as session ${sessionId} reconnected`
          );
          clearTimeout(pendingRoomCleanups[roomId].timeoutId);
          delete pendingRoomCleanups[roomId];
        }
      }
    }
  }

  // Handle session-info event (explicit session and room information)
  socket.on(
    "session-info",
    (data: { sessionId: string; roomId: string | null }) => {
      const { sessionId, roomId } = data;
      console.log(
        `Received session info from socket ${
          socket.id
        }: Session ${sessionId}, Room ${roomId || "none"}`
      );

      // Update socket's session ID if needed
      if (sessionId && userSessions[socket.id] !== sessionId) {
        userSessions[socket.id] = sessionId;

        // Update session connections
        if (!sessionConnections[sessionId]) {
          sessionConnections[sessionId] = [];
        }

        if (!sessionConnections[sessionId].includes(socket.id)) {
          sessionConnections[sessionId].push(socket.id);
        }

        // If this is the first connection for this session, set it as the primary socket
        if (!sessionToSocket[sessionId]) {
          sessionToSocket[sessionId] = socket.id;
        }
      }

      // If room ID was provided and session isn't already in that room, join it
      if (roomId && userRooms[sessionId] !== roomId) {
        joinRoom(socket, sessionId, roomId);
      }
    }
  );

  // Handle media-permissions event
  socket.on(
    "media-permissions",
    (permissions: { audio: boolean; video: boolean }) => {
      const userSessionId = userSessions[socket.id];
      console.log(
        `Media permissions for socket ${socket.id} (Session: ${
          userSessionId || "unknown"
        }):`,
        permissions
      );

      // We could store these permissions and use them to inform other participants
      // Broadcast to others in the room if the user is in a room
      if (userSessionId) {
        const roomId = userRooms[userSessionId];
        if (roomId) {
          // Notify others in the room about this user's media permissions
          socket.to(roomId).emit("user-media-permissions", {
            userId: socket.id,
            sessionId: userSessionId,
            permissions,
          });
        }
      }
    }
  );

  // Helper function to handle room joining logic
  function joinRoom(socket: any, sessionId: string, roomId: string) {
    // Check if room exists
    if (!rooms[roomId]) {
      rooms[roomId] = {
        sessionIds: [],
        socketIds: [],
      };
    }

    // Join the socket to the room
    socket.join(roomId);

    // Check if the session is already in the room
    if (!rooms[roomId].sessionIds.includes(sessionId)) {
      // Check if room is full
      if (rooms[roomId].sessionIds.length >= MAX_USERS_PER_ROOM) {
        socket.emit("room-full", { roomId });
        console.log(
          `Session ${sessionId} (socket: ${socket.id}) tried to join full room ${roomId}`
        );
        return;
      }

      // Add session to room
      rooms[roomId].sessionIds.push(sessionId);

      // Track which room this session is in
      userRooms[sessionId] = roomId;

      // Notify others in the room
      socket.to(roomId).emit("user-joined", {
        userId: socket.id,
        sessionId: sessionId,
        roomId,
      });

      console.log(
        `Session ${sessionId} (socket: ${socket.id}) joined room ${roomId}`
      );
    }

    // Add socket to the room's socket list if not already there
    if (!rooms[roomId].socketIds.includes(socket.id)) {
      rooms[roomId].socketIds.push(socket.id);
    }
  }

  // Handle room creation
  socket.on("create-room", ({ roomId }: { roomId: string }) => {
    const userSessionId = userSessions[socket.id];

    // Use the common joinRoom function with "create" flag
    if (userSessionId) {
      joinRoom(socket, userSessionId, roomId);
      console.log(
        `Room ${roomId} created by session ${userSessionId} (socket: ${socket.id})`
      );
    } else {
      console.warn(
        `Socket ${socket.id} tried to create room without a session ID`
      );
    }
  });

  // Handle room joining
  socket.on("join-room", ({ roomId }: { roomId: string }) => {
    const userSessionId = userSessions[socket.id];

    if (userSessionId) {
      joinRoom(socket, userSessionId, roomId);
    } else {
      console.warn(
        `Socket ${socket.id} tried to join room without a session ID`
      );
    }
  });

  // Handle audio chunks for real-time transcription
  socket.on(
    "speech-to-text",
    async (data: {
      audioChunk: string;
      roomId?: string;
      mimeType?: string;
      language: string;
    }) => {
      try {
        console.log(
          `Received audio chunk from socket ${socket.id}, size: ${
            data.audioChunk?.length || 0
          }, type: ${data.mimeType || "unknown"}`
        );

        const userSessionId = userSessions[socket.id];

        // Get user's room based on session ID if available, otherwise fall back to socket ID
        let userRoomId = userSessionId ? userRooms[userSessionId] : null;

        // If no room found via session, try the traditional way
        if (!userRoomId) {
          // Find room by iterating through rooms
          for (const [roomId, roomData] of Object.entries(rooms)) {
            if (roomData.socketIds.includes(socket.id)) {
              userRoomId = roomId;
              break;
            }
          }
        }

        if (!userRoomId) {
          console.log(
            `Socket ${socket.id} (Session: ${
              userSessionId || "unknown"
            }) is not in any room, skipping transcription`
          );
          return;
        }

        console.log(
          `Socket ${socket.id} (Session: ${
            userSessionId || "unknown"
          }) is in room ${userRoomId}`
        );

        // Validate audio chunk
        if (!data.audioChunk || data.audioChunk.length === 0) {
          console.error("Empty audio chunk received");
          return;
        }

        // Convert base64 audio to buffer
        try {
          const audioBuffer = Buffer.from(data.audioChunk, "base64");

          if (audioBuffer.length === 0) {
            console.error("Empty buffer after conversion");
            return;
          }

          console.log(
            `Converted to buffer of size: ${audioBuffer.length} bytes`
          );

          // Save first few bytes for debugging
          const previewBytes = audioBuffer
            .slice(0, Math.min(20, audioBuffer.length))
            .toString("hex");
          console.log(`First bytes: ${previewBytes}`);

          // Determine encoding based on MIME type
          let encoding: keyof typeof protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding =
            "WEBM_OPUS";
          let sampleRateHertz = 48000;

          if (data.mimeType) {
            if (
              data.mimeType.includes("audio/webm") ||
              data.mimeType.includes("opus")
            ) {
              encoding = "WEBM_OPUS";
              sampleRateHertz = 48000;
            } else if (data.mimeType.includes("audio/ogg")) {
              encoding = "OGG_OPUS";
              sampleRateHertz = 48000;
            } else if (
              data.mimeType.includes("audio/wav") ||
              data.mimeType.includes("audio/x-wav")
            ) {
              encoding = "LINEAR16";
              sampleRateHertz = 16000;
            }
          }

          console.log(
            `Using encoding: ${encoding}, sample rate: ${sampleRateHertz}`
          );

          // Default config
          const config = {
            encoding,
            sampleRateHertz,
            languageCode: data.language,
          };
          try {
            // Transcribe the audio chunk
            const transcription = await transcribeAudio(audioBuffer, config);

            // If transcription has content
            if (transcription && transcription.trim() !== "") {
              console.log(`Transcription successful: "${transcription}"`);

              // Send to all other clients in the room
              socket.to(userRoomId).emit("transcription", {
                transcription,
                userId: socket.id,
                sessionId: userSessionId,
                language: data.language,
                isOwnMessage: false,
              });

              // Also send to the sender with isOwnMessage flag set to true
              socket.emit("transcription", {
                transcription,
                userId: socket.id,
                sessionId: userSessionId,
                language: data.language,
                isOwnMessage: true,
              });

              console.log(
                `Transcription from socket ${socket.id} (Session: ${
                  userSessionId || "unknown"
                }) sent to room ${userRoomId}: "${transcription}"`
              );
            } else {
              console.log("No transcription result returned");
            }
          } catch (transcribeError) {
            console.error("Transcription API error:", transcribeError);
          }
        } catch (bufferError) {
          console.error("Error processing audio buffer:", bufferError);
        }
      } catch (error) {
        console.error("Speech-to-text general error:", error);
      }
    }
  );

  // Handle text-to-speech conversion
  socket.on(
    "text-to-speech",
    async (data: { text: string; language: string }) => {
      try {
        console.log(
          `Received text-to-speech request from ${socket.id}, text length: ${
            data.text?.length || 0
          }`
        );

        // Validate text
        if (!data.text || data.text.trim() === "") {
          console.error("Empty text received");
          socket.emit("text-to-speech-error", { error: "No text provided" });
          return;
        }

        // Generate speech
        try {
          const audioBase64 = await synthesizeSpeech(data.text, data.language);

          if (!audioBase64) {
            console.error("Empty audio response received");
            socket.emit("text-to-speech-error", {
              error: "Failed to generate audio",
            });
            return;
          }

          // Send only to the requesting user
          socket.emit("text-to-speech-response", {
            audio: audioBase64,
            language: data.language,
          });

          console.log(`Text-to-speech response sent to user ${socket.id}`);
        } catch (synthesisError: unknown) {
          console.error("Text-to-speech API error:", synthesisError);
          socket.emit("text-to-speech-error", {
            error: "Failed to generate speech",
            details: (synthesisError as Error).message || "Unknown error",
          });
        }
      } catch (error: unknown) {
        console.error("Text-to-speech general error:", error);
        socket.emit("text-to-speech-error", {
          error: "Internal server error",
          details: (error as Error).message || "Unknown error",
        });
      }
    }
  );

  // Handle WebRTC signaling - offer
  socket.on(
    "offer",
    (data: { offer: RTCSessionDescriptionInit; roomId: string }) => {
      const { offer, roomId } = data;

      // Get the session ID for this socket
      const sessionId = userSessions[socket.id];
      const sessionInfo = sessionId ? ` (Session: ${sessionId})` : "";

      console.log(
        `Received offer from ${socket.id}${sessionInfo} for room ${roomId}`
      );

      // Forward the offer to all other users in the room
      socket.to(roomId).emit("offer", {
        ...offer,
        fromSocketId: socket.id,
        fromSessionId: sessionId, // Include sender's session ID
      });
    }
  );

  // Handle WebRTC signaling - answer
  socket.on(
    "answer",
    (data: { answer: RTCSessionDescriptionInit; roomId: string }) => {
      const { answer, roomId } = data;

      // Get the session ID for this socket
      const sessionId = userSessions[socket.id];
      const sessionInfo = sessionId ? ` (Session: ${sessionId})` : "";

      console.log(
        `Received answer from ${socket.id}${sessionInfo} for room ${roomId}`
      );

      // Forward the answer to all other users in the room
      socket.to(roomId).emit("answer", {
        ...answer,
        fromSocketId: socket.id,
        fromSessionId: sessionId, // Include sender's session ID
      });
    }
  );

  // Handle WebRTC signaling - ICE candidates
  socket.on(
    "ice-candidate",
    (data: { candidate: RTCIceCandidateInit; roomId: string }) => {
      const { candidate, roomId } = data;

      // Get the session ID for this socket
      const sessionId = userSessions[socket.id];

      // Forward the ICE candidate to all other users in the room
      socket.to(roomId).emit("ice-candidate", {
        ...candidate,
        fromSocketId: socket.id,
        fromSessionId: sessionId, // Include sender's session ID
      });
    }
  );

  // Handle leave room event
  socket.on("leave-room", ({ roomId }: { roomId: string }) => {
    handleUserLeaveRoom(socket, roomId);
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    // Get the session ID for this socket
    const userSessionId = userSessions[socket.id];
    console.log(
      `Socket disconnected: ${socket.id} (Session: ${
        userSessionId || "unknown"
      })`
    );

    // Update the session connections
    if (userSessionId && sessionConnections[userSessionId]) {
      // Remove this socket from the session's connections
      const index = sessionConnections[userSessionId].indexOf(socket.id);
      if (index > -1) {
        sessionConnections[userSessionId].splice(index, 1);
      }

      // If this was the primary socket for the session, update it
      if (sessionToSocket[userSessionId] === socket.id) {
        if (sessionConnections[userSessionId].length > 0) {
          // Set the first remaining connection as primary
          sessionToSocket[userSessionId] = sessionConnections[userSessionId][0];
          console.log(
            `Updated primary socket for session ${userSessionId} to ${sessionToSocket[userSessionId]}`
          );
        } else {
          // No more connections for this session
          delete sessionToSocket[userSessionId];
        }
      }

      // If no more connections for this session, clean up
      if (sessionConnections[userSessionId].length === 0) {
        delete sessionConnections[userSessionId];

        // Get the room this session was in
        const roomId = userRooms[userSessionId];
        if (roomId) {
          handleSessionLeaveRoom(userSessionId, roomId);
        }
      } else {
        console.log(
          `Session ${userSessionId} still has ${sessionConnections[userSessionId].length} active connections`
        );
      }
    }

    // Clean up this socket from all rooms
    for (const [roomId, roomData] of Object.entries(rooms)) {
      const socketIndex = roomData.socketIds.indexOf(socket.id);
      if (socketIndex > -1) {
        roomData.socketIds.splice(socketIndex, 1);
        console.log(`Removed socket ${socket.id} from room ${roomId}`);
      }
    }

    // Clean up socket-specific references
    delete userSessions[socket.id];
  });

  // Helper function to get all socket IDs for a session ID
  function getSocketIdsBySessionId(targetSessionId: string): string[] {
    if (!targetSessionId) return [];
    return sessionConnections[targetSessionId] || [];
  }

  // Helper function to handle user leaving a room
  function handleUserLeaveRoom(socket: any, roomId: string) {
    console.log(`Handling socket ${socket.id} leaving room ${roomId}`);

    if (!rooms[roomId]) return;

    // Get the session ID for this socket
    const sessionId = userSessions[socket.id];

    // If we have a session ID, use the more comprehensive session leave handler
    if (sessionId) {
      // Check if this is the last socket for this session
      const sessionSockets = getSocketIdsBySessionId(sessionId);

      if (sessionSockets.length <= 1) {
        // This is the last/only socket, so the session is leaving
        handleSessionLeaveRoom(sessionId, roomId);
      } else {
        // Just remove this socket from the room's socket list
        const index = rooms[roomId].socketIds.indexOf(socket.id);
        if (index > -1) {
          rooms[roomId].socketIds.splice(index, 1);
          console.log(
            `Removed socket ${
              socket.id
            } from room ${roomId}, but session ${sessionId} remains with ${
              sessionSockets.length - 1
            } other sockets`
          );
        }
      }
    } else {
      // No session ID, just remove the socket
      const index = rooms[roomId].socketIds.indexOf(socket.id);
      if (index > -1) {
        rooms[roomId].socketIds.splice(index, 1);
        console.log(`Removed socket ${socket.id} from room ${roomId}`);

        // If room is empty, delete it
        if (
          rooms[roomId].socketIds.length === 0 &&
          rooms[roomId].sessionIds.length === 0
        ) {
          delete rooms[roomId];
          console.log(`Room ${roomId} deleted as it's empty`);
        } else {
          // Notify others in the room
          socket.to(roomId).emit("user-left", {
            userId: socket.id,
            sessionId: null,
            roomId,
          });
        }
      }
    }

    // Remove the socket from the room
    socket.leave(roomId);
  }

  // Helper function to handle a session leaving a room
  function handleSessionLeaveRoom(sessionId: string, roomId: string) {
    console.log(`Handling session ${sessionId} leaving room ${roomId}`);

    if (!rooms[roomId]) return;

    // Remove the session from the room
    const sessionIndex = rooms[roomId].sessionIds.indexOf(sessionId);
    if (sessionIndex > -1) {
      rooms[roomId].sessionIds.splice(sessionIndex, 1);

      // Remove the session's mapping to the room
      delete userRooms[sessionId];

      // If room has no more sessions
      if (rooms[roomId].sessionIds.length === 0) {
        // If there's already a pending cleanup for this room, clear it
        if (pendingRoomCleanups[roomId]) {
          clearTimeout(pendingRoomCleanups[roomId].timeoutId);
          delete pendingRoomCleanups[roomId];
        }

        // Set a timeout to delete the room if the session doesn't reconnect
        console.log(
          `Scheduling cleanup for room ${roomId} in ${
            ROOM_CLEANUP_DELAY / 1000
          } seconds`
        );

        const timeoutId = setTimeout(() => {
          if (rooms[roomId] && rooms[roomId].sessionIds.length === 0) {
            delete rooms[roomId];
            delete pendingRoomCleanups[roomId];
            console.log(
              `Room ${roomId} deleted after timeout as session ${sessionId} didn't reconnect`
            );
          }
        }, ROOM_CLEANUP_DELAY);

        // Store the pending cleanup
        pendingRoomCleanups[roomId] = {
          sessionId,
          timeoutId,
        };
      } else {
        // Notify other users that this session has left
        // Get all sockets associated with this session
        const sessionSockets = getSocketIdsBySessionId(sessionId);

        // Notify all other users in the room
        for (const socketId of sessionSockets) {
          const socket = io.sockets.sockets.get(socketId);
          if (socket) {
            socket.to(roomId).emit("user-left", {
              userId: socketId,
              sessionId: sessionId,
              roomId,
            });
          }
        }

        console.log(`Notified room ${roomId} that session ${sessionId} left`);
      }
    }
  }
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Server started with Bun!`);
});
