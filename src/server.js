import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import agoraAccessToken from "agora-access-token";

const { RtcTokenBuilder, RtcRole } = agoraAccessToken;

import { connectDb } from "./config/db.js";
import Room from "./models/Room.js";

import authRoutes from "./routes/auth.js";
import roomRoutes from "./routes/rooms.js";
import walletRoutes from "./routes/wallet.js";
import adminRoutes from "./routes/admin.js";
import userRoutes from "./routes/users.js";
import leaderboardRoutes from "./routes/leaderboard.js";

dotenv.config();

connectDb();

const app = express();
const server = http.createServer(app);

const MAX_SPEAKERS = 8;

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
app.use("/api/users", userRoutes);
app.use("/api/leaderboard", leaderboardRoutes);

const liveRooms = {};
const handRequests = {};
const roomSpeakers = {};
const roomBans = {};
const roomMembers = {};
const memberRequests = {};
const roomAdmins = {};
function isRoomHost(roomId, userId) {
  const user = liveRooms[roomId]?.users?.find(
    (item) => item.id === userId
  );

  return Boolean(user?.isHost);
}

function isRoomAdmin(roomId, userId) {
  return Boolean(
    roomAdmins[roomId]?.find(
      (item) => item.id === userId
    )
  );
}

function canManageRoom(roomId, userId) {
  return (
    isRoomHost(roomId, userId) ||
    isRoomAdmin(roomId, userId)
  );
}

function canControlTarget(roomId, actorId, targetId) {
  if (isRoomHost(roomId, actorId)) {
    return true;
  }

  if (isRoomAdmin(roomId, actorId)) {
    if (isRoomHost(roomId, targetId)) {
      return false;
    }

    if (isRoomAdmin(roomId, targetId)) {
      return false;
    }

    return true;
  }

  return false;
}

function emitRoomState(roomId) {
  io.to(roomId).emit("room:handRequests", handRequests[roomId] || []);
  io.to(roomId).emit("room:speakersUpdate", roomSpeakers[roomId] || []);
}

function getNonHostSpeakerCount(roomId) {
  return (roomSpeakers[roomId] || []).filter(
    (item) => !item.isHost
  ).length;
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.emit("rooms:update", liveRooms);

  socket.on("room:join", async ({ roomId, user, agoraUid }) => {
    if (!roomId || !user) return;
    const bannedUser = roomBans[roomId]?.find(
  (item) => item.id === user.id
);

if (bannedUser) {
  socket.emit("room:error", {
    message: "You are banned from this room",
  });
  return;
}
    try {
  const room = await Room.findById(roomId);

if (room?.locked && !user.isHost) {
  socket.emit("room:error", {
    message: "Room is locked by host",
  });

  return;
}

if (room?.password && !user.isHost) {
  const providedPassword = String(user.roomPassword || "").trim();

  if (providedPassword !== room.password) {
    socket.emit("room:error", {
      message: "Incorrect room password",
    });

    return;
  }
}
} catch (error) {
  socket.emit("room:error", {
    message: "Failed to check room lock status",
  });

  return;
}

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
    if (!roomMembers[roomId]) {
  roomMembers[roomId] = [];
}

if (!memberRequests[roomId]) {
  memberRequests[roomId] = [];
}

if (!roomAdmins[roomId]) {
  roomAdmins[roomId] = [];
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
      level: user.level || 1,
      experience: user.experience || 0,
      vipLevel: user.vipLevel || 0,
    };

    if (!alreadyJoined) {
      liveRooms[roomId].users.push(userData);
    } else {
      alreadyJoined.socketId = socket.id;
      alreadyJoined.agoraUid = Number(agoraUid);
      alreadyJoined.isHost = user.isHost || false;
      alreadyJoined.level = user.level || 1;
      alreadyJoined.experience = user.experience || 0;
      alreadyJoined.vipLevel = user.vipLevel || 0;
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
          muted: false,
          level: user.level || 1,
          experience: user.experience || 0,
          vipLevel: user.vipLevel || 0,
        });
      } else {
        hostAlreadySpeaker.agoraUid = Number(agoraUid);
        hostAlreadySpeaker.level = user.level || 1;
        hostAlreadySpeaker.experience = user.experience || 0;
        hostAlreadySpeaker.vipLevel = user.vipLevel || 0;
      }
    }
    const isMember = roomMembers[roomId]?.find(
  (item) => item.id === user.id
);

if (isMember && !user.isHost) {
  const alreadySpeaker = roomSpeakers[roomId].find(
    (item) => item.id === user.id
  );

  if (!alreadySpeaker) {
    roomSpeakers[roomId].push({
      id: user.id,
      name: user.name,
      agoraUid: Number(agoraUid),
      isHost: false,
      muted: false,
      level: user.level || 1,
      experience: user.experience || 0,
      vipLevel: user.vipLevel || 0,
    });
  } else {
    alreadySpeaker.agoraUid = Number(agoraUid);
    alreadySpeaker.level = user.level || 1;
    alreadySpeaker.experience = user.experience || 0;
    alreadySpeaker.vipLevel = user.vipLevel || 0;
  }
}

    socket.join(roomId);

    io.emit("rooms:update", liveRooms);

    io.to(roomId).emit("room:message", {
      type: "system",
      text: `${user.name} joined the room`,
    });
    io.to(roomId).emit(
  "room:membersUpdate",
  roomMembers[roomId] || []
);

