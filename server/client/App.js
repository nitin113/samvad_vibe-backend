import React, { useState, useEffect } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:5000");

function App() {
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [users, setUsers] = useState([]);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    socket.on("receiveMessage", (data) => {
      setChat((prev) => [...prev, data]);
    });

    socket.on("onlineUsers", (users) => {
      setUsers(users);
    });
  }, []);

  const joinChat = () => {
    if (username) {
      socket.emit("join", username);
      setJoined(true);
    }
  };

  const sendMessage = () => {
    if (message) {
      const msgData = { username, message };
      socket.emit("sendMessage", msgData);
      setMessage("");
    }
  };

  if (!joined) {
    return (
      <div>
        <h2>Enter Username</h2>
        <input onChange={(e) => setUsername(e.target.value)} />
        <button onClick={joinChat}>Join</button>
      </div>
    );
  }

  return (
    <div>
      <h2>Chat App</h2>

      <div>
        <h3>Online Users</h3>
        {users.map((user, i) => (
          <p key={i}>{user}</p>
        ))}
      </div>

      <div style={{ border: "1px solid black", height: "300px", overflowY: "scroll" }}>
        {chat.map((msg, i) => (
          <p key={i}>
            <b>{msg.username}:</b> {msg.message}
          </p>
        ))}
      </div>

      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <button onClick={sendMessage}>Send</button>
    </div>
  );
}

export default App;