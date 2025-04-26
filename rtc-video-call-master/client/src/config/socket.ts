import { io, Socket } from "socket.io-client";
import { SOCKET_SERVER_URL } from "./constants";
import { v4 as uuidv4 } from "uuid";

// Interface for the stored session data
interface StoredSession {
  id: string;
  timestamp: number;
}

// Media permission types
export type MediaPermissions = {
  audio: boolean;
  video: boolean;
};

// Create a singleton socket manager
const SocketManager = (() => {
  let socket: Socket | null = null;
  let roomId: string | null = null;
  let eventListenersSet = false;
  let mediaPermissions: MediaPermissions = { audio: false, video: false };
  const ONE_HOUR = 60 * 60 * 1000; // 1 hour in milliseconds

  // Check if stored session exists and is valid, remove if expired
  const checkStoredSession = (): StoredSession | null => {
    const storedSessionJSON = localStorage.getItem("rtc_session");
    if (!storedSessionJSON) return null;

    try {
      const storedSession: StoredSession = JSON.parse(storedSessionJSON);
      const now = Date.now();

      // Check if the stored session is less than 1 hour old
      if (now - storedSession.timestamp < ONE_HOUR) {
        console.log("Found valid session ID:", storedSession.id);
        return storedSession;
      }

      console.log("Stored session expired (older than 1 hour), removing it");
      localStorage.removeItem("rtc_session");
      return null;
    } catch (error) {
      console.error("Error parsing stored session:", error);
      localStorage.removeItem("rtc_session");
      return null;
    }
  };

  // Create a new session
  const createNewSession = (): StoredSession => {
    const newSessionId = uuidv4();
    const sessionData: StoredSession = {
      id: newSessionId,
      timestamp: Date.now(),
    };

    localStorage.setItem("rtc_session", JSON.stringify(sessionData));
    console.log("Created new session ID:", newSessionId);
    return sessionData;
  };

  // Get existing session ID or null if not present
  const getSessionId = (): string | null => {
    const storedSession = checkStoredSession();
    return storedSession ? storedSession.id : null;
  };

  // Initialize session ID (might be null if no valid session exists)
  let sessionId: string | null = getSessionId();

  // Send room and session info to server
  const sendSessionInfo = (): void => {
    if (socket && socket.connected && sessionId) {
      socket.emit("session-info", {
        sessionId,
        roomId,
      });
      console.log(
        `Sent session info to server: Session ${sessionId}, Room ${
          roomId || "none"
        }`
      );
    }
  };

  // Request media permissions
  const requestMediaPermissions = async (): Promise<MediaPermissions> => {
    try {
      // Request both audio and video
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });

      mediaPermissions = { audio: true, video: true };

      // Stop the tracks immediately after getting permission
      stream.getTracks().forEach((track) => track.stop());

      console.log("Media permissions granted:", mediaPermissions);

      // Notify server about permissions
      if (socket && socket.connected) {
        socket.emit("media-permissions", mediaPermissions);
      }

      return mediaPermissions;
    } catch (error) {
      console.error("Error requesting media permissions:", error);

      // Try to determine what permissions were denied
      if (error instanceof DOMException) {
        if (error.name === "NotAllowedError") {
          mediaPermissions = { audio: false, video: false };
        }
      }

      // Notify server about permissions
      if (socket && socket.connected) {
        socket.emit("media-permissions", mediaPermissions);
      }

      return mediaPermissions;
    }
  };

  const getSocket = (): Socket => {
    if (!socket) {
      console.log("Creating new socket with URL:", SOCKET_SERVER_URL);
      socket = io(SOCKET_SERVER_URL, {
        reconnection: true,
        reconnectionAttempts: Infinity, // Keep trying to reconnect
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000, // Reduce timeout to 10 seconds
        transports: ["polling", "websocket"], // Try polling first
        autoConnect: false,
        auth: {
          sessionId: sessionId,
          roomId: roomId,
        },
        path: "/socket.io/", // Explicitly set the path
        forceNew: true, // Force new connection
      });

      // Add detailed connection logging
      socket.on("connect", () => {
        console.log("Socket connected successfully with ID:", socket?.id);
        console.log("Transport:", socket?.io.engine?.transport?.name);
      });

      socket.on("connect_error", (error) => {
        console.error("Socket connection error:", error);
        console.log("Current transport:", socket?.io.engine?.transport?.name);
        console.log("Attempting to reconnect...");
      });

      socket.on("connect_timeout", (timeout) => {
        console.error("Socket connection timeout:", timeout);
        console.log("Current transport:", socket?.io.engine?.transport?.name);
        console.log("Attempting to reconnect...");
      });

      socket.on("reconnect_attempt", (attemptNumber) => {
        console.log("Socket reconnection attempt:", attemptNumber);
        console.log("Current transport:", socket?.io.engine?.transport?.name);
      });

      socket.on("reconnect_failed", () => {
        console.error("Socket reconnection failed after all attempts");
        console.log("Last transport used:", socket?.io.engine?.transport?.name);
      });

      socket.on("error", (error) => {
        console.error("Socket error:", error);
      });

      socket.on("disconnect", (reason) => {
        console.log("Socket disconnected:", reason);
      });
    }
    return socket;
  };

  return {
    connect: (onConnect?: () => void): Socket => {
      const socket = getSocket();

      if (!socket.connected) {
        console.log("Attempting to connect socket...");

        // Try to connect with a timeout
        const connectPromise = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            console.error("Socket connection timeout after 10 seconds");
            reject(new Error("Socket connection timeout"));
          }, 10000);

          socket.once("connect", () => {
            clearTimeout(timeout);
            console.log("Socket connected successfully");
            sendSessionInfo();
            if (onConnect) onConnect();
            resolve();
          });

          socket.once("connect_error", (error) => {
            clearTimeout(timeout);
            console.error("Socket connection error:", error);
            reject(error);
          });

          console.log("Initiating socket connection...");
          socket.connect();
        });

        // Handle the connection promise
        connectPromise.catch((error) => {
          console.error("Failed to connect to socket:", error);
          // Try to reconnect with different transport
          if (socket) {
            console.log("Switching transport and retrying...");
            socket.io.opts.transports = ["polling", "websocket"];
            socket.connect();
          }
        });
      } else if (onConnect) {
        console.log("Socket already connected");
        sendSessionInfo();
        onConnect();
      }

      return socket;
    },

    disconnect: (): void => {
      if (socket && socket.connected) {
        console.log(
          "Disconnecting socket:",
          socket.id,
          "Session ID:",
          sessionId
        );
        socket.disconnect();
      }
    },

    getSocket: (): Socket | null => socket,

    setRoomId: (id: string | null): void => {
      roomId = id;
      // Update socket auth with new room ID
      if (socket) {
        socket.auth = { ...socket.auth, roomId: id };
      }
      // Notify the server about the room change if connected
      if (socket && socket.connected) {
        sendSessionInfo();
      }
    },

    getRoomId: (): string | null => roomId,

    hasEventListeners: (): boolean => eventListenersSet,

    setEventListenersSet: (value: boolean): void => {
      eventListenersSet = value;
    },

    isConnected: (): boolean => {
      return !!socket && socket.connected;
    },

    getSessionId: (): string | null => sessionId,

    // Method to ensure a valid session exists when joining/creating a room
    // Only creates a new session if one doesn't exist or is expired
    createSession: (): void => {
      // Check if we already have a valid session
      const currentSession = checkStoredSession();

      if (currentSession) {
        // We already have a valid session, use it
        sessionId = currentSession.id;
        console.log("Using existing valid session:", sessionId);
      } else {
        // No valid session exists, create a new one
        const newSession = createNewSession();
        sessionId = newSession.id;

        // If socket exists, update its auth
        if (socket) {
          socket.auth = { ...socket.auth, sessionId };
        }
      }
    },

    // Method to only check and remove expired session on component mount
    checkAndCleanupSession: (): void => {
      checkStoredSession();
    },

    // Method to request media permissions when joining a room
    requestMediaPermissions,

    // Get current media permissions status
    getMediaPermissions: (): MediaPermissions => mediaPermissions,

    // Join room with automatic media permission request
    joinRoomWithPermissions: async (roomIdToJoin: string): Promise<void> => {
      try {
        console.log("Starting joinRoomWithPermissions for room:", roomIdToJoin);

        // Set the room ID
        roomId = roomIdToJoin;

        // Ensure we have a valid session
        if (!sessionId) {
          console.log("No valid session found, creating new session");
          const newSession = createNewSession();
          sessionId = newSession.id;
        }

        // Get or create socket
        const socket = getSocket();
        console.log("Socket instance obtained:", socket.id || "new socket");

        // Connect to socket if not already connected
        if (!socket.connected) {
          console.log("Socket not connected, attempting connection...");
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error("Socket connection timeout after 20 seconds"));
            }, 20000);

            // Set up connection handlers before connecting
            socket.once("connect", () => {
              console.log("Socket connected successfully");
              clearTimeout(timeout);
              resolve();
            });

            socket.once("connect_error", (error) => {
              console.error("Socket connection error:", error);
              clearTimeout(timeout);
              reject(error);
            });

            // Now attempt to connect
            socket.connect();
          });
        } else {
          console.log("Socket already connected");
        }

        // Request media permissions
        console.log("Requesting media permissions...");
        await requestMediaPermissions();

        // Update socket auth with room ID and session ID
        socket.auth = { ...socket.auth, roomId: roomIdToJoin, sessionId };
        console.log("Updated socket auth with room ID and session ID");

        // Send session info to server
        sendSessionInfo();

        // Wait a short moment to ensure the server has processed the session info
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Emit the join-room event with roomId
        socket.emit("join-room", { roomId: roomIdToJoin });
        console.log(
          `Successfully joined room ${roomIdToJoin} with session ${sessionId}`
        );
      } catch (error) {
        console.error("Error in joinRoomWithPermissions:", error);
        // Clean up on error
        if (socket) {
          socket.disconnect();
        }
        throw error;
      }
    },
  };
})();

export default SocketManager;
