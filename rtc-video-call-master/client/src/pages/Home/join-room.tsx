"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MdVideocam } from "react-icons/md";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SOCKET_SERVER_URL } from "@/config/constants";
import SocketManager from "../../config/socket";

interface JoinRoomProps {
  onJoinRoom: (roomId: string) => void;
  onCreateRoom: () => void;
  initialRoomId: string;
  error?: string | null;
}

interface RoomStatus {
  available: boolean;
  exists: boolean;
  userCount?: number;
  message: string;
}

const JoinRoom = ({
  onJoinRoom,
  onCreateRoom,
  initialRoomId,
  error,
}: JoinRoomProps) => {
  const [roomId, setRoomId] = useState(initialRoomId);
  const [isChecking, setIsChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isRequestingPermissions, setIsRequestingPermissions] = useState(false);

  const checkAndJoinRoom = async () => {
    if (!roomId.trim()) {
      setStatusMessage("Please enter a room ID");
      return;
    }

    try {
      setIsChecking(true);
      const response = await fetch(
        `${SOCKET_SERVER_URL}/api/check-room/${roomId}`
      );

      if (!response.ok) {
        throw new Error("Failed to check room availability");
      }

      const roomStatus: RoomStatus = await response.json();

      if (roomStatus.available) {
        if (!roomStatus.exists) {
          const createNewRoom = window.confirm(
            "This room doesn't exist. Would you like to create it?"
          );
          if (createNewRoom) {
            // Request permissions and join room
            await joinWithPermissions(roomId);
          }
        } else {
          // Request permissions and join room
          await joinWithPermissions(roomId);
        }
      } else {
        setStatusMessage(roomStatus.message);
      }
    } catch (err) {
      console.error("Error checking room:", err);
      setStatusMessage("Failed to check room availability");
    } finally {
      setIsChecking(false);
    }
  };

  // Helper function to handle join with permissions
  const joinWithPermissions = async (roomIdToJoin: string) => {
    try {
      setIsRequestingPermissions(true);
      setStatusMessage("Requesting camera and microphone permissions...");

      // Ensure valid session exists
      SocketManager.createSession();
      // Use the new method that handles permissions and joining
      await SocketManager.joinRoomWithPermissions(roomIdToJoin);

      // Notify parent component
      onJoinRoom(roomIdToJoin);

      setStatusMessage(null);
    } catch (error) {
      console.error("Error joining room with permissions:", error);
      setStatusMessage(
        "Failed to access camera or microphone. Please check your device permissions."
      );
    } finally {
      setIsRequestingPermissions(false);
    }
  };

  const handleJoin = async () => {
    if (roomId.trim()) {
      await checkAndJoinRoom();
    }
  };

  const handleCreateRoom = async () => {
    try {
      // Ensure valid session exists
      SocketManager.createSession();

      // Request media permissions before creating room
      setIsRequestingPermissions(true);
      setStatusMessage("Requesting camera and microphone permissions...");

      // First request permissions
      await SocketManager.requestMediaPermissions();

      // Then notify parent to create room
      onCreateRoom();

      setStatusMessage(null);
    } catch (error) {
      console.error("Error requesting permissions:", error);
      setStatusMessage(
        "Failed to access camera or microphone. Please check your device permissions."
      );
    } finally {
      setIsRequestingPermissions(false);
    }
  };

  useEffect(() => {
    // Only check and cleanup expired UUID on component mount
    // Don't auto-create a new session
    SocketManager.checkAndCleanupSession();

    // Try to get roomId from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const roomIdFromUrl = urlParams.get("roomId");

    if (roomIdFromUrl) {
      setRoomId(roomIdFromUrl);

      // Auto-join the room without causing infinite loops
      const autoJoin = async () => {
        if (roomIdFromUrl.trim()) {
          try {
            setIsChecking(true);
            const response = await fetch(
              `${SOCKET_SERVER_URL}/api/check-room/${roomIdFromUrl}`
            );

            if (!response.ok) {
              throw new Error("Failed to check room availability");
            }

            const roomStatus: RoomStatus = await response.json();

            if (roomStatus.available) {
              if (!roomStatus.exists) {
                const createNewRoom = window.confirm(
                  "This room doesn't exist. Would you like to create it?"
                );
                if (createNewRoom) {
                  // Request permissions and join
                  await joinWithPermissions(roomIdFromUrl);
                }
              } else {
                // Request permissions and join
                await joinWithPermissions(roomIdFromUrl);
              }
            } else {
              setStatusMessage(roomStatus.message);
            }
          } catch (err) {
            console.error("Error auto-joining room:", err);
            setStatusMessage(
              "Failed to join room automatically. Please try manually."
            );
          } finally {
            setIsChecking(false);
          }
        }
      };

      autoJoin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLoading = isChecking || isRequestingPermissions;
  const loadingText = isRequestingPermissions
    ? "Requesting permissions..."
    : isChecking
    ? "Checking..."
    : "Join Room";

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto bg-teal-100 p-3 rounded-full w-16 h-16 flex items-center justify-center mb-4">
            <MdVideocam className="h-8 w-8 text-teal-600" />
          </div>
          <CardTitle className="text-2xl font-bold">NexTalk</CardTitle>
          <CardDescription>
            Video conferencing with real-time translation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(error || statusMessage) && (
            <Alert
              variant={
                statusMessage?.includes("permissions")
                  ? "default"
                  : "destructive"
              }
              className={
                statusMessage?.includes("permissions")
                  ? "bg-blue-50 text-blue-600 border border-blue-200"
                  : "bg-red-50 text-red-600 border border-red-200"
              }
            >
              <AlertDescription>{error || statusMessage}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="roomId">Room ID</Label>
            <Input
              id="roomId"
              placeholder="Enter room ID to join"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-2">
          <Button
            className="w-full bg-teal-600 hover:bg-teal-700"
            onClick={handleJoin}
            disabled={!roomId.trim() || isLoading}
          >
            {loadingText}
          </Button>
          <div className="relative w-full text-center my-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">or</span>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full border-teal-600 text-teal-600 hover:bg-teal-50"
            onClick={handleCreateRoom}
            disabled={isLoading}
          >
            {isRequestingPermissions
              ? "Requesting permissions..."
              : "Create New Room"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default JoinRoom;
