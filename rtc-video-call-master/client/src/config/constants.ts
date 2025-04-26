export const SOCKET_SERVER_URL =
  (import.meta.env.VITE_SERVER_URL as string) || "http://localhost:3001";
export const ICE_SERVERS = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun2.l.google.com:19302",
    ],
  },
];
