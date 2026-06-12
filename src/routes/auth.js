import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";

import User from "../models/User.js";

const router = express.Router();

const registerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(8),
  password: z.string().min(6),
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid registration data",
    });
  }

  const exists = await User.findOne({
    phone: parsed.data.phone,
  });

  if (exists) {
    return res.status(409).json({
      error: "Phone already registered",
    });
  }

  const passwordHash = await bcrypt.hash(
    parsed.data.password,
    10
  );

  const user = await User.create({
    name: parsed.data.name,
    phone: parsed.data.phone,
    passwordHash,
    role: "user",
    coins: 120,
    level: 1,
  });

  const token = jwt.sign(
    {
      id: user._id,
      role: user.role,
      name: user.name,
    },
    process.env.JWT_SECRET || "dev_secret",
    { expiresIn: "7d" }
  );

  res.json({
    token,
    user: {
      id: user._id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      coins: user.coins,
      level: user.level,
      profileImage: user.profileImage || "",
    },
  });
});

router.post("/login", async (req, res) => {
  const user = await User.findOne({
    phone: req.body.phone,
  });

  if (!user) {
    return res.status(401).json({
      error: "Invalid credentials",
    });
  }

  const ok = await bcrypt.compare(
    req.body.password || "",
    user.passwordHash
  );

  if (!ok) {
    return res.status(401).json({
      error: "Invalid credentials",
    });
  }

  const token = jwt.sign(
    {
      id: user._id,
      role: user.role,
      name: user.name,
    },
    process.env.JWT_SECRET || "dev_secret",
    { expiresIn: "7d" }
  );

  res.json({
    token,
    user: {
      id: user._id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      coins: user.coins,
      level: user.level,
      profileImage: user.profileImage || "",
    },
  });
});

export default router;