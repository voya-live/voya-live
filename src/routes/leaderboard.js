import express from "express";
import User from "../models/User.js";

const router = express.Router();

router.get("/", async (_, res) => {
  try {
    const users = await User.find()
      .sort({
        experience: -1,
        followers: -1,
      })
      .limit(50)
      .select(
        "name level experience followers"
      );

    res.json({
      users,
    });
  } catch {
    res.status(500).json({
      error: "Leaderboard error",
    });
  }
});

export default router;