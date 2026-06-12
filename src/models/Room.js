import mongoose from "mongoose";

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    host: {
      type: String,
      required: true,
    },

    hostId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    tag: {
      type: String,
      default: "Live",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    locked: {
      type: Boolean,
      default: false,
    },

    password: {
      type: String,
      default: "",
    },
    description: {
  type: String,
  default: "",
},
  },
  {
    timestamps: true,
  }
);

const Room = mongoose.model("Room", roomSchema);

export default Room;