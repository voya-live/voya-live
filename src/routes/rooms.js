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
      isActive: true,
    });

    res.status(201).json({ room });
  } catch (error) {
    res.status(500).json({
      error: "Failed to create room",
    });
  }
});

export default router;