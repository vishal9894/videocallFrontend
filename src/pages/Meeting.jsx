import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import io from "socket.io-client";
const BASE_URL = import.meta.env.VITE_API_URL;


export default function Meeting() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // Refs
  const localVideo = useRef(null);
  const localStream = useRef(null);
  const peerConnections = useRef({});
  const socketRef = useRef(null);
  const screenStreamRef = useRef(null);
  
  // State
  const [peers, setPeers] = useState({});
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [participants, setParticipants] = useState(1);
  const [connected, setConnected] = useState(false);
  const [roomUsers, setRoomUsers] = useState([]);
  const [mediaError, setMediaError] = useState(null);
  const [hasMedia, setHasMedia] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // WebRTC Configuration
  const pcConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" }
    ],
    iceCandidatePoolSize: 10
  };

  // Initialize socket and media
  useEffect(() => {
    console.log("🎬 Initializing meeting room:", id);
    setIsLoading(true);
    
    // Initialize socket first (don't wait for media)
    socketRef.current = io( BASE_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5
    });
    
    const socket = socketRef.current;
    
    // Socket event handlers
    socket.on("connect", () => {
      console.log("✅ Socket connected:", socket.id);
      setConnected(true);
      
      // Join room immediately
      socket.emit("join-room", id);
    });
    
    socket.on("connect_error", (err) => {
      console.error("❌ Socket connection error:", err);
      setConnected(false);
      setMediaError("Cannot connect to server. Please check your internet connection.");
    });
    
    // Get user media - with permission handling
    const initMedia = async () => {
      try {
        console.log("🎥 Requesting user media...");
        setMediaError(null);
        
        // Try to get audio and video
        let stream;
        
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 30 }
            },
            audio: {
              echoCancellation: true,
              noiseSuppression: true
            }
          });
        } catch (videoAudioError) {
          console.log("Video+audio failed, trying audio only...", videoAudioError);
          
          // Try audio only
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: false
            });
            setCameraOff(true); // Mark camera as off since we don't have video
            setMediaError("Camera access denied. Using audio only.");
          } catch (audioOnlyError) {
            console.log("Audio only failed, trying video only...", audioOnlyError);
            
            // Try video only
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
              });
              setMuted(true); // Mark audio as muted since we don't have mic
              setMediaError("Microphone access denied. Using video only.");
            } catch (videoOnlyError) {
              console.log("Video only failed, no media available...", videoOnlyError);
              
              // No media available - create a dummy stream with black video and silent audio
              stream = await createDummyStream();
              setCameraOff(true);
              setMuted(true);
              setMediaError("Camera and microphone access denied. You can still join and listen.");
            }
          }
        }
        
        // Successfully got some media
        localStream.current = stream;
        
        if (localVideo.current) {
          localVideo.current.srcObject = stream;
          localVideo.current.muted = true; // Always mute local video
          localVideo.current.volume = 0; // Set volume to 0
        }
        
        setHasMedia(true);
        console.log("✅ Media obtained:", 
          stream.getVideoTracks().length > 0 ? "Video" : "No Video",
          stream.getAudioTracks().length > 0 ? "Audio" : "No Audio"
        );
        
        // Notify that we're ready
        setTimeout(() => {
          socket.emit("ready", id);
          console.log("✅ Notified server we're ready");
        }, 1000);
        
      } catch (err) {
        console.error("❌ Critical media error:", err);
        setMediaError("Unable to access media devices. You can still join the meeting.");
        
        // Create dummy stream so we can still join
        try {
          const dummyStream = await createDummyStream();
          localStream.current = dummyStream;
          
          if (localVideo.current) {
            localVideo.current.srcObject = dummyStream;
            localVideo.current.muted = true;
          }
          
          setHasMedia(true);
          setCameraOff(true);
          setMuted(true);
        } catch (dummyErr) {
          console.error("❌ Cannot create dummy stream:", dummyErr);
          // User can still join without media
        }
      } finally {
        setIsLoading(false);
      }
    };
    
    // Handle existing users in room
    socket.on("existing-users", (userIds) => {
      console.log("👥 Existing users:", userIds);
      
      if (userIds.length > 0) {
        setRoomUsers(userIds);
        setParticipants(userIds.length + 1);
        
        // Create peer connection for each existing user
        userIds.forEach(userId => {
          if (userId !== socket.id && !peerConnections.current[userId]) {
            console.log(`Creating peer connection for existing user: ${userId}`);
            createPeerConnection(userId, true);
          }
        });
      }
    });
    
    // Handle new user joined
    socket.on("user-joined", (newUserId) => {
      console.log(`🆕 New user joined: ${newUserId}`);
      
      if (newUserId !== socket.id && !peerConnections.current[newUserId]) {
        console.log(`Creating peer connection for new user: ${newUserId}`);
        createPeerConnection(newUserId, true);
      }
      
      setRoomUsers(prev => [...prev, newUserId]);
      setParticipants(prev => prev + 1);
    });
    
    // Handle user ready
    socket.on("user-ready", (userId) => {
      console.log(`✅ User ready: ${userId}`);
      
      if (userId !== socket.id && !peerConnections.current[userId]) {
        console.log(`Creating peer connection for ready user: ${userId}`);
        createPeerConnection(userId, true);
      }
    });
    
    // Handle WebRTC offer
    socket.on("offer", async ({ offer, from }) => {
      console.log(`📨 Received offer from ${from}`);
      
      try {
        if (!peerConnections.current[from]) {
          console.log(`Creating peer connection for offer from: ${from}`);
          createPeerConnection(from, false);
        }
        
        const pc = peerConnections.current[from];
        if (!pc) {
          console.error(`No peer connection for ${from}`);
          return;
        }
        
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        console.log(`✅ Set remote description from ${from}`);
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit("answer", {
          answer: pc.localDescription,
          to: from
        });
        
        console.log(`📤 Sent answer to ${from}`);
      } catch (err) {
        console.error("❌ Error handling offer:", err);
      }
    });
    
    // Handle WebRTC answer
    socket.on("answer", async ({ answer, from }) => {
      console.log(`📨 Received answer from ${from}`);
      
      try {
        const pc = peerConnections.current[from];
        if (pc && pc.signalingState !== "stable") {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          console.log(`✅ Set remote description (answer) from ${from}`);
        }
      } catch (err) {
        console.error("❌ Error handling answer:", err);
      }
    });
    
    // Handle ICE candidates
    socket.on("ice-candidate", async ({ candidate, from }) => {
      console.log(`🧊 Received ICE candidate from ${from}`);
      
      try {
        const pc = peerConnections.current[from];
        if (pc && candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        console.error("❌ Error adding ICE candidate:", err);
      }
    });
    
    // Handle user left
    socket.on("user-left", (userId) => {
      console.log(`👋 User left: ${userId}`);
      
      if (peerConnections.current[userId]) {
        peerConnections.current[userId].close();
        delete peerConnections.current[userId];
      }
      
      setPeers(prev => {
        const newPeers = { ...prev };
        delete newPeers[userId];
        return newPeers;
      });
      
      setRoomUsers(prev => prev.filter(id => id !== userId));
      setParticipants(prev => Math.max(1, prev - 1));
    });
    
    // Start media initialization
    initMedia();
    
    // Cleanup
    return () => {
      console.log("🧹 Cleaning up...");
      
      // Close all peer connections
      Object.values(peerConnections.current).forEach(pc => {
        if (pc) pc.close();
      });
      peerConnections.current = {};
      
      // Stop media streams
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
      }
      
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      // Disconnect socket
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [id]);
  
  // Create a dummy media stream (for when permissions are denied)
  const createDummyStream = async () => {
    // Create a black video track
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const stream = canvas.captureStream(30);
    const videoTrack = stream.getVideoTracks()[0];
    
    // Create silent audio track
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const dst = oscillator.connect(audioContext.createMediaStreamDestination());
    oscillator.start();
    const audioTrack = dst.stream.getAudioTracks()[0];
    
    // Add silent audio track to stream
    stream.addTrack(audioTrack);
    
    // Stop the oscillator after a moment
    setTimeout(() => oscillator.stop(), 100);
    
    return stream;
  };
  
  // Create peer connection
  const createPeerConnection = (userId, isInitiator) => {
    console.log(`Creating peer connection with ${userId}, initiator: ${isInitiator}`);
    
    if (peerConnections.current[userId]) {
      console.log(`Peer connection already exists for ${userId}`);
      return peerConnections.current[userId];
    }
    
    try {
      const pc = new RTCPeerConnection(pcConfig);
      peerConnections.current[userId] = pc;
      
      // Add local tracks if we have them
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => {
          if (track.kind === 'video' && cameraOff) return; // Skip video if camera is off
          if (track.kind === 'audio' && muted) return; // Skip audio if muted
          
          console.log(`Adding local track: ${track.kind}`);
          pc.addTrack(track, localStream.current);
        });
      }
      
      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit("ice-candidate", {
            candidate: event.candidate,
            to: userId
          });
        }
      };
      
      // Handle remote stream
      pc.ontrack = (event) => {
        console.log(`🎬 Received remote track from ${userId}`);
        
        if (event.streams && event.streams[0]) {
          setPeers(prev => ({
            ...prev,
            [userId]: event.streams[0]
          }));
        }
      };
      
      // Handle connection state
      pc.oniceconnectionstatechange = () => {
        console.log(`ICE connection state with ${userId}: ${pc.iceConnectionState}`);
        
        if (pc.iceConnectionState === "failed" || 
            pc.iceConnectionState === "disconnected") {
          console.log(`Connection with ${userId} failed, attempting restart...`);
          
          // Try to restart ICE
          if (pc.restartIce) {
            pc.restartIce();
          }
        }
        
        if (pc.iceConnectionState === "closed") {
          if (peerConnections.current[userId]) {
            delete peerConnections.current[userId];
          }
          
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
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true
            });
            
            await pc.setLocalDescription(offer);
            
            socketRef.current.emit("offer", {
              offer: pc.localDescription,
              to: userId
            });
          } catch (err) {
            console.error("❌ Error creating offer:", err);
          }
        }, 1000);
      }
      
      return pc;
    } catch (err) {
      console.error("❌ Error creating peer connection:", err);
      return null;
    }
  };
  
  // Toggle mute
  const toggleMute = () => {
    if (localStream.current) {
      const audioTracks = localStream.current.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks.forEach(track => {
          track.enabled = !track.enabled;
        });
        setMuted(!muted);
      } else {
        // No audio track - show message
        setMediaError("No microphone available. You joined without audio.");
      }
    }
  };
  
  // Toggle camera
  const toggleCamera = () => {
    if (localStream.current) {
      const videoTracks = localStream.current.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks.forEach(track => {
          track.enabled = !track.enabled;
        });
        setCameraOff(!cameraOff);
      } else {
        // No video track - show message
        setMediaError("No camera available. You joined without video.");
      }
    }
  };
  
  // Request permissions again
  const requestPermissions = async () => {
    setIsLoading(true);
    setMediaError(null);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      // Replace old stream
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
      }
      
      localStream.current = stream;
      localVideo.current.srcObject = stream;
      
      setHasMedia(true);
      setCameraOff(false);
      setMuted(false);
      setMediaError(null);
      
      // Update tracks in all peer connections
      Object.values(peerConnections.current).forEach(pc => {
        const senders = pc.getSenders();
        
        // Update video track
        const videoSender = senders.find(s => s.track?.kind === "video");
        if (videoSender) {
          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack) {
            videoSender.replaceTrack(videoTrack);
          }
        }
        
        // Update audio track
        const audioSender = senders.find(s => s.track?.kind === "audio");
        if (audioSender) {
          const audioTrack = stream.getAudioTracks()[0];
          if (audioTrack) {
            audioSender.replaceTrack(audioTrack);
          }
        }
      });
      
    } catch (err) {
      console.error("❌ Permission request failed:", err);
      setMediaError("Permission denied. You can continue without camera/microphone.");
    } finally {
      setIsLoading(false);
    }
  };
  
  // Screen share
  const startScreenShare = async () => {
    try {
      if (sharingScreen) {
        // Stop screen sharing
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach(track => track.stop());
        }
        
        // Switch back to camera (if available)
        if (localStream.current) {
          localVideo.current.srcObject = localStream.current;
          
          Object.values(peerConnections.current).forEach(pc => {
            const senders = pc.getSenders();
            const videoSender = senders.find(s => s.track?.kind === "video");
            if (videoSender && localStream.current) {
              const videoTrack = localStream.current.getVideoTracks()[0];
              if (videoTrack) {
                videoSender.replaceTrack(videoTrack);
              }
            }
          });
        }
        
        setSharingScreen(false);
      } else {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true
        });
        
        screenStreamRef.current = screenStream;
        localVideo.current.srcObject = screenStream;
        setSharingScreen(true);
        
        Object.values(peerConnections.current).forEach(pc => {
          const senders = pc.getSenders();
          const videoSender = senders.find(s => s.track?.kind === "video");
          if (videoSender) {
            const screenTrack = screenStream.getVideoTracks()[0];
            if (screenTrack) {
              videoSender.replaceTrack(screenTrack);
            }
          }
        });
        
        screenStream.getVideoTracks()[0].onended = () => {
          if (sharingScreen) {
            startScreenShare();
          }
        };
      }
    } catch (err) {
      console.error("❌ Screen share error:", err);
      setMediaError("Screen sharing cancelled or not available.");
    }
  };
  
  // Copy meeting ID
  const copyMeetingId = () => {
    navigator.clipboard.writeText(id);
    alert("Meeting ID copied to clipboard!");
  };
  
  // Debug info
  const logDebugInfo = () => {
    console.log("=== DEBUG INFO ===");
    console.log("Socket ID:", socketRef.current?.id);
    console.log("Connected:", connected);
    console.log("Has Media:", hasMedia);
    console.log("Local Stream:", localStream.current);
    console.log("Room users:", roomUsers);
    console.log("Peer connections:", Object.keys(peerConnections.current));
    console.log("Peers:", Object.keys(peers));
    console.log("Media Error:", mediaError);
    console.log("===================");
  };
  
  // Leave meeting
  const leaveMeeting = () => {
    if (window.confirm("Leave the meeting?")) {
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div className="text-white">
            <h1 className="text-2xl font-bold">Video Meeting</h1>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-gray-300">Meeting ID:</span>
              <span className="bg-gray-800 px-3 py-1 rounded-lg font-mono">{id}</span>
              <button 
                onClick={copyMeetingId}
                className="ml-2 text-blue-400 hover:text-blue-300 hover:underline text-sm"
              >
                Copy
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-white bg-gray-800 px-4 py-2 rounded-lg">
              <span className="text-gray-300">Participants:</span>{" "}
              <span className="font-bold">{participants}</span>
            </div>
            <button 
              onClick={logDebugInfo}
              className="bg-gray-700 text-white px-4 py-2 rounded-lg hover:bg-gray-600 text-sm"
            >
              Debug
            </button>
          </div>
        </div>
        
        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-64 rounded-xl bg-gray-800/50 mb-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-gray-400">Setting up your meeting...</p>
            <p className="text-gray-500 text-sm mt-2">Please allow camera/microphone access if prompted</p>
          </div>
        )}
        
        {/* Media Permission Error */}
        {mediaError && !isLoading && (
          <div className="bg-yellow-900/50 border border-yellow-700 text-yellow-200 px-4 py-3 rounded-lg mb-4">
            <div className="flex items-start">
              <span className="mr-2 text-xl">⚠️</span>
              <div className="flex-1">
                <p className="font-medium">{mediaError}</p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={requestPermissions}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded text-sm"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={() => setMediaError(null)}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        
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
                  {sharingScreen && <span className="bg-green-600 px-2 py-1 rounded text-xs">SHARING</span>}
                </p>
              </div>
              {cameraOff && !sharingScreen && (
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
                    User {userId.slice(-6)}
                  </p>
                </div>
              </div>
            ))}
            
            {/* No other participants */}
            {roomUsers.length === 0 && Object.keys(peers).length === 0 && (
              <div className="col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-3">
                <div className="h-64 rounded-xl bg-gray-800/50 border-2 border-dashed border-gray-600 flex flex-col items-center justify-center">
                  <span className="text-4xl mb-4">👤</span>
                  <p className="text-gray-400 text-center mb-2">
                    You're the only one here
                  </p>
                  <p className="text-gray-500 text-sm text-center">
                    Share the meeting link with others
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
              className={`px-4 py-3 rounded-xl flex flex-col items-center justify-center transition-all ${muted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'}`}
              title={muted ? "Unmute microphone" : "Mute microphone"}
            >
              <span className="text-white text-xl">
                {muted ? '🔇' : '🎤'}
              </span>
              <span className="text-white text-xs mt-1">
                {muted ? 'Unmute' : 'Mute'}
              </span>
            </button>
            
            <button 
              onClick={toggleCamera}
              className={`px-4 py-3 rounded-xl flex flex-col items-center justify-center transition-all ${cameraOff ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'}`}
              title={cameraOff ? "Turn camera on" : "Turn camera off"}
            >
              <span className="text-white text-xl">
                {cameraOff ? '📷❌' : '📷'}
              </span>
              <span className="text-white text-xs mt-1">
                {cameraOff ? 'Camera On' : 'Camera Off'}
              </span>
            </button>
            
            <button 
              onClick={startScreenShare}
              className={`px-4 py-3 rounded-xl flex flex-col items-center justify-center transition-all ${sharingScreen ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'}`}
              title={sharingScreen ? "Stop screen sharing" : "Share screen"}
            >
              <span className="text-white text-xl">
                {sharingScreen ? '🖥️⏹️' : '🖥️'}
              </span>
              <span className="text-white text-xs mt-1">
                {sharingScreen ? 'Stop Share' : 'Share'}
              </span>
            </button>
            
            {!hasMedia && (
              <button 
                onClick={requestPermissions}
                className="px-4 py-3 rounded-xl flex flex-col items-center justify-center bg-yellow-600 hover:bg-yellow-700 transition-all"
                title="Request camera/microphone access"
              >
                <span className="text-white text-xl">
                  🔄
                </span>
                <span className="text-white text-xs mt-1">
                  Request Access
                </span>
              </button>
            )}
            
            <div className="w-px bg-gray-600 mx-1"></div>
            
            <button 
              onClick={leaveMeeting}
              className="px-4 py-3 rounded-xl flex flex-col items-center justify-center bg-red-600 hover:bg-red-700 transition-all"
              title="Leave meeting"
            >
              <span className="text-white text-xl">
                📞
              </span>
              <span className="text-white text-xs mt-1">
                Leave
              </span>
            </button>
          </div>
        )}
        
        {/* Connection Status */}
        {!connected && !isLoading && (
          <div className="fixed top-4 right-4 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg">
            Disconnected from server
          </div>
        )}
      </div>
    </div>
  );
}