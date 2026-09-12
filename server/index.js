require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const authRoutes = require("./routes/auth");
const Message = require("./models/Message");
const User = require("./models/User");

const DEFAULT_MAX_MEMBERS = 5;
const MAX_ROOM_CAPACITY = 10;
const MESSAGE_LIMIT = 100;

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

if (mongoUri) {
  mongoose
    .connect(mongoUri)
    .then(() => console.log("MongoDB connected"))
    .catch((err) => console.log("MongoDB connection error:", err));
} else {
  console.log("MongoDB not configured. Continuing without database connection.");
}

const rooms = new Map();
const roomMessages = new Map();
const sessions = new Map();

const isMongoReady = () => mongoose.connection.readyState === 1;

const normalizeRoomName = (value) => String(value || "").trim();

const clampMaxMembers = (value) => {
  const requestedMaxMembers = Number(value) || DEFAULT_MAX_MEMBERS;
  return Math.min(Math.max(requestedMaxMembers, 1), MAX_ROOM_CAPACITY);
};

const createClientId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const getMessagesForRoom = (roomName) => {
  if (!roomMessages.has(roomName)) {
    roomMessages.set(roomName, []);
  }

  return roomMessages.get(roomName);
};

const getRoomUsers = (room) => {
  return Array.from(room.members)
    .map((clientId) => sessions.get(clientId))
    .filter(Boolean)
    .map((session) => session.username);
};

const syncRoomAdmin = (room) => {
  if (room.members.size === 0) {
    rooms.delete(room.name);
    return;
  }

  const nextAdminClientId = Array.from(room.members)[0];
  const nextAdminSession = sessions.get(nextAdminClientId);

  room.adminClientId = nextAdminClientId;
  room.adminUsername = nextAdminSession ? nextAdminSession.username : null;
};

const getRoomInfo = (room, clientId) => ({
  roomName: room.name,
  roomType: room.type,
  maxMembers: room.maxMembers,
  isAdmin: room.adminClientId === clientId,
  adminName: room.adminUsername || "Not assigned",
});

const getRoomState = (roomName, clientId) => {
  const room = rooms.get(roomName);

  if (!room) {
    return {
      roomInfo: null,
      users: [],
      messages: [],
    };
  }

  return {
    roomInfo: getRoomInfo(room, clientId),
    users: getRoomUsers(room),
    messages: getMessagesForRoom(roomName),
  };
};

const persistUser = async (clientId, username, roomName, roomType, isAdmin) => {
  if (!isMongoReady()) {
    return;
  }

  try {
    await User.findOneAndUpdate(
      { socketId: clientId },
      {
        username,
        roomName,
        roomType,
        isAdmin,
        online: true,
        lastSeen: new Date(),
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );
  } catch (error) {
    console.error("Failed to persist user:", error.message);
  }
};

const persistMessage = async (username, roomName, message) => {
  if (!isMongoReady()) {
    return;
  }

  try {
    await Message.create({
      username,
      roomName,
      message,
    });
  } catch (error) {
    console.error("Failed to persist message:", error.message);
  }
};

const setUserOffline = async (clientId) => {
  if (!isMongoReady()) {
    return;
  }

  try {
    await User.findOneAndUpdate(
      { socketId: clientId },
      {
        online: false,
        lastSeen: new Date(),
      },
      { new: true }
    );
  } catch (error) {
    console.error("Failed to mark user offline:", error.message);
  }
};

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Chat API is running." });
});

app.get("/api/chat/state", (req, res) => {
  const roomName = normalizeRoomName(req.query.roomName);
  const clientId = String(req.query.clientId || "").trim();

  if (!roomName) {
    return res.status(400).json({ message: "Room name is required." });
  }

  const state = getRoomState(roomName, clientId);
  return res.json(state);
});

app.post("/api/chat/join", async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const roomName = normalizeRoomName(req.body?.roomName);
  const roomType = req.body?.roomType === "private" ? "private" : "public";
  const maxMembers = clampMaxMembers(req.body?.maxMembers);
  const incomingClientId = String(req.body?.clientId || "").trim();
  const clientId = incomingClientId || createClientId();

  if (!username || !roomName) {
    return res.status(400).json({ message: "Username and room name are required." });
  }

  const existingSession = sessions.get(clientId);

  if (existingSession && existingSession.roomName !== roomName) {
    const previousRoom = rooms.get(existingSession.roomName);

    if (previousRoom) {
      previousRoom.members.delete(clientId);
      syncRoomAdmin(previousRoom);
    }

    sessions.delete(clientId);
    setUserOffline(clientId);
  }

  let room = rooms.get(roomName);

  if (!room) {
    room = {
      name: roomName,
      type: roomType,
      maxMembers,
      adminClientId: clientId,
      adminUsername: username,
      members: new Set([clientId]),
    };

    rooms.set(roomName, room);
    sessions.set(clientId, { clientId, username, roomName });
    persistUser(clientId, username, roomName, roomType, true);

    return res.json({
      clientId,
      ...getRoomState(roomName, clientId),
    });
  }

  if (room.members.has(clientId)) {
    const session = sessions.get(clientId);

    if (session) {
      session.username = username;
      session.roomName = roomName;
    }

    return res.json({
      clientId,
      ...getRoomState(roomName, clientId),
    });
  }

  if (room.members.size >= room.maxMembers) {
    return res.status(409).json({
      message: `Room is full. Maximum ${room.maxMembers} member(s) allowed.`,
    });
  }

  room.members.add(clientId);
  sessions.set(clientId, { clientId, username, roomName });
  persistUser(clientId, username, roomName, room.type, false);

  const state = getRoomState(roomName, clientId);

  return res.json({
    clientId,
    ...state,
  });
});

app.post("/api/chat/message", async (req, res) => {
  const clientId = String(req.body?.clientId || "").trim();
  const roomName = normalizeRoomName(req.body?.roomName);
  const message = String(req.body?.message || "").trim();
  const session = sessions.get(clientId);

  if (!session || session.roomName !== roomName) {
    return res.status(400).json({ message: "You must join a room before sending messages." });
  }

  if (!message) {
    return res.status(400).json({ message: "Message cannot be empty." });
  }

  const room = rooms.get(roomName);

  if (!room) {
    return res.status(404).json({ message: "Room not found." });
  }

  const messages = getMessagesForRoom(roomName);
  messages.push({
    username: session.username,
    message,
    timestamp: new Date().toISOString(),
  });

  if (messages.length > MESSAGE_LIMIT) {
    messages.shift();
  }

  persistMessage(session.username, roomName, message);

  return res.json({
    ok: true,
    ...getRoomState(roomName, clientId),
  });
});

app.post("/api/chat/leave", async (req, res) => {
  const clientId = String(req.body?.clientId || "").trim();
  const roomName = normalizeRoomName(req.body?.roomName);
  const session = sessions.get(clientId);

  if (!session && !roomName) {
    return res.json({ ok: true, roomInfo: null, users: [], messages: [] });
  }

  const targetRoomName = roomName || session?.roomName;
  const room = targetRoomName ? rooms.get(targetRoomName) : null;

  if (room && clientId) {
    room.members.delete(clientId);
    syncRoomAdmin(room);
  }

  if (session) {
    sessions.delete(clientId);
    setUserOffline(clientId);
  }

  const state = targetRoomName ? getRoomState(targetRoomName, clientId) : { roomInfo: null, users: [], messages: [] };

  return res.json({ ok: true, ...state });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

module.exports = app;
