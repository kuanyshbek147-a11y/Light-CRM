import type { Server } from "socket.io";

let realtimeServer: Server | null = null;

export function setRealtimeServer(server: Server): void {
  realtimeServer = server;
}

export function getRealtimeServer(): Server | null {
  return realtimeServer;
}
