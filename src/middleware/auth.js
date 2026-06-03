import jwt from "jsonwebtoken";
import User from "../models/User.js";

export async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    const token = header.split(" ")[1];

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "dev_secret"
    );

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        error: "User not found",
      });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({
      error: "Invalid token",
    });
  }
}