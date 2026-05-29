import express from "express";
import User from "../models/User.js";
import { authRequired } from "../middleware/auth.js";

const router = express.Router();

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

    user.transactions.unshift({
      type: "gift",
      amount: -amount,
    });

    await user.save();

    res.json({
      success: true,
      coins: user.coins,
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