io.to(roomId).emit(
  "room:memberRequests",
  memberRequests[roomId] || []
);

io.to(roomId).emit(
  "room:adminsUpdate",
  roomAdmins[roomId] || []
);

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

  socket.on("room:gift", ({ roomId, user, gift }) => {
    if (!roomId || !user || !gift) return;

    io.to(roomId).emit("room:gift", {
      id: Date.now(),
      user: user.name,
      giftName: gift.name,
      giftIcon: gift.icon,
      amount: gift.amount,
      text: `${user.name} sent ${gift.icon} ${gift.name}`,
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
    const actor = liveRooms[roomId]?.users?.find(
  (item) => item.socketId === socket.id
);

if (!actor || !canManageRoom(roomId, actor.id)) {
  socket.emit("room:error", {
    message: "You are not allowed to manage this room",
  });

  return;
}

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

    if (alreadySpeaker) return;

    if (getNonHostSpeakerCount(roomId) >= MAX_SPEAKERS) {
      socket.emit("room:error", {
        message: "Stage is full. Maximum 8 speakers allowed.",
      });

      return;
    }

    roomSpeakers[roomId].push({
      id: targetUser.id,
      name: targetUser.name,
      agoraUid: targetUser.agoraUid,
      isHost: targetUser.isHost || false,
      muted: false,
      level: targetUser.level || 1,
      experience: targetUser.experience || 0,
      vipLevel: targetUser.vipLevel || 0,
    });

    if (handRequests[roomId]) {
      handRequests[roomId] = handRequests[roomId].filter(
        (item) => item.id !== userId
      );
    }

    emitRoomState(roomId);
  });

  socket.on("room:removeSpeaker", ({ roomId, userId }) => {
    if (!roomId || !userId) return;
    const actor = liveRooms[roomId]?.users?.find(
  (item) => item.socketId === socket.id
);

if (!actor || !canManageRoom(roomId, actor.id)) {
  socket.emit("room:error", {
    message: "You are not allowed to manage this room",
  });

  return;
}

    if (roomSpeakers[roomId]) {
      roomSpeakers[roomId] = roomSpeakers[roomId].filter(
        (item) => item.id !== userId
      );
    }

    emitRoomState(roomId);
  });
  socket.on("room:kickUser", ({ roomId, userId }) => {
  if (!roomId || !userId) return;
  const actor = liveRooms[roomId]?.users?.find(
  (item) => item.socketId === socket.id
);

if (!actor || !canControlTarget(roomId, actor.id, userId)) {
  socket.emit("room:error", {
    message: "You are not allowed to control this user",
  });

  return;
}

  const targetUser = liveRooms[roomId]?.users?.find(
    (item) => item.id === userId
  );

  if (!targetUser) return;

  if (targetUser.isHost) {
    socket.emit("room:error", {
      message: "Host cannot be kicked",
    });

    return;
  }

  io.to(targetUser.socketId).emit("room:kicked", {
    message: "You have been removed from the room by the host",
  });

  liveRooms[roomId].users = liveRooms[roomId].users.filter(
    (item) => item.id !== userId
  );

  if (roomSpeakers[roomId]) {
    roomSpeakers[roomId] = roomSpeakers[roomId].filter(
      (item) => item.id !== userId
    );
  }

  if (handRequests[roomId]) {
    handRequests[roomId] = handRequests[roomId].filter(
      (item) => item.id !== userId
    );
  }

  io.sockets.sockets.get(targetUser.socketId)?.leave(roomId);

  io.emit("rooms:update", liveRooms);

  emitRoomState(roomId);
});

socket.on("room:banUser", ({ roomId, userId }) => {
  if (!roomId || !userId) return;
  const actor = liveRooms[roomId]?.users?.find(
  (item) => item.socketId === socket.id
);

if (!actor || !canControlTarget(roomId, actor.id, userId)) {
  socket.emit("room:error", {
    message: "You are not allowed to control this user",
  });

  return;
}

  if (!roomBans[roomId]) {
  roomBans[roomId] = [];
}

const targetUser = liveRooms[roomId]?.users?.find(
  (item) => item.id === userId
);

const alreadyBanned = roomBans[roomId].find(
  (item) => item.id === userId
);

if (!alreadyBanned && targetUser) {
  roomBans[roomId].push({
    id: userId,
    name: targetUser.name,
  });
}

  if (targetUser?.isHost) {
    socket.emit("room:error", {
      message: "Host cannot be banned",
    });

    return;
  }

  if (targetUser?.socketId) {
    io.to(targetUser.socketId).emit("room:kicked", {
      message: "You have been banned from this room",
    });

    io.sockets.sockets.get(targetUser.socketId)?.leave(roomId);
  }

  if (liveRooms[roomId]) {
    liveRooms[roomId].users = liveRooms[roomId].users.filter(
      (item) => item.id !== userId
    );
  }

  if (roomSpeakers[roomId]) {
    roomSpeakers[roomId] = roomSpeakers[roomId].filter(
      (item) => item.id !== userId
    );
  }

  if (handRequests[roomId]) {
    handRequests[roomId] = handRequests[roomId].filter(
      (item) => item.id !== userId
    );
  }

  io.emit("rooms:update", liveRooms);

io.to(roomId).emit(
  "room:bannedUsers",
  roomBans[roomId] || []
);

emitRoomState(roomId);
});
socket.on("room:unbanUser", ({ roomId, userId }) => {
  if (!roomId || !userId) return;

  if (!roomBans[roomId]) return;

  roomBans[roomId] = roomBans[roomId].filter(
    (item) => item.id !== userId
  );

  io.to(roomId).emit(
    "room:bannedUsers",
    roomBans[roomId] || []
  );
  emitRoomState(roomId);
});
socket.on("room:addAdmin", ({ roomId, userId, name }) => {
  if (!roomId || !userId) return;

  if (!roomAdmins[roomId]) {
    roomAdmins[roomId] = [];
  }

  const exists = roomAdmins[roomId].find(
    (item) => item.id === userId
  );

  if (!exists) {
    roomAdmins[roomId].push({
      id: userId,
      name,
    });
  }

  io.to(roomId).emit(
    "room:adminsUpdate",
    roomAdmins[roomId]
  );
});

socket.on("room:removeAdmin", ({ roomId, userId }) => {
  if (!roomId || !userId) return;

  if (!roomAdmins[roomId]) return;

  roomAdmins[roomId] = roomAdmins[roomId].filter(
    (item) => item.id !== userId
  );

  io.to(roomId).emit(
    "room:adminsUpdate",
    roomAdmins[roomId]
  );
});
socket.on("room:requestMembership", ({ roomId, user }) => {
  if (!roomId || !user?.id) return;

  if (!memberRequests[roomId]) {
    memberRequests[roomId] = [];
  }

  if (!roomMembers[roomId]) {
    roomMembers[roomId] = [];
  }

  const alreadyMember = roomMembers[roomId].find(
    (item) => item.id === user.id
  );

  if (alreadyMember) {
    socket.emit("room:error", {
      message: "You are already a room member",
    });

    return;
  }

  const alreadyRequested = memberRequests[roomId].find(
    (item) => item.id === user.id
  );

  if (!alreadyRequested) {
    memberRequests[roomId].push({
      id: user.id,
      name: user.name,
    });
  }

  io.to(roomId).emit(
    "room:memberRequests",
    memberRequests[roomId]
  );

  socket.emit("room:error", {
    message: "Membership request sent",
  });
});
socket.on("room:approveMember", ({ roomId, userId, name }) => {
  if (!roomId || !userId) return;
  const actor = liveRooms[roomId]?.users?.find(
  (item) => item.socketId === socket.id
);

if (!actor || !canManageRoom(roomId, actor.id)) {
  socket.emit("room:error", {
    message: "You are not allowed to approve members",
  });

  return;
}

  if (!roomMembers[roomId]) {
    roomMembers[roomId] = [];
  }

  const exists = roomMembers[roomId].find(
    (item) => item.id === userId
  );

  if (!exists) {
    roomMembers[roomId].push({
      id: userId,
      name,
    });
  }
  if (memberRequests[roomId]) {
  memberRequests[roomId] = memberRequests[roomId].filter(
    (item) => item.id !== userId
  );
}

io.to(roomId).emit(
  "room:memberRequests",
  memberRequests[roomId] || []
);

  io.to(roomId).emit(
    "room:membersUpdate",
    roomMembers[roomId]
  );
});
  socket.on("room:hostMuteUser", ({ roomId, userId, muted }) => {
    if (!roomId || !userId) return;
    const actor = liveRooms[roomId]?.users?.find(
  (item) => item.socketId === socket.id
);

if (!actor || !canControlTarget(roomId, actor.id, userId)) {
  socket.emit("room:error", {
    message: "You are not allowed to control this user",
  });

  return;
}

    const speaker = roomSpeakers[roomId]?.find(
      (item) => item.id === userId
    );

    if (!speaker) return;

    speaker.muted = Boolean(muted);

    emitRoomState(roomId);
  });
  socket.on("room:hostMuteAll", ({ roomId, muted }) => {
  if (!roomId) return;
  const actor = liveRooms[roomId]?.users?.find(
  (item) => item.socketId === socket.id
);

if (!actor || !isRoomHost(roomId, actor.id)) {
  socket.emit("room:error", {
    message: "Only host can mute all",
  });

  return;
}

  if (!roomSpeakers[roomId]) return;

  roomSpeakers[roomId] = roomSpeakers[roomId].map((speaker) => {
    if (speaker.isHost) return speaker;

    return {
      ...speaker,
      muted: Boolean(muted),
    };
  });

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