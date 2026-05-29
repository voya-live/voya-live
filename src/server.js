import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import { RtcTokenBuilder, RtcRole } from "agora-access-token";

import { connectDb } from "./config/db.js";

import authRoutes from "./routes/auth.js";
import roomRoutes from "./routes/rooms.js";
import walletRoutes from "./routes/wallet.js";
import adminRoutes from "./routes/admin.js";

dotenv.config();

connectDb();

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://voya-live-frontend.onrender.com",
];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

app.use(
  cors({
    origin: allowedOrigins,
  })
);

app.use(express.json());

app.get("/health", (_, res) => {
  res.json({
    status: "ok",
    app: "VOYA LIVE Backend",
  });
});

app.get("/api/agora/token", (req, res) => {
  try {
    const { channelName } = req.query;
    const uid = Number(req.query.uid || 0);

    if (!channelName) {
      return res.status(400).json({
        error: "channelName is required",
      });
    }

    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;

    if (!appId || !appCertificate) {
      return res.status(500).json({
        error: "Agora credentials missing",
      });
    }

    const role = RtcRole.PUBLISHER;
    const expireTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpireTime =
      currentTimestamp + expireTimeInSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      role,
      privilegeExpireTime
    );

    res.json({
      token,
      uid,
      channelName,
    });
  } catch (error) {
    console.error("Agora token error:", error);
    res.status(500).json({
      error: "Failed to generate Agora token",
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/admin", adminRoutes);

const liveRooms = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.emit("rooms:update", liveRooms);

  socket.on("room:join", ({ roomId, user }) => {
    if (!liveRooms[roomId]) {
      liveRooms[roomId] = {
        users: [],
      };
    }

    const alreadyJoined = liveRooms[roomId].users.find(
      (item) => item.id === user.id
    );

    if (!alreadyJoined) {
      liveRooms[roomId].users.push({
        id: user.id,
        name: user.name,
        socketId: socket.id,
      });
    }

    socket.join(roomId);

    io.emit("rooms:update", liveRooms);

    io.to(roomId).emit("room:message", {
      type: "system",
      text: `${user.name} joined the room`,
    });
  });

  socket.on("room:chat", ({ roomId, user, message }) => {
    if (!message?.trim()) return;

    io.to(roomId).emit("room:chat", {
      id: Date.now(),
      user: user.name,
      text: message,
      time: new Date().toLocaleTimeString(),
    });
  });

  socket.on("room:leave", ({ roomId, user }) => {
    if (liveRooms[roomId]) {
      liveRooms[roomId].users = liveRooms[roomId].users.filter(
        (item) => item.id !== user.id
      );
    }

    socket.leave(roomId);
    io.emit("rooms:update", liveRooms);
  });

  socket.on("disconnect", () => {
    Object.keys(liveRooms).forEach((roomId) => {
      liveRooms[roomId].users = liveRooms[roomId].users.filter(
        (item) => item.socketId !== socket.id
      );
    });

    io.emit("rooms:update", liveRooms);

    console.log("User disconnected:", socket.id);
  });
});

const port = process.env.PORT || 5001;

server.listen(port, () => {
  console.log(`Backend running on port ${port}`);
});