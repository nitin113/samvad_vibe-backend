require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const authRoutes = require("./routes/auth");
const Message = require("./models/Message");
const User = require("./models/User");

const DEFAULT_MAX_MEMBERS = 5;
const MAX_ROOM_CAPACITY = 10;

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

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const rooms = new Map();
const users = {};

const isMongoReady = () => mongoose.connection.readyState === 1;

const persistUser = async (socketId, username, roomName, roomType, isAdmin) => {
  if (!isMongoReady()) {
    return;
  }

  try {
    await User.findOneAndUpdate(
      { socketId },
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

const setUserOffline = async (socketId) => {
  if (!isMongoReady()) {
    return;
  }

  try {
    await User.findOneAndUpdate(
      { socketId },
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

const getOnlineUsersInRoom = (roomName) => {
  return Object.entries(users)
    .filter(([, user]) => user.roomName === roomName)
    .map(([, user]) => user.username);
};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join", (payload = {}) => {
    const username = String(payload.username || "").trim();
    const roomName = String(payload.roomName || "").trim();
    const roomType = payload.roomType === "private" ? "private" : "public";
    const requestedMaxMembers = Number(payload.maxMembers) || DEFAULT_MAX_MEMBERS;
    const maxMembers = Math.min(Math.max(requestedMaxMembers, 1), MAX_ROOM_CAPACITY);
    const isAdmin = Boolean(payload.isAdmin);

    if (!username || !roomName) {
      socket.emit("joinError", "Username and room name are required.");
      return;
    }

    let room = rooms.get(roomName);

    if (!room) {
      room = {
        name: roomName,
        type: roomType,
        maxMembers,
        adminSocketId: socket.id,
        adminUsername: username,
        members: new Set([socket.id]),
      };

      rooms.set(roomName, room);
      users[socket.id] = { username, roomName };
      socket.join(roomName);
      persistUser(socket.id, username, roomName, roomType, true);

      io.to(roomName).emit("onlineUsers", getOnlineUsersInRoom(roomName));
      socket.emit("joinAccepted", {
        roomName,
        roomType: room.type,
        maxMembers: room.maxMembers,
        isAdmin: true,
        adminName: room.adminUsername,
      });
      io.to(roomName).emit("receiveMessage", {
        username: "System",
        message: `${username} created the ${room.type} room "${roomName}" and joined as admin.`,
      });
      return;
    }

    if (room.members.has(socket.id)) {
      socket.join(roomName);
      socket.emit("joinAccepted", {
        roomName,
        roomType: room.type,
        maxMembers: room.maxMembers,
        isAdmin: socket.id === room.adminSocketId,
        adminName: room.adminUsername,
      });
      return;
    }

    if (room.members.size >= room.maxMembers) {
      socket.emit(
        "joinError",
        `Room is full. Maximum ${room.maxMembers} member(s) allowed.`
      );
      return;
    }

    room.members.add(socket.id);
    users[socket.id] = { username, roomName };
    socket.join(roomName);
    persistUser(socket.id, username, roomName, room.type, false);

    io.to(roomName).emit("onlineUsers", getOnlineUsersInRoom(roomName));
    socket.emit("joinAccepted", {
      roomName,
      roomType: room.type,
      maxMembers: room.maxMembers,
      isAdmin: false,
      adminName: room.adminUsername,
    });
    io.to(roomName).emit("receiveMessage", {
      username: "System",
      message: `${username} joined the ${room.type} room "${roomName}".`,
    });
  });

  socket.on("sendMessage", (data) => {
    const roomInfo = users[socket.id];
    const message = String(data?.message || "").trim();
    const sender = roomInfo?.username || "User";

    if (!roomInfo || !message) {
      return;
    }

    persistMessage(sender, roomInfo.roomName, message);

    io.to(roomInfo.roomName).emit("receiveMessage", {
      username: sender,
      message,
    });
  });

  socket.on("leaveRoom", () => {
    const leavingUser = users[socket.id];

    if (!leavingUser) {
      return;
    }

    const room = rooms.get(leavingUser.roomName);

    if (room) {
      room.members.delete(socket.id);

      if (room.adminSocketId === socket.id) {
        const nextAdmin = Array.from(room.members)[0] || null;
        room.adminSocketId = nextAdmin;
        room.adminUsername = nextAdmin ? users[nextAdmin]?.username || null : null;
      }

      if (room.members.size === 0) {
        rooms.delete(leavingUser.roomName);
      }
    }

    delete users[socket.id];
    setUserOffline(socket.id);

    if (room && room.members.size > 0) {
      io.to(room.name).emit("onlineUsers", getOnlineUsersInRoom(room.name));
      io.to(room.name).emit("receiveMessage", {
        username: "System",
        message: `${leavingUser.username} left the room.`,
      });
    }

    socket.leave(leavingUser.roomName);
    socket.emit("leaveRoomSuccess");
  });

  socket.on("disconnect", () => {
    const leavingUser = users[socket.id];

    if (!leavingUser) {
      return;
    }

    const room = rooms.get(leavingUser.roomName);

    if (room) {
      room.members.delete(socket.id);

      if (room.adminSocketId === socket.id) {
        const nextAdmin = Array.from(room.members)[0] || null;
        room.adminSocketId = nextAdmin;
        room.adminUsername = nextAdmin ? users[nextAdmin]?.username || null : null;
      }

      if (room.members.size === 0) {
        rooms.delete(leavingUser.roomName);
      }
    }

    delete users[socket.id];
    setUserOffline(socket.id);

    if (room && room.members.size > 0) {
      io.to(room.name).emit("onlineUsers", getOnlineUsersInRoom(room.name));
      io.to(room.name).emit("receiveMessage", {
        username: "System",
        message: `${leavingUser.username} left the room.`,
      });
    }
  });
});

server.listen(5000, () => {
  console.log("Server is running on port 5000");
});
