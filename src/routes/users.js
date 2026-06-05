import express from "express";

import User from "../models/User.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

async function findUserByIdOrPhone(value) {
  if (!value) return null;

  const isMongoId = /^[0-9a-fA-F]{24}$/.test(value);

  if (isMongoId) {
    return User.findById(value);
  }

  return User.findOne({
    phone: value,
  });
}

/*
FOLLOW USER
*/

router.post(
  "/follow/:userId",
  authMiddleware,
  async (req, res) => {
    try {
      const currentUser = req.user;
      const targetUser = await findUserByIdOrPhone(
        req.params.userId
      );

      if (!targetUser) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      if (
        currentUser._id.toString() ===
        targetUser._id.toString()
      ) {
        return res.status(400).json({
          error: "Cannot follow yourself",
        });
      }

      const alreadyFollowing =
        currentUser.following.some(
          (id) =>
            id.toString() ===
            targetUser._id.toString()
        );

      if (!alreadyFollowing) {
        currentUser.following.push(
          targetUser._id
        );

        targetUser.followers.push(
          currentUser._id
        );

        targetUser.followersCount =
          targetUser.followers.length;

        await currentUser.save();
        await targetUser.save();
      }

      res.json({
        success: true,
      });
    } catch (error) {
      console.error("Follow failed:", error);

      res.status(500).json({
        error: "Follow failed",
      });
    }
  }
);

/*
UNFOLLOW USER
*/

router.post(
  "/unfollow/:userId",
  authMiddleware,
  async (req, res) => {
    try {
      const currentUser = req.user;
      const targetUser = await findUserByIdOrPhone(
        req.params.userId
      );

      if (!targetUser) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      currentUser.following =
        currentUser.following.filter(
          (id) =>
            id.toString() !==
            targetUser._id.toString()
        );

      targetUser.followers =
        targetUser.followers.filter(
          (id) =>
            id.toString() !==
            currentUser._id.toString()
        );

      targetUser.followersCount =
        targetUser.followers.length;

      await currentUser.save();
      await targetUser.save();

      res.json({
        success: true,
      });
    } catch (error) {
      console.error("Unfollow failed:", error);

      res.status(500).json({
        error: "Unfollow failed",
      });
    }
  }
);

/*
PROFILE
*/

router.get(
  "/profile/:userId",
  authMiddleware,
  async (req, res) => {
    try {
      const user = await findUserByIdOrPhone(
        req.params.userId
      );

      if (!user) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      const isFollowing =
        req.user.following.some(
          (id) =>
            id.toString() === user._id.toString()
        );

      res.json({
        id: user._id,
        name: user.name,
        phone: user.phone,
        level: user.level,
        vipLevel: user.vipLevel || 0,
        experience: user.experience || 0,
        totalSpent: user.totalSpent || 0,
        coins: user.coins,
        followers: user.followers.length,
        followersCount:
          user.followersCount || user.followers.length,
        following: user.following.length,
        isFollowing,
      });
    } catch (error) {
      console.error("Profile error:", error);

      res.status(500).json({
        error: "Profile error",
      });
    }
  }
);

export default router;