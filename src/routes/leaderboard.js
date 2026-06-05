import express from "express";

import User from "../models/User.js";

const router = express.Router();

/*
TOP GIFTERS
*/

router.get("/gifters", async (_, res) => {
  try {
    const users = await User.find()
      .sort({ totalSpent: -1 })
      .limit(20)
      .select(
        "name level totalSpent followers"
      );

    res.json(users);
  } catch {
    res.status(500).json({
      error: "Leaderboard error",
    });
  }
});

/*
TOP FOLLOWERS
*/

router.get("/followers", async (_, res) => {
  try {
    const users = await User.find()
      .sort({ followersCount: -1 })
      .limit(20)
      .select(
        "name level followersCount totalSpent"
      );

    res.json(users);
  } catch {
    res.status(500).json({
      error: "Leaderboard error",
    });
  }
});

export default router;