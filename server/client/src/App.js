import React, { useState, useEffect } from "react";
import './App.css';

const getApiBaseUrl = () => {
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }

  if (window.location.hostname === "localhost") {
    return `${window.location.protocol}//${window.location.hostname}:5000`;
  }

  return window.location.origin;
};

const API_BASE_URL = getApiBaseUrl();

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
  const [clientId, setClientId] = useState("");
  const [activeRoomName, setActiveRoomName] = useState("");
  const [roomInfo, setRoomInfo] = useState({
    roomName: "",
    roomType: "public",
    maxMembers: 5,
    isAdmin: false,
    adminName: "",
  });

  const resetRoomState = () => {
    setJoined(false);
    setChat([]);
    setUsers([]);
    setMessage("");
    setJoinError("");
    setSocketError("");
    setRoomInfo({
      roomName: "",
      roomType: "public",
      maxMembers: 5,
      isAdmin: false,
      adminName: "",
    });
    setActiveRoomName("");
  };

  useEffect(() => {
    if (!joined || !activeRoomName || !clientId) {
      return undefined;
    }

    let isMounted = true;

    const pollRoomState = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/chat/state?roomName=${encodeURIComponent(activeRoomName)}&clientId=${encodeURIComponent(clientId)}`
        );

        if (!response.ok) {
          throw new Error("Unable to refresh chat state.");
        }

        const data = await response.json();

        if (!isMounted) {
          return;
        }

        setUsers(data.users || []);
        setChat(data.messages || []);

        if (data.roomInfo) {
          setRoomInfo(data.roomInfo);
        }
      } catch (error) {
        if (isMounted) {
          setSocketError(error.message || "Unable to refresh chat state.");
        }
      }
    };

    pollRoomState();
    const intervalId = setInterval(pollRoomState, 1500);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [activeRoomName, clientId, joined]);

  const joinChat = async () => {
    const trimmedUsername = username.trim();
    const trimmedRoomName = roomName.trim() || "general";

    if (!trimmedUsername) {
      setJoinError("Username is required.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: trimmedUsername,
          roomName: trimmedRoomName,
          roomType,
          maxMembers,
          isAdmin,
          clientId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to join the room.");
      }

      setClientId(data.clientId);
      setActiveRoomName(trimmedRoomName);
      setRoomInfo(data.roomInfo || {
        roomName: trimmedRoomName,
        roomType,
        maxMembers,
        isAdmin: data.roomInfo?.isAdmin || false,
        adminName: data.roomInfo?.adminName || "",
      });
      setUsers(data.users || []);
      setChat(data.messages || []);
      setJoined(true);
      setJoinError("");
      setSocketError("");
    } catch (error) {
      setJoinError(error.message || "Unable to join the room.");
      setJoined(false);
    }
  };

  const sendMessage = async () => {
    if (!message.trim()) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId,
          roomName: activeRoomName,
          message: message.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to send message.");
      }

      setChat(data.messages || []);
      setUsers(data.users || []);
      setMessage("");
      setSocketError("");
    } catch (error) {
      setSocketError(error.message || "Unable to send message.");
    }
  };

  const leaveRoom = async () => {
    try {
      if (clientId && activeRoomName) {
        await fetch(`${API_BASE_URL}/api/chat/leave`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            clientId,
            roomName: activeRoomName,
          }),
        });
      }
    } catch (error) {
      setSocketError(error.message || "Unable to leave the room.");
    }

    setClientId("");
    resetRoomState();
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
