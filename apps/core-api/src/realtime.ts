import { Server as HttpServer } from "node:http";
import { Server } from "socket.io";

export function attachRealtime(server: HttpServer, verify: (token: string) => Promise<{ sub: string }>, origins: string[]) {
  const io = new Server(server, { cors: { origin: origins }, maxHttpBufferSize: 10000 });
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string") throw new Error("Missing token");
      const identity = await verify(token);
      if (typeof identity.sub !== "string") throw new Error("Invalid identity");
      socket.data.userId = identity.sub;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });
  io.on("connection", (socket) => {
    socket.join("user:" + socket.data.userId);
  });
  return {
    close: () => io.close(),
  };
}
