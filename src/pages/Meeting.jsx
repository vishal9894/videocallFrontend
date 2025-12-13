import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import io from "socket.io-client";
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Phone, 
  RefreshCw,
  Users,
  Copy,
  ScreenShare,
  Settings,
  User,
  ChevronLeft,
  Bell,
  Shield,
  Wifi,
  WifiOff,
  Volume2,
  Crown,
  Sparkles,
  Grid3x3,
  LayoutGrid
} from "lucide-react";

const BASE_URL = import.meta.env.VITE_API_URL;

export default function Meeting() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const localVideo = useRef(null);
  const remoteVideosRef = useRef({});
  const peerConnections = useRef({});
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  
  const [peers, setPeers] = useState({});
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [status, setStatus] = useState("connecting");
  const [participants, setParticipants] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showControls, setShowControls] = useState(true);
  const [activeSpeaker, setActiveSpeaker] = useState(null);
  const [videoLayout, setVideoLayout] = useState("grid"); // grid, sideBySide, spotlight

  // Detect mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-hide controls on mobile
  useEffect(() => {
    if (!isMobile) return;
    
    let timer;
    const resetTimer = () => {
      clearTimeout(timer);
      setShowControls(true);
      timer = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    };
    
    resetTimer();
    
    const events = ['mousedown', 'mousemove', 'touchstart', 'touchmove'];
    events.forEach(event => {
      window.addEventListener(event, resetTimer);
    });
    
    return () => {
      clearTimeout(timer);
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [isMobile]);

  // Initialize
  useEffect(() => {
    console.log("🎬 Starting meeting:", id);
    
    socketRef.current = io(BASE_URL, {
      transports: ["websocket"]
    });
    
    const socket = socketRef.current;
    
    socket.on("connect", async () => {
      console.log("✅ Connected:", socket.id);
      setStatus("connected");
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            width: { ideal: isMobile ? 640 : 1280 },
            height: { ideal: isMobile ? 480 : 720 },
            frameRate: { ideal: 24 },
            facingMode: "user"
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        
        localStreamRef.current = stream;
        if (localVideo.current) {
          localVideo.current.srcObject = stream;
          localVideo.current.muted = true;
        }
        
        socket.emit("join-room", id);
        
      } catch (err) {
        console.error("Media error:", err);
        alert("Please allow camera and microphone access.");
        navigate("/");
      }
    });
    
    socket.on("existing-users", (userIds) => {
      console.log("👥 Existing users:", userIds);
      setParticipants(userIds.length + 1);
      userIds.forEach(userId => createPeerConnection(userId, true));
    });
    
    socket.on("user-joined", (userId) => {
      console.log("🆕 New user:", userId);
      setParticipants(prev => prev + 1);
      createPeerConnection(userId, true);
    });
    
    socket.on("user-left", (userId) => {
      console.log("👋 User left:", userId);
      setParticipants(prev => Math.max(1, prev - 1));
      if (activeSpeaker === userId) setActiveSpeaker(null);
      if (peerConnections.current[userId]) {
        peerConnections.current[userId].close();
        delete peerConnections.current[userId];
      }
      setPeers(prev => {
        const newPeers = { ...prev };
        delete newPeers[userId];
        return newPeers;
      });
    });
    
    socket.on("signal", async (data) => {
      const { from, type, payload } = data;
      
      try {
        switch(type) {
          case "offer":
            let pc = peerConnections.current[from];
            if (!pc) pc = createPeerConnection(from, false);
            await pc.setRemoteDescription(payload);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("signal", {
              to: from,
              type: "answer",
              payload: pc.localDescription
            });
            break;
            
          case "answer":
            const pc2 = peerConnections.current[from];
            if (pc2) await pc2.setRemoteDescription(payload);
            break;
            
          case "candidate":
            const pc3 = peerConnections.current[from];
            if (pc3 && payload) await pc3.addIceCandidate(payload);
            break;
        }
      } catch (err) {
        console.warn("Signal error:", err);
      }
    });
    
    socket.on("disconnect", () => {
      setStatus("disconnected");
    });
    
    return () => {
      Object.values(peerConnections.current).forEach(pc => pc.close());
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [id, navigate, isMobile]);
  
  const createPeerConnection = (userId, isInitiator) => {
    if (peerConnections.current[userId]) {
      return peerConnections.current[userId];
    }
    
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" }
      ]
    });
    
    peerConnections.current[userId] = pc;
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }
    
    pc.ontrack = (event) => {
      if (event.streams[0]) {
        setPeers(prev => ({
          ...prev,
          [userId]: event.streams[0]
        }));
      }
    };
    
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit("signal", {
          to: userId,
          type: "candidate",
          payload: event.candidate
        });
      }
    };
    
    if (isInitiator) {
      setTimeout(async () => {
        try {
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
          await pc.setLocalDescription(offer);
          socketRef.current.emit("signal", {
            to: userId,
            type: "offer",
            payload: pc.localDescription
          });
        } catch (err) {
          console.warn("Offer error:", err);
        }
      }, 1000);
    }
    
    return pc;
  };
  
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !muted;
        setMuted(!muted);
      }
    }
  };
  
  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !cameraOff;
        setCameraOff(!cameraOff);
      }
    }
  };
  
  const toggleScreenShare = async () => {
    try {
      if (screenSharing) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        if (localStreamRef.current) {
          localVideo.current.srcObject = localStreamRef.current;
        }
        setScreenSharing(false);
      } else {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 30 },
            width: { max: 1920 },
            height: { max: 1080 }
          }
        });
        screenStreamRef.current = screenStream;
        localVideo.current.srcObject = screenStream;
        setScreenSharing(true);
        
        Object.values(peerConnections.current).forEach(pc => {
          const senders = pc.getSenders();
          const videoSender = senders.find(s => s.track?.kind === "video");
          if (videoSender) {
            videoSender.replaceTrack(screenStream.getVideoTracks()[0]);
          }
        });
        
        screenStream.getVideoTracks()[0].onended = () => {
          toggleScreenShare();
        };
      }
    } catch (err) {
      console.warn("Screen share error:", err);
    }
  };
  
  const copyMeetingId = () => {
    navigator.clipboard.writeText(id);
    alert("Meeting ID copied to clipboard!");
  };
  
  const leaveMeeting = () => {
    if (window.confirm("Leave this meeting?")) {
      navigate("/");
    }
  };
  
  const reconnect = () => {
    window.location.reload();
  };

  const renderVideoLayout = () => {
    const peerCount = Object.keys(peers).length;
    const totalParticipants = peerCount + 1; // local + remote peers

    if (totalParticipants === 0) return null;

    // For 2 participants: Show side by side
    if (totalParticipants === 2 && !isMobile) {
      return (
        <div className="flex-1 flex flex-col md:flex-row gap-4 md:gap-6 p-4">
          {/* Local Video */}
          <div className="flex-1 relative group">
            <div className="h-full bg-gray-900 rounded-2xl overflow-hidden shadow-2xl">
              <video 
                ref={localVideo} 
                autoPlay 
                muted 
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent">
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full">
                  <Crown size={16} className="text-amber-400" />
                  <span className="font-medium text-sm">You (Host)</span>
                  {muted && <MicOff size={14} className="text-rose-400 ml-2" />}
                  {cameraOff && <VideoOff size={14} className="text-rose-400" />}
                </div>
              </div>
            </div>
          </div>

          {/* Remote Video */}
          {Object.entries(peers).map(([userId, stream]) => (
            <div key={userId} className="flex-1 relative group">
              <div className="h-full bg-gray-900 rounded-2xl overflow-hidden shadow-2xl">
                <video
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                  ref={el => {
                    if (el && stream) {
                      el.srcObject = stream;
                    }
                    remoteVideosRef.current[userId] = el;
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent">
                  <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full">
                    <User size={16} className="text-blue-400" />
                    <span className="font-medium text-sm">User {userId.slice(-4)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    // For more than 2 participants or mobile: Use grid layout
    const gridCols = isMobile ? "grid-cols-1" : 
                    totalParticipants <= 4 ? "grid-cols-2" :
                    totalParticipants <= 9 ? "grid-cols-3" : "grid-cols-4";

    return (
      <div className={`grid ${gridCols} gap-4 p-4`}>
        {/* Local Video Card */}
        <div className="relative group">
          <div className="aspect-video bg-gray-900 rounded-xl overflow-hidden">
            <video 
              ref={localVideo} 
              autoPlay 
              muted 
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent">
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-full">
                <Crown size={14} className="text-amber-400" />
                <span className="text-xs font-medium">You</span>
                {muted && <MicOff size={12} className="text-rose-400 ml-1" />}
                {cameraOff && <VideoOff size={12} className="text-rose-400" />}
              </div>
            </div>
          </div>
        </div>

        {/* Remote Video Cards */}
        {Object.entries(peers).map(([userId, stream]) => (
          <div key={userId} className="relative group">
            <div className="aspect-video bg-gray-900 rounded-xl overflow-hidden">
              <video
                autoPlay
                playsInline
                className="w-full h-full object-cover"
                ref={el => {
                  if (el && stream) {
                    el.srcObject = stream;
                  }
                  remoteVideosRef.current[userId] = el;
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent">
                <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-full">
                  <User size={14} className="text-blue-400" />
                  <span className="text-xs font-medium">User {userId.slice(-4)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white relative overflow-hidden">
      {/* Top Bar */}
      <div className="flex justify-between items-center px-4 py-3 md:px-6 md:py-4 bg-gray-900/80 backdrop-blur-lg border-b border-gray-800 z-40 relative">
        <div className="flex items-center gap-3">
          {isMobile && (
            <button
              onClick={() => navigate("/")}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              status === 'connected' ? 'bg-emerald-500 animate-pulse' :
              status === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500'
            }`}></div>
            <span className="text-sm font-medium hidden sm:inline">
              {status === 'connected' ? 'Connected' : 
               status === 'connecting' ? 'Connecting...' : 'Disconnected'}
            </span>
          </div>
        </div>
        
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-2 bg-gray-800/60 px-4 py-2 rounded-lg backdrop-blur-sm">
            <Sparkles size={14} className="text-amber-400" />
            <span className="text-sm text-gray-300">Room:</span>
            <code className="font-mono font-bold text-sm truncate max-w-[120px] md:max-w-none">{id}</code>
            <button 
              onClick={copyMeetingId}
              className="text-gray-400 hover:text-white transition-colors hover:scale-110 active:scale-95"
            >
              <Copy size={14} />
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowParticipants(!showParticipants)}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors relative"
          >
            <Users size={20} />
            {participants > 1 && (
              <span className="absolute -top-1 -right-1 bg-emerald-500 text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {participants}
              </span>
            )}
          </button>
          
          {!isMobile && participants > 2 && (
            <div className="hidden md:flex items-center gap-1">
              <button
                onClick={() => setVideoLayout("grid")}
                className={`p-2 rounded-lg ${videoLayout === "grid" ? "bg-blue-600" : "bg-gray-800 hover:bg-gray-700"}`}
              >
                <Grid3x3 size={18} />
              </button>
              <button
                onClick={() => setVideoLayout("sideBySide")}
                className={`p-2 rounded-lg ${videoLayout === "sideBySide" ? "bg-blue-600" : "bg-gray-800 hover:bg-gray-700"}`}
              >
                <LayoutGrid size={18} />
              </button>
            </div>
          )}
          
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>
      
      {/* Main Video Area */}
      <div className="h-[calc(100vh-140px)] md:h-[calc(100vh-160px)] overflow-y-auto">
        {renderVideoLayout()}
        
        {/* Empty State */}
        {Object.keys(peers).length === 0 && status === 'connected' && (
          <div className="h-full flex flex-col items-center justify-center p-8">
            <div className="max-w-lg text-center">
              <div className="inline-block p-8 bg-gradient-to-br from-gray-800/50 to-gray-900/30 rounded-2xl border-2 border-gray-700/50 mb-8">
                <Users size={80} className="text-gray-600 mx-auto mb-6" />
                <h3 className="text-3xl font-bold mb-3">You're the only one here</h3>
                <p className="text-gray-400 text-lg mb-8">
                  Invite others to join this meeting by sharing the ID below
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
                  <div className="bg-gray-800/70 px-6 py-4 rounded-xl">
                    <code className="text-2xl font-mono font-bold">{id}</code>
                  </div>
                  <button
                    onClick={copyMeetingId}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-6 py-4 rounded-xl font-medium flex items-center gap-3 text-lg transition-all hover:scale-105 active:scale-95"
                  >
                    <Copy size={20} />
                    Copy Meeting ID
                  </button>
                </div>
              </div>
              <p className="text-gray-500 text-sm">
                Share this ID with others so they can join your meeting
              </p>
            </div>
          </div>
        )}
      </div>
      
      {/* Participants Panel */}
      {showParticipants && (
        <div className="fixed inset-y-0 right-0 w-full md:w-80 bg-gray-900/95 backdrop-blur-xl border-l border-gray-800 z-50">
          <div className="p-6 h-full overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Users size={20} />
                Participants ({participants})
              </h2>
              <button
                onClick={() => setShowParticipants(false)}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3">
              {/* Local User */}
              <div className="flex items-center gap-3 p-3 bg-gray-800/50 hover:bg-gray-700/50 rounded-xl transition-colors">
                <div className="relative">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center">
                    <User size={24} />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-gray-900"></div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">You (Host)</p>
                    <Crown size={14} className="text-amber-400" />
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <div className="flex items-center gap-1">
                      {muted ? (
                        <>
                          <MicOff size={12} className="text-rose-400" />
                          <span>Muted</span>
                        </>
                      ) : (
                        <>
                          <Mic size={12} className="text-emerald-400" />
                          <span>Speaking</span>
                        </>
                      )}
                    </div>
                    {cameraOff && (
                      <>
                        <span>•</span>
                        <VideoOff size={12} className="text-rose-400" />
                      </>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Remote Users */}
              {Object.entries(peers).map(([userId, stream]) => (
                <div
                  key={userId}
                  className="flex items-center gap-3 p-3 bg-gray-800/50 hover:bg-gray-700/50 rounded-xl transition-colors"
                >
                  <div className="relative">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center">
                      <User size={24} />
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-gray-900"></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">User {userId.slice(-4)}</p>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <div className="flex items-center gap-1">
                        <Volume2 size={12} className="text-emerald-400" />
                        <span>Connected</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Control Bar */}
      <div className={`fixed ${
        isMobile 
          ? showControls 
            ? 'bottom-0 left-0 right-0 animate-slideUp' 
            : 'bottom-0 left-0 right-0 -translate-y-full animate-slideDown'
          : 'bottom-6 left-1/2 transform -translate-x-1/2'
      } transition-transform duration-300 z-40`}>
        <div className={`flex items-center justify-center ${
          isMobile 
            ? 'bg-gradient-to-t from-gray-900 to-gray-900/95 backdrop-blur-xl px-4 py-4' 
            : 'gap-3 bg-gray-900/90 backdrop-blur-xl px-6 py-4 rounded-2xl shadow-2xl border border-gray-800'
        }`}>
          
          {/* Control Buttons */}
          <div className="flex items-center gap-2 md:gap-4">
            {/* Mute Toggle */}
            <button
              onClick={toggleMute}
              className={`p-3 md:p-4 rounded-full transition-all duration-300 ${
                muted 
                  ? 'bg-gradient-to-br from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800' 
                  : 'bg-gray-800 hover:bg-gray-700'
              }`}
            >
              {muted ? (
                <MicOff size={isMobile ? 20 : 24} className="text-white" />
              ) : (
                <Mic size={isMobile ? 20 : 24} className="text-white" />
              )}
            </button>
            
            {/* Camera Toggle */}
            <button
              onClick={toggleCamera}
              className={`p-3 md:p-4 rounded-full transition-all duration-300 ${
                cameraOff 
                  ? 'bg-gradient-to-br from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800' 
                  : 'bg-gray-800 hover:bg-gray-700'
              }`}
            >
              {cameraOff ? (
                <VideoOff size={isMobile ? 20 : 24} className="text-white" />
              ) : (
                <Video size={isMobile ? 20 : 24} className="text-white" />
              )}
            </button>
            
            {/* Screen Share */}
            <button
              onClick={toggleScreenShare}
              className={`p-3 md:p-4 rounded-full transition-all duration-300 ${
                screenSharing 
                  ? 'bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800' 
                  : 'bg-gray-800 hover:bg-gray-700'
              }`}
            >
              <ScreenShare size={isMobile ? 20 : 24} className="text-white" />
            </button>
            
            {/* Leave Button */}
            <button
              onClick={leaveMeeting}
              className={`${
                isMobile 
                  ? 'px-6 py-3' 
                  : 'px-8 py-4'
              } bg-gradient-to-br from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 rounded-full font-medium flex items-center gap-2 transition-all duration-300 hover:scale-105 active:scale-95`}
            >
              <Phone size={20} className="rotate-135" />
              <span className={isMobile ? "" : "font-semibold"}>Leave</span>
            </button>
          </div>
        </div>
        
        {/* Mobile tap indicator */}
        {isMobile && !showControls && (
          <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-gray-800 backdrop-blur-sm px-4 py-2 rounded-full text-sm animate-pulse border border-gray-700">
            👆 Tap to show controls
          </div>
        )}
      </div>
      
      {/* Settings Panel */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-gray-800">
            <div className="flex justify-between items-center p-6 border-b border-gray-800">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Settings size={20} />
                Settings
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <Wifi size={18} />
                  Connection
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                    <span className="text-sm">Status</span>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        status === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}></div>
                      <span className={`text-sm ${
                        status === 'connected' ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={reconnect}
                    className="w-full p-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-lg flex items-center justify-center gap-2 transition-all"
                  >
                    <RefreshCw size={18} />
                    Reconnect
                  </button>
                </div>
              </div>
              
              <div>
                <h3 className="font-medium mb-3">Meeting Info</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                    <span className="text-sm">Meeting ID</span>
                    <code className="font-mono">{id}</code>
                  </div>
                  <button
                    onClick={copyMeetingId}
                    className="w-full p-3 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center justify-center gap-2 transition-all"
                  >
                    <Copy size={18} />
                    Copy Meeting ID
                  </button>
                </div>
              </div>
              
              <div className="pt-4 border-t border-gray-800">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Shield size={16} className="text-emerald-400" />
                  <span>End-to-end encrypted • Premium quality</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        
        @keyframes slideDown {
          from { transform: translateY(0); }
          to { transform: translateY(100%); }
        }
        
        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
        
        .animate-slideDown {
          animation: slideDown 0.3s ease-in;
        }
      `}</style>
    </div>
  );
}