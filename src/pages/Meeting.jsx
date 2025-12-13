import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import io from "socket.io-client";
const BASE_URL = import.meta.env.VITE_API_URL;

export default function Meeting() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // Refs
  const localVideo = useRef(null);
  const peerConnections = useRef({});
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  
  // State
  const [peers, setPeers] = useState({});
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [participants, setParticipants] = useState(1);
  const [connected, setConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [roomUsers, setRoomUsers] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");

  // Add log
  const addLog = useCallback((message) => {
    const timestamp = new Date().toLocaleTimeString();
    const log = `[${timestamp}] ${message}`;
    console.log(log);
    setLogs(prev => [...prev.slice(-20), log]);
  }, []);

  // WebRTC configuration
  const getRTCConfig = useCallback(() => ({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" }
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: "all"
  }), []);

  // Initialize socket connection
  const connectSocket = useCallback(() => {
    addLog("🔗 Connecting to server...");
    setConnectionStatus("connecting");
    
    socketRef.current = io(BASE_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      forceNew: true
    });
    
    const socket = socketRef.current;
    
    // Socket events
    socket.on("connect", () => {
      addLog(`✅ Socket connected: ${socket.id}`);
      setConnected(true);
      setConnectionStatus("connected");
      reconnectAttempts.current = 0;
      
      // Get user media and join room
      initMedia();
    });
    
    socket.on("connect_error", (err) => {
      addLog(`❌ Connection error: ${err.message}`);
      setConnectionStatus("error");
    });
    
    socket.on("disconnect", (reason) => {
      addLog(`⚠️ Disconnected: ${reason}`);
      setConnected(false);
      setConnectionStatus("disconnected");
      
      if (reason === "io server disconnect" || reason === "transport close") {
        addLog("🔄 Server disconnected, attempting to reconnect...");
        setTimeout(() => {
          if (reconnectAttempts.current < maxReconnectAttempts) {
            reconnectAttempts.current++;
            connectSocket();
          }
        }, 2000);
      }
    });
    
    socket.on("reconnect", (attemptNumber) => {
      addLog(`🔄 Reconnected (attempt ${attemptNumber})`);
      setConnectionStatus("reconnecting");
    });
    
    socket.on("reconnect_attempt", (attemptNumber) => {
      addLog(`🔄 Reconnection attempt ${attemptNumber}`);
      setConnectionStatus("reconnecting");
    });
    
    socket.on("reconnect_failed", () => {
      addLog("❌ Reconnection failed");
      setConnectionStatus("failed");
      alert("Connection to server lost. Please refresh the page.");
    });
    
    socket.on("error", (error) => {
      addLog(`❌ Socket error: ${error.message || error}`);
    });
    
    socket.on("pong", (data) => {
      // Keep connection alive
      console.log("Pong received", data);
    });
    
    // Existing users in room
    socket.on("existing-users", (userIds) => {
      addLog(`👥 Found ${userIds.length} existing user(s)`);
      setRoomUsers(userIds);
      
      userIds.forEach(userId => {
        if (userId !== socket.id && !peerConnections.current[userId]) {
          createPeerConnection(userId, true);
        }
      });
    });
    
    // New user joined
    socket.on("user-joined", (newUserId) => {
      addLog(`🆕 New user joined: ${newUserId}`);
      setRoomUsers(prev => [...prev, newUserId]);
      
      if (newUserId !== socket.id && !peerConnections.current[newUserId]) {
        createPeerConnection(newUserId, true);
      }
    });
    
    // User ready
    socket.on("user-ready", (userId) => {
      addLog(`✅ User ready: ${userId}`);
      
      if (userId !== socket.id && !peerConnections.current[userId]) {
        createPeerConnection(userId, true);
      }
    });
    
    // Room info
    socket.on("room-info", ({ users, yourId }) => {
      addLog(`📊 Room info: ${users.length} users, your ID: ${yourId}`);
      setRoomUsers(users.filter(id => id !== yourId));
    });
    
    // WebRTC offer
    socket.on("offer", async ({ offer, from }) => {
      addLog(`📨 Received OFFER from ${from}`);
      
      try {
        let pc = peerConnections.current[from];
        if (!pc) {
          pc = createPeerConnection(from, false);
        }
        
        if (!pc) {
          addLog(`❌ No peer connection for ${from}`);
          return;
        }
        
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        addLog(`✅ Set remote description from ${from}`);
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit("answer", {
          answer: pc.localDescription,
          to: from
        });
        
        addLog(`📤 Sent ANSWER to ${from}`);
      } catch (err) {
        addLog(`❌ Error handling offer: ${err.message}`);
      }
    });
    
    // WebRTC answer
    socket.on("answer", async ({ answer, from }) => {
      addLog(`📨 Received ANSWER from ${from}`);
      
      try {
        const pc = peerConnections.current[from];
        if (pc && pc.signalingState !== 'stable') {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          addLog(`✅ Set answer from ${from}`);
        }
      } catch (err) {
        addLog(`❌ Error handling answer: ${err.message}`);
      }
    });
    
    // ICE candidates
    socket.on("ice-candidate", async ({ candidate, from }) => {
      addLog(`🧊 Received ICE candidate from ${from}`);
      
      try {
        const pc = peerConnections.current[from];
        if (pc && candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          addLog(`✅ Added ICE candidate from ${from}`);
        }
      } catch (err) {
        addLog(`❌ Error adding ICE candidate: ${err.message}`);
      }
    });
    
    // User left
    socket.on("user-left", (userId) => {
      addLog(`👋 User left: ${userId}`);
      
      // Close WebRTC connection
      if (peerConnections.current[userId]) {
        peerConnections.current[userId].close();
        delete peerConnections.current[userId];
      }
      
      // Remove from peers
      setPeers(prev => {
        const newPeers = { ...prev };
        delete newPeers[userId];
        return newPeers;
      });
      
      // Remove from room users
      setRoomUsers(prev => prev.filter(id => id !== userId));
    });
  }, [id, addLog]);

  // Get user media
  const initMedia = useCallback(async () => {
    try {
      addLog("🎥 Requesting camera and microphone...");
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      
      localStreamRef.current = stream;
      if (localVideo.current) {
        localVideo.current.srcObject = stream;
        localVideo.current.muted = true;
      }
      
      addLog("✅ Got camera and microphone");
      
      // Join room
      if (socketRef.current) {
        socketRef.current.emit("join-room", id);
        addLog(`📤 Joined room: ${id}`);
        
        // Notify we're ready
        setTimeout(() => {
          socketRef.current.emit("user-ready");
          addLog("✅ Notified server we're ready");
        }, 1500);
      }
      
    } catch (err) {
      addLog(`❌ Media error: ${err.message}`);
      alert("Camera and microphone access required for video call.");
      navigate("/");
    } finally {
      setIsLoading(false);
    }
  }, [id, navigate, addLog]);

  // Create peer connection
  const createPeerConnection = useCallback((userId, isInitiator = false) => {
    addLog(`Creating peer connection with ${userId} (initiator: ${isInitiator})`);
    
    // Don't create duplicate connections
    if (peerConnections.current[userId]) {
      addLog(`⚠️ Peer connection already exists for ${userId}`);
      return peerConnections.current[userId];
    }
    
    try {
      const pc = new RTCPeerConnection(getRTCConfig());
      peerConnections.current[userId] = pc;
      
      // Add local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          if (track.kind === 'video' && cameraOff) return;
          if (track.kind === 'audio' && muted) return;
          
          addLog(`Adding local ${track.kind} track to ${userId}`);
          pc.addTrack(track, localStreamRef.current);
        });
      }
      
      // Handle remote stream
      pc.ontrack = (event) => {
        addLog(`🎬 Received remote stream from ${userId}`);
        
        if (event.streams && event.streams[0]) {
          setPeers(prev => {
            const newPeers = { ...prev };
            newPeers[userId] = event.streams[0];
            return newPeers;
          });
        }
      };
      
      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit("ice-candidate", {
            candidate: event.candidate,
            to: userId
          });
        }
      };
      
      // Handle connection state
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        addLog(`ICE state with ${userId}: ${state}`);
        
        if (state === 'connected') {
          addLog(`✅ Successfully connected to ${userId}`);
        } else if (state === 'failed' || state === 'disconnected') {
          addLog(`⚠️ Connection issue with ${userId}: ${state}`);
          
          // Try to restart ICE
          if (state === 'failed') {
            setTimeout(() => {
              if (pc.restartIce) {
                pc.restartIce();
                addLog(`🔄 Restarting ICE with ${userId}`);
              }
            }, 2000);
          }
        } else if (state === 'closed') {
          delete peerConnections.current[userId];
          setPeers(prev => {
            const newPeers = { ...prev };
            delete newPeers[userId];
            return newPeers;
          });
        }
      };
      
      // Create offer if initiator
      if (isInitiator) {
        setTimeout(async () => {
          try {
            addLog(`Creating offer for ${userId}...`);
            
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true
            });
            
            await pc.setLocalDescription(offer);
            
            socketRef.current.emit("offer", {
              offer: pc.localDescription,
              to: userId
            });
            
            addLog(`📤 Sent offer to ${userId}`);
          } catch (err) {
            addLog(`❌ Error creating offer: ${err.message}`);
          }
        }, 2000);
      }
      
      return pc;
    } catch (err) {
      addLog(`❌ Error creating peer connection: ${err.message}`);
      return null;
    }
  }, [addLog, getRTCConfig, cameraOff, muted]);

  // Initialize
  useEffect(() => {
    addLog(`=== Starting meeting room: ${id} ===`);
    
    // Connect socket
    connectSocket();
    
    // Ping server every 30 seconds to keep connection alive
    const pingInterval = setInterval(() => {
      if (socketRef.current?.connected) {
        socketRef.current.emit("ping");
      }
    }, 30000);
    
    // Cleanup
    return () => {
      addLog("🧹 Cleaning up...");
      clearInterval(pingInterval);
      
      // Close all peer connections
      Object.values(peerConnections.current).forEach(pc => {
        if (pc) {
          pc.close();
        }
      });
      peerConnections.current = {};
      
      // Stop media
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      // Disconnect socket
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      
      setPeers({});
    };
  }, [id, connectSocket, addLog]);

  // Toggle mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setMuted(!muted);
      addLog(muted ? "🔊 Unmuted microphone" : "🔇 Muted microphone");
    }
  };
  
  // Toggle camera
  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setCameraOff(!cameraOff);
      addLog(cameraOff ? "📷 Turned camera ON" : "📷❌ Turned camera OFF");
    }
  };
  
  // Debug info
  const debugInfo = () => {
    console.log("=== DEBUG INFO ===");
    console.log("Socket ID:", socketRef.current?.id);
    console.log("Connected:", connected);
    console.log("Connection Status:", connectionStatus);
    console.log("Local Stream:", localStreamRef.current);
    console.log("Room Users:", roomUsers);
    console.log("Peer Connections:", Object.keys(peerConnections.current));
    console.log("Peers:", Object.keys(peers));
    console.log("==================");
  };
  
  // Reconnect manually
  const reconnect = () => {
    addLog("🔄 Manual reconnection requested");
    reconnectAttempts.current = 0;
    
    // Close existing socket
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    
    // Reconnect
    setTimeout(() => {
      connectSocket();
    }, 500);
  };
  
  // Refresh page
  const refreshPage = () => {
    window.location.reload();
  };
  
  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div className="text-white">
            <h1 className="text-2xl font-bold">Video Meeting</h1>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-gray-300">Room:</span>
              <span className="bg-gray-800 px-3 py-1 rounded-lg font-mono">{id}</span>
              
            </div>
          </div>
          
         
        </div>
        
       
        
       
        {/* Video Grid */}
        {!isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
            {/* Local video */}
            <div className="relative rounded-xl overflow-hidden bg-black border-2 border-blue-500">
              <video 
                ref={localVideo} 
                autoPlay 
                muted 
                playsInline
                className="w-full h-64 object-cover"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                <p className="text-white font-medium truncate flex items-center gap-2">
                  You (Me)
                  {muted && <span className="bg-red-600 px-2 py-1 rounded text-xs">MUTED</span>}
                  {cameraOff && <span className="bg-red-600 px-2 py-1 rounded text-xs">CAMERA OFF</span>}
                </p>
              </div>
              {cameraOff && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                  <div className="text-center">
                    <span className="text-white text-4xl mb-2 block">📷❌</span>
                    <p className="text-white">Camera is off</p>
                  </div>
                </div>
              )}
            </div>
            
            {/* Remote videos */}
            {Object.entries(peers).map(([userId, stream]) => (
              <div key={userId} className="relative rounded-xl overflow-hidden bg-black border-2 border-gray-700">
                <video
                  autoPlay
                  playsInline
                  className="w-full h-64 object-cover"
                  ref={el => {
                    if (el && stream) {
                      el.srcObject = stream;
                    }
                  }}
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                  <p className="text-white font-medium truncate">
                    User {userId.slice(-4)}
                  </p>
                </div>
              </div>
            ))}
            
            {/* No connections yet */}
            {connected && roomUsers.length > 0 && Object.keys(peers).length === 0 && (
              <div className="col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-3">
                <div className="h-64 rounded-xl bg-gray-800/50 border-2 border-dashed border-gray-600 flex flex-col items-center justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
                  <p className="text-gray-400 text-center mb-2">
                    Connecting to {roomUsers.length} participant{roomUsers.length > 1 ? 's' : ''}...
                  </p>
                  <p className="text-gray-500 text-sm text-center">
                    Establishing WebRTC connection
                  </p>
                </div>
              </div>
            )}
            
            {/* No other participants */}
            {connected && roomUsers.length === 0 && Object.keys(peers).length === 0 && (
              <div className="col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-3">
                <div className="h-64 rounded-xl bg-gray-800/50 border-2 border-dashed border-gray-600 flex flex-col items-center justify-center">
                  <span className="text-4xl mb-4">👤</span>
                  <p className="text-gray-400 text-center mb-2">
                    You're the only one here
                  </p>
                  <p className="text-gray-500 text-sm text-center">
                    Share this room ID: <code className="bg-gray-700 px-2 py-1 rounded">{id}</code>
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Controls */}
        {!isLoading && (
          <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 flex gap-3 bg-gray-800/90 backdrop-blur-lg px-5 py-3 rounded-2xl shadow-xl z-50">
            <button 
              onClick={toggleMute}
              disabled={!connected}
              className={`px-4 py-3 rounded-xl flex flex-col items-center justify-center transition-all ${
                !connected ? 'bg-gray-800 cursor-not-allowed' :
                muted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
              }`}
              title={muted ? "Unmute microphone" : "Mute microphone"}
            >
              <span className="text-white text-xl">{muted ? '🔇' : '🎤'}</span>
              <span className="text-white text-xs mt-1">{muted ? 'Unmute' : 'Mute'}</span>
            </button>
            
            <button 
              onClick={toggleCamera}
              disabled={!connected}
              className={`px-4 py-3 rounded-xl flex flex-col items-center justify-center transition-all ${
                !connected ? 'bg-gray-800 cursor-not-allowed' :
                cameraOff ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
              }`}
              title={cameraOff ? "Turn camera on" : "Turn camera off"}
            >
              <span className="text-white text-xl">{cameraOff ? '📷❌' : '📷'}</span>
              <span className="text-white text-xs mt-1">{cameraOff ? 'Camera On' : 'Camera Off'}</span>
            </button>
            
            <div className="w-px bg-gray-600 mx-1"></div>
            
            <button 
              onClick={() => {
                if (window.confirm("Leave the meeting?")) {
                  navigate("/");
                }
              }}
              className="px-4 py-3 rounded-xl flex flex-col items-center justify-center bg-red-600 hover:bg-red-700 transition-all"
              title="Leave meeting"
            >
              <span className="text-white text-xl">📞</span>
              <span className="text-white text-xs mt-1">Leave</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}