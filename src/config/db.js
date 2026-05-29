import mongoose from "mongoose";

export async function connectDb() {
  try {
    await mongoose.connect(
      process.env.MONGO_URI || "mongodb://127.0.0.1:27017/voya_live"
    );

    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection failed", error.message);
  }
}