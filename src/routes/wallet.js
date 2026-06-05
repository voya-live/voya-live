import express from "express";
import User from "../models/User.js";
import { authRequired } from "../middleware/auth.js";

const router = express.Router();

function calculateVipLevel(totalSpent) {
  if (totalSpent >= 5000) return 5;
  if (totalSpent >= 2500) return 4;
  if (totalSpent >= 1000) return 3;
  if (totalSpent >= 500) return 2;
  if (totalSpent >= 100) return 1;

  return 0;
}

router.get("/balance", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    res.json({
      coins: user.coins,
      level: user.level,
      experience: user.experience || 0,
      totalSpent: user.totalSpent || 0,
      vipLevel: user.vipLevel || 0,
    });
  } catch (error) {
    res.status(500).json({
      error: "Wallet error",
    });
  }
});

router.post("/gift", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    const amount = Number(req.body.amount || 20);

    if (user.coins < amount) {
      return res.status(400).json({
        error: "Not enough coins",
      });
    }

    user.coins -= amount;

    user.totalSpent = (user.totalSpent || 0) + amount;

    const expGain = Math.floor(amount / 10);

    user.experience = (user.experience || 0) + expGain;

    user.level = Math.floor(user.experience / 100) + 1;

    user.vipLevel = calculateVipLevel(user.totalSpent);

    user.transactions.unshift({
      type: "gift",
      amount: -amount,
    });

    await user.save();

    res.json({
      success: true,
      coins: user.coins,
      level: user.level,
      experience: user.experience,
      totalSpent: user.totalSpent,
      vipLevel: user.vipLevel,
    });
  } catch (error) {
    res.status(500).json({
      error: "Gift failed",
    });
  }
});

router.post("/recharge", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    const amount = Number(req.body.amount || 100);

    user.coins += amount;

    user.transactions.unshift({
      type: "recharge",
      amount,
    });

    await user.save();

    res.json({
      success: true,
      coins: user.coins,
    });
  } catch (error) {
    res.status(500).json({
      error: "Recharge failed",
    });
  }
});

router.get("/transactions", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    res.json({
      transactions: user.transactions || [],
    });
  } catch (error) {
    res.status(500).json({
      error: "Transactions error",
    });
  }
});

export default router;