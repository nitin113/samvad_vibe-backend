import React, { useState, useEffect } from "react";
import { io } from "socket.io-client";
import './App.css';

const getSocketUrl = () => {
  if (process.env.REACT_APP_SOCKET_URL) {
    return process.env.REACT_APP_SOCKET_URL;
  }

  if (window.location.hostname === "localhost") {
    return `${window.location.protocol}//${window.location.hostname}:5000`;
  }

  return window.location.origin;
};

const socket = io(getSocketUrl(), {
  transports: ["websocket", "polling"],
});

const CHAT_COLORS = [
  "linear-gradient(135deg, #10b981, #14b8a6)",
  "linear-gradient(135deg, #f59e0b, #ef4444)",
  "linear-gradient(135deg, #8b5cf6, #ec4899)",
  "linear-gradient(135deg, #38bdf8, #3b82f6)",
  "linear-gradient(135deg, #f97316, #facc15)",
  "linear-gradient(135deg, #84cc16, #22c55e)"
];

const getUserBubbleColor = (username) => {
  if (!username) {
    return CHAT_COLORS[0];
  }

  let hash = 0;
  for (let i = 0; i < username.length; i += 1) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }

  const colorIndex = Math.abs(hash) % CHAT_COLORS.length;
  return CHAT_COLORS[colorIndex];
};

function App() {
  const [username, setUsername] = useState("");
  const [roomName, setRoomName] = useState("general");
  const [roomType, setRoomType] = useState("public");
  const [maxMembers, setMaxMembers] = useState(5);
  const [isAdmin, setIsAdmin] = useState(false);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [users, setUsers] = useState([]);
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [socketError, setSocketError] = useState("");
  const [roomInfo, setRoomInfo] = useState({
    roomName: "",
    roomType: "public",
    maxMembers: 5,
    isAdmin: false,
    adminName: "",
  });

  useEffect(() => {
    socket.on("receiveMessage", (data) => {
      setChat((prev) => [...prev, data]);
    });

    socket.on("onlineUsers", (activeUsers) => {
      setUsers(activeUsers);
    });

    socket.on("joinAccepted", ({ roomName, roomType, maxMembers, isAdmin, adminName }) => {
      setRoomInfo({ roomName, roomType, maxMembers, isAdmin, adminName });
      setJoined(true);
      setJoinError("");
    });

    socket.on("joinError", (errorMessage) => {
      setJoinError(errorMessage);
      setJoined(false);
    });

    socket.on("connect", () => {
      setSocketError("");
    });

    socket.on("connect_error", () => {
      setSocketError(
        "Backend connection failed. Please set REACT_APP_SOCKET_URL to your deployed backend URL."
      );
      setJoinError("Unable to connect to the chat server. Please try again later.");
      setJoined(false);
    });

    return () => {
      socket.off("receiveMessage");
      socket.off("onlineUsers");
      socket.off("joinAccepted");
      socket.off("joinError");
      socket.off("connect");
      socket.off("connect_error");
    };
  }, []);

  const joinChat = () => {
    const trimmedUsername = username.trim();
    const trimmedRoomName = roomName.trim() || "general";

    if (!trimmedUsername) {
      setJoinError("Username is required.");
      return;
    }

    socket.emit("join", {
      username: trimmedUsername,
      roomName: trimmedRoomName,
      roomType,
      maxMembers,
      isAdmin,
    });
  };

  const sendMessage = () => {
    if (message.trim()) {
      const msgData = { username, message: message.trim() };
      socket.emit("sendMessage", msgData);
      setMessage("");
    }
  };

  const leaveRoom = () => {
    socket.emit("leaveRoom");
    setJoined(false);
    setChat([]);
    setUsers([]);
    setMessage("");
    setJoinError("");
    setRoomInfo({
      roomName: "",
      roomType: "public",
      maxMembers: 5,
      isAdmin: false,
      adminName: "",
    });
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      if (!joined) {
        joinChat();
      } else {
        sendMessage();
      }
    }
  };

  if (!joined) {
    return (
      <div className="app-shell">
        <div className="auth-card">
          <div className="brand-block">
            <div className="brand-badge">Live</div>
            <h1>Samvad_Vibe</h1>
            <p>Choose a public or private room, set the member limit, and manage the room as an admin.</p>
          </div>

          <div className="input-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your name"
            />

            <label htmlFor="roomName">Room name</label>
            <input
              id="roomName"
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter room name"
            />

            <label htmlFor="roomType">Room type</label>
            <select
              id="roomType"
              className="select-input"
              value={roomType}
              onChange={(e) => setRoomType(e.target.value)}
            >
              <option value="public">Public room</option>
              <option value="private">Private room</option>
            </select>

            <label htmlFor="maxMembers">Maximum members</label>
            <input
              id="maxMembers"
              type="number"
              min="1"
              max="10"
              value={maxMembers}
              onChange={(e) => setMaxMembers(Math.min(Math.max(Number(e.target.value) || 1, 1), 10))}
            />

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
              />
              <span>I am the admin</span>
            </label>

            <button onClick={joinChat}>Join room</button>
            {socketError && <div className="error-banner">{socketError}</div>}
            {joinError && <div className="error-banner">{joinError}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell chat-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <p className="eyebrow">Workspace</p>
            <h2>Samvad_Vibe</h2>
          </div>
          <span className="online-pill">{users.length} online</span>
        </div>

        <div className="users-panel">
          <h3>Room Details</h3>
          <div className="room-meta">
            <p><strong>Room Name:</strong> {roomInfo.roomName}</p>
            <p><strong>Admin:</strong> {roomInfo.adminName || "Not assigned"}</p>
            <p><strong>Type:</strong> {roomInfo.roomType}</p>
            <p><strong>Members:</strong> {roomInfo.maxMembers}</p>
            <p><strong>Role:</strong> {roomInfo.isAdmin ? "Admin" : "Member"}</p>
          </div>
        </div>

        <div className="users-panel">
          <h3>Online Users</h3>
          <div className="users-list">
            {users.length ? (
              users.map((user, i) => (
                <div key={i} className="user-row">
                  <span className="user-dot" />
                  <span>{user}</span>
                </div>
              ))
            ) : (
              <p className="empty-text">No one else is online yet.</p>
            )}
          </div>
        </div>
      </aside>

      <main className="chat-panel">
        <header className="chat-header">
          <div>
            <p className="eyebrow">Room</p>
            <h3>{username}</h3>
          </div>
          <button className="leave-room-btn" onClick={leaveRoom}>Leave room</button>
        </header>

        <div className="messages-box">
          {chat.length ? (
            chat.map((msg, i) => {
              const isSelf = msg.username === username;

              return (
                <div
                  key={i}
                  className={`message-bubble ${isSelf ? "self" : "other"}`}
                  style={isSelf ? undefined : { background: getUserBubbleColor(msg.username) }}
                >
                  <div className="message-meta">
                    <span>{msg.username}</span>
                  </div>
                  <p>{msg.message}</p>
                </div>
              );
            })
          ) : (
            <div className="empty-chat">
              <p>No messages yet. Say hello to start the conversation.</p>
            </div>
          )}
        </div>

        <div className="composer">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
          />
          <button onClick={sendMessage}>Send</button>
        </div>
      </main>
    </div>
  );
}

export default App;
