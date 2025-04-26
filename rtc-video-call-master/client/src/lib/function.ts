export const updateUrlWithRoomId = (id: string) => {
  const url = new URL(window.location.href);
  url.searchParams.set("roomId", id);
  window.history.pushState({}, "", url.toString());
};

export const generateShareableLink = (roomId: string | null) => {
  if (!roomId) return "";
  const url = new URL(window.location.href);
  url.searchParams.set("roomId", roomId);
  return url.toString();
};
