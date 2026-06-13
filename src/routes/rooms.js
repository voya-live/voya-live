import express from "express";
import Room from "../models/Room.js";
import { authRequired } from "../middleware/auth.js";

const router = express.Router();

router.get("/", async (_, res) => {
  try {
    const rooms = await Room.find({
      isActive: true,
    }).sort({
      createdAt: -1,
    });

    res.json({ rooms });
  } catch (error) {
    res.status(500).json({
      error: "Failed to load rooms",
    });
  }
});

router.post("/", authRequired, async (req, res) => {
  try {
    const room = await Room.create({
      name: req.body.name || "New Room",
      host: req.user.name,
      hostId: req.user.id,
      tag: req.body.tag || "Live",
      category: req.body.category || "Chat",
      isActive: true,
      locked: false,
      password: "",
      description: "",
      coverImage: "",
    });

    res.status(201).json({ room });
  } catch (error) {
    res.status(500).json({
      error: "Failed to create room",
    });
  }
});

router.patch("/:roomId/lock", authRequired, async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);

    if (!room) {
      return res.status(404).json({
        error: "Room not found",
      });
    }

    if (String(room.hostId) !== String(req.user.id)) {
      return res.status(403).json({
        error: "Only host can lock this room",
      });
    }

    room.locked = true;
    await room.save();

    res.json({ room });
  } catch (error) {
    res.status(500).json({
      error: "Failed to lock room",
    });
  }
});

router.patch("/:roomId/unlock", authRequired, async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);

    if (!room) {
      return res.status(404).json({
        error: "Room not found",
      });
    }

    if (String(room.hostId) !== String(req.user.id)) {
      return res.status(403).json({
        error: "Only host can unlock this room",
      });
    }

    room.locked = false;
    await room.save();

    res.json({ room });
  } catch (error) {
    res.status(500).json({
      error: "Failed to unlock room",
    });
  }
});

router.patch("/:roomId/password", authRequired, async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);

    if (!room) {
      return res.status(404).json({
        error: "Room not found",
      });
    }

    if (String(room.hostId) !== String(req.user.id)) {
      return res.status(403).json({
        error: "Only host can set room password",
      });
    }

    const password = String(req.body.password || "").trim();

    if (!password) {
      return res.status(400).json({
        error: "Password is required",
      });
    }

    room.password = password;
    await room.save();

    res.json({ room });
  } catch (error) {
    res.status(500).json({
      error: "Failed to set room password",
    });
  }
});

router.delete("/:roomId/password", authRequired, async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);

    if (!room) {
      return res.status(404).json({
        error: "Room not found",
      });
    }

    if (String(room.hostId) !== String(req.user.id)) {
      return res.status(403).json({
        error: "Only host can remove room password",
      });
    }

    room.password = "";
    await room.save();

    res.json({ room });
  } catch (error) {
    res.status(500).json({
      error: "Failed to remove room password",
    });
  }
});
router.patch("/:roomId/cover", authRequired, async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);

    if (!room) {
      return res.status(404).json({
        error: "Room not found",
      });
    }

    if (String(room.hostId) !== String(req.user.id)) {
      return res.status(403).json({
        error: "Only host can update room cover",
      });
    }

    room.coverImage = String(req.body.coverImage || "").trim();

    await room.save();

    res.json({ room });
  } catch (error) {
    res.status(500).json({
      error: "Failed to update room cover",
    });
  }
});

export default router;