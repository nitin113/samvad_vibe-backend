const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const Message = require("../models/Message");
const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

router.get("/users", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ users: [] });
    }

    const users = await User.find({ online: true }).sort({ lastSeen: -1 });
    res.json({ users });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/messages/:roomName", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ messages: [] });
    }

    const messages = await Message.find({ roomName: req.params.roomName }).sort({ createdAt: 1 });
    res.json({ messages });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
