import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import agoraAccessToken from "agora-access-token";

const { RtcTokenBuilder, RtcRole } = agoraAccessToken;

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
const handRequests = {};
const roomSpeakers = {};

function emitRoomState(roomId) {
  io.to(roomId).emit("room:handRequests", handRequests[roomId] || []);
  io.to(roomId).emit("room:speakersUpdate", roomSpeakers[roomId] || []);
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.emit("rooms:update", liveRooms);

  socket.on("room:join", ({ roomId, user, agoraUid }) => {
    if (!roomId || !user) return;

    if (!liveRooms[roomId]) {
      liveRooms[roomId] = {
        users: [],
      };
    }

    if (!handRequests[roomId]) {
      handRequests[roomId] = [];
    }

    if (!roomSpeakers[roomId]) {
      roomSpeakers[roomId] = [];
    }

    const alreadyJoined = liveRooms[roomId].users.find(
      (item) => item.id === user.id
    );

    const userData = {
      id: user.id,
      name: user.name,
      socketId: socket.id,
      agoraUid: Number(agoraUid),
      isHost: user.isHost || false,
    };

    if (!alreadyJoined) {
      liveRooms[roomId].users.push(userData);
    } else {
      alreadyJoined.socketId = socket.id;
      alreadyJoined.agoraUid = Number(agoraUid);
      alreadyJoined.isHost = user.isHost || false;
    }

    if (user.isHost) {
      const hostAlreadySpeaker = roomSpeakers[roomId].find(
        (item) => item.id === user.id
      );

      if (!hostAlreadySpeaker) {
        roomSpeakers[roomId].push({
          id: user.id,
          name: user.name,
          agoraUid: Number(agoraUid),
          isHost: true,
        });
      }
    }

    socket.join(roomId);

    io.emit("rooms:update", liveRooms);

    io.to(roomId).emit("room:message", {
      type: "system",
      text: `${user.name} joined the room`,
    });

    emitRoomState(roomId);
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

    if (roomSpeakers[roomId]) {
      roomSpeakers[roomId] = roomSpeakers[roomId].filter(
        (item) => item.id !== user.id
      );
    }

    if (handRequests[roomId]) {
      handRequests[roomId] = handRequests[roomId].filter(
        (item) => item.id !== user.id
      );
    }

    socket.leave(roomId);
    io.emit("rooms:update", liveRooms);
    emitRoomState(roomId);
  });

  socket.on("room:raiseHand", ({ roomId, user }) => {
    if (!roomId || !user) return;

    if (!handRequests[roomId]) {
      handRequests[roomId] = [];
    }

    const alreadySpeaker = roomSpeakers[roomId]?.find(
      (item) => item.id === user.id
    );

    if (alreadySpeaker) return;

    const alreadyExists = handRequests[roomId].find(
      (item) => item.id === user.id
    );

    if (!alreadyExists) {
      handRequests[roomId].push({
        id: user.id,
        name: user.name,
      });
    }

    emitRoomState(roomId);
  });

  socket.on("room:approveSpeaker", ({ roomId, userId }) => {
    if (!roomId || !userId) return;

    if (!roomSpeakers[roomId]) {
      roomSpeakers[roomId] = [];
    }

    const targetUser = liveRooms[roomId]?.users.find(
      (item) => item.id === userId
    );

    if (!targetUser) return;

    const alreadySpeaker = roomSpeakers[roomId].find(
      (item) => item.id === userId
    );

    if (!alreadySpeaker) {
      roomSpeakers[roomId].push({
        id: targetUser.id,
        name: targetUser.name,
        agoraUid: targetUser.agoraUid,
        isHost: targetUser.isHost || false,
      });
    }

    if (handRequests[roomId]) {
      handRequests[roomId] = handRequests[roomId].filter(
        (item) => item.id !== userId
      );
    }

    emitRoomState(roomId);
  });

  socket.on("room:removeSpeaker", ({ roomId, userId }) => {
    if (!roomId || !userId) return;

    if (roomSpeakers[roomId]) {
      roomSpeakers[roomId] = roomSpeakers[roomId].filter(
        (item) => item.id !== userId
      );
    }

    emitRoomState(roomId);
  });

  socket.on("room:clearHand", ({ roomId, userId }) => {
    if (!roomId || !userId) return;

    if (handRequests[roomId]) {
      handRequests[roomId] = handRequests[roomId].filter(
        (item) => item.id !== userId
      );
    }

    emitRoomState(roomId);
  });

  socket.on("disconnect", () => {
    Object.keys(liveRooms).forEach((roomId) => {
      const disconnectedUsers = liveRooms[roomId].users.filter(
        (item) => item.socketId === socket.id
      );

      liveRooms[roomId].users = liveRooms[roomId].users.filter(
        (item) => item.socketId !== socket.id
      );

      disconnectedUsers.forEach((user) => {
        if (roomSpeakers[roomId]) {
          roomSpeakers[roomId] = roomSpeakers[roomId].filter(
            (item) => item.id !== user.id
          );
        }

        if (handRequests[roomId]) {
          handRequests[roomId] = handRequests[roomId].filter(
            (item) => item.id !== user.id
          );
        }
      });

      emitRoomState(roomId);
    });

    io.emit("rooms:update", liveRooms);

    console.log("User disconnected:", socket.id);
  });
});

const port = process.env.PORT || 5001;

server.listen(port, () => {
  console.log(`Backend running on port ${port}`);
});