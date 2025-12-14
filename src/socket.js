const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store active rooms
const rooms = {};

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join a room
  socket.on("join-room", (roomId) => {
    try {
      // Join the room
      socket.join(roomId);
      
      // Initialize room if it doesn't exist
      if (!rooms[roomId]) {
        rooms[roomId] = {
          users: []
        };
      }
      
      // Add user to room
      if (!rooms[roomId].users.includes(socket.id)) {
        rooms[roomId].users.push(socket.id);
      }
      
      console.log(`User ${socket.id} joined room ${roomId}`);
      console.log(`Room ${roomId} users:`, rooms[roomId].users);
      
      // Get all other users in the room
      const otherUsers = rooms[roomId].users.filter(id => id !== socket.id);
      
      // Send existing users to the new user
      socket.emit("existing-users", otherUsers);
      
      // Notify other users about the new user
      socket.to(roomId).emit("user-joined", socket.id);
      
    } catch (error) {
      console.error("Error joining room:", error);
      socket.emit("error", { message: "Failed to join room" });
    }
  });

  // Handle WebRTC signaling
  socket.on("signal", (data) => {
    try {
      console.log(`Signal from ${socket.id} to ${data.to}:`, data.signal.type || "candidate");
      
      // Forward the signal to the target user
      io.to(data.to).emit("signal", {
        from: socket.id,
        signal: data.signal
      });
    } catch (error) {
      console.error("Error handling signal:", error);
    }
  });

  // Handle user leaving
  socket.on("leave-room", (roomId) => {
    try {
      leaveRoom(socket, roomId);
    } catch (error) {
      console.error("Error leaving room:", error);
    }
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    try {
      console.log(`User disconnected: ${socket.id}`);
      
      // Remove user from all rooms
      Object.keys(rooms).forEach(roomId => {
        if (rooms[roomId].users.includes(socket.id)) {
          leaveRoom(socket, roomId);
        }
      });
    } catch (error) {
      console.error("Error during disconnect:", error);
    }
  });
});

function leaveRoom(socket, roomId) {
  try {
    if (rooms[roomId]) {
      // Remove user from room
      rooms[roomId].users = rooms[roomId].users.filter(id => id !== socket.id);
      
      // Notify other users
      socket.to(roomId).emit("user-left", socket.id);
      console.log(`User ${socket.id} left room ${roomId}`);
      
      // Clean up empty rooms
      if (rooms[roomId].users.length === 0) {
        delete rooms[roomId];
        console.log(`Room ${roomId} deleted (empty)`);
      }
    }
    
    // Leave the socket room
    socket.leave(roomId);
    
  } catch (error) {
    console.error("Error in leaveRoom:", error);
  }
}

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    activeRooms: Object.keys(rooms).length,
    rooms: rooms
  });
});

// Get room info
app.get("/rooms", (req, res) => {
  res.json(rooms);
});

server.listen(5000, () => {
  console.log("✅ Signaling server running on port 5000");
  console.log("📡 WebSocket server ready for connections");
});