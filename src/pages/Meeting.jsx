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
  Maximize2,
  Settings,
  MessageCircle,
  MoreVertical,
  Grid3x3,
  User,
  Layout,
  ChevronLeft,
  ChevronRight,
  Bell,
  Shield,
  Wifi,
  WifiOff
} from "lucide-react";

const BASE_URL = import.meta.env.VITE_API_URL;

export default function Meeting() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const localVideo = useRef(null);
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
  const [videoLayout, setVideoLayout] = useState("grid");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showControls, setShowControls] = useState(true);

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
            frameRate: { ideal: 24 }
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
      localStreamRef.current.getAudioTracks()[0].enabled = !muted;
      setMuted(!muted);
    }
  };
  
  const toggleCamera = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks()[0].enabled = !cameraOff;
      setCameraOff(!cameraOff);
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
          video: true
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

  // Mobile optimized video grid
  const getVideoLayout = () => {
    if (isMobile) {
      return "vertical";
    }
    return videoLayout;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-950 text-white relative">
      {/* Top Bar - Mobile & Desktop */}
      <div className="flex justify-between items-center px-4 py-3 md:px-6 md:py-4 bg-gray-800/80 backdrop-blur-lg border-b border-gray-700/50">
        {/* Left section */}
        <div className="flex items-center gap-3">
          {/* Mobile back button */}
          {isMobile && (
            <button
              onClick={() => navigate("/")}
              className="p-2 hover:bg-gray-700/50 rounded-lg"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          
          {/* Connection status */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              status === 'connected' ? 'bg-green-500 animate-pulse' :
              status === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
            }`}></div>
            <span className="text-sm font-medium hidden sm:inline">
              {status === 'connected' ? 'Connected' : 
               status === 'connecting' ? 'Connecting...' : 'Disconnected'}
            </span>
          </div>
          
          {/* Participants count - Mobile */}
          {isMobile && (
            <button
              onClick={() => setShowParticipants(!showParticipants)}
              className="flex items-center gap-1 px-2 py-1 bg-gray-700/50 rounded-lg text-sm"
            >
              <Users size={14} />
              <span>{participants}</span>
            </button>
          )}
        </div>
        
        {/* Center - Meeting ID */}
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-2 bg-gray-800/70 px-3 py-1.5 rounded-lg max-w-xs">
            <span className="text-sm text-gray-300 truncate">Room:</span>
            <code className="font-mono font-bold text-sm truncate">{id}</code>
            <button 
              onClick={copyMeetingId}
              className="text-gray-400 hover:text-white transition-colors shrink-0"
            >
              <Copy size={14} />
            </button>
          </div>
        </div>
        
        {/* Right section */}
        <div className="flex items-center gap-2">
          {/* Desktop participants */}
          {!isMobile && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-gray-700/50 rounded-lg text-sm">
              <Users size={16} />
              <span>{participants}</span>
            </div>
          )}
          
          {/* Settings button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 hover:bg-gray-700/50 rounded-lg"
          >
            <Settings size={20} />
          </button>
          
          {/* Mobile menu */}
          {isMobile && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 hover:bg-gray-700/50 rounded-lg"
            >
              <MoreVertical size={20} />
            </button>
          )}
        </div>
      </div>
      
      {/* Main Content */}
      <div className="p-2 md:p-4 lg:p-6">
        {/* Video Container - Responsive */}
        <div className={`max-w-7xl mx-auto ${
          getVideoLayout() === 'grid' ? 
            'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-4' :
          getVideoLayout() === 'vertical' ?
            'flex flex-col gap-2 md:gap-4' :
          'flex flex-col lg:flex-row gap-4'
        }`}>
          
          {/* Local Video Card */}
          <div className={`relative group ${
            getVideoLayout() === 'vertical' ? 'order-1' : ''
          }`}>
            <div className="bg-gray-800 rounded-xl md:rounded-2xl overflow-hidden shadow-xl">
              <video 
                ref={localVideo} 
                autoPlay 
                muted 
                playsInline
                className="w-full h-48 sm:h-56 md:h-64 lg:h-72 object-cover"
              />
              
              {/* Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-full">
                  <span className="text-xs font-medium">You</span>
                  {muted && <MicOff size={12} className="text-red-400" />}
                  {cameraOff && <VideoOff size={12} className="text-red-400" />}
                  {screenSharing && <ScreenShare size={12} className="text-green-400" />}
                </div>
                
                {!isMobile && (
                  <button
                    onClick={() => localVideo.current?.requestFullscreen()}
                    className="absolute top-3 right-3 p-1.5 bg-black/50 backdrop-blur-sm rounded-full hover:bg-black/70 transition-colors"
                  >
                    <Maximize2 size={16} />
                  </button>
                )}
              </div>
            </div>
            
            {/* Connection badge */}
            {status !== 'connected' && (
              <div className="absolute top-2 left-2 bg-red-600/90 backdrop-blur-sm px-2 py-1 rounded-lg text-xs flex items-center gap-1">
                {status === 'disconnected' ? <WifiOff size={12} /> : <Wifi size={12} />}
                <span>{status === 'disconnected' ? 'Offline' : 'Connecting'}</span>
              </div>
            )}
          </div>
          
          {/* Remote Videos */}
          {Object.entries(peers).map(([userId, stream], index) => (
            <div 
              key={userId} 
              className={`relative group ${
                getVideoLayout() === 'vertical' ? `order-${index + 2}` : ''
              }`}
            >
              <div className="bg-gray-800 rounded-xl md:rounded-2xl overflow-hidden shadow-xl">
                <video
                  autoPlay
                  playsInline
                  className="w-full h-48 sm:h-56 md:h-64 lg:h-72 object-cover"
                  ref={el => {
                    if (el && stream) {
                      el.srcObject = stream;
                    }
                  }}
                />
                
                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-full">
                    <span className="text-xs font-medium">User {userId.slice(-4)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          
          {/* Empty State */}
          {Object.keys(peers).length === 0 && status === 'connected' && (
            <div className="col-span-1 sm:col-span-2 lg:col-span-3 xl:col-span-4">
              <div className="h-64 md:h-96 rounded-xl md:rounded-2xl bg-gradient-to-br from-gray-800/30 to-gray-900/30 border-2 border-dashed border-gray-700 flex flex-col items-center justify-center p-4">
                <div className="text-center">
                  <div className="inline-block p-4 md:p-6 bg-gray-800/50 rounded-full mb-4 md:mb-6">
                    <Users size={isMobile ? 32 : 48} className="text-gray-400" />
                  </div>
                  <h3 className="text-lg md:text-2xl font-bold mb-2">You're the only one here</h3>
                  <p className="text-gray-400 text-sm md:text-base mb-4 md:mb-6 max-w-md mx-auto">
                    Invite others by sharing the meeting ID
                  </p>
                  <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
                    <div className="bg-gray-800/70 px-4 py-2 md:px-6 md:py-3 rounded-lg md:rounded-xl">
                      <code className="text-base md:text-xl font-mono font-bold">{id}</code>
                    </div>
                    <button
                      onClick={copyMeetingId}
                      className="bg-blue-600 hover:bg-blue-700 px-4 py-2 md:px-6 md:py-3 rounded-lg md:rounded-xl font-medium flex items-center gap-2 text-sm md:text-base"
                    >
                      <Copy size={isMobile ? 16 : 18} />
                      Copy ID
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Layout Controls - Desktop only */}
        {!isMobile && (
          <div className="flex justify-center mt-4 md:mt-6 gap-2">
            {["grid", "speaker", "sidebar"].map((layout) => (
              <button
                key={layout}
                onClick={() => setVideoLayout(layout)}
                className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg capitalize text-sm md:text-base flex items-center gap-2 ${
                  videoLayout === layout 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50'
                } transition-colors`}
              >
                <Layout size={isMobile ? 14 : 16} />
                {layout}
              </button>
            ))}
          </div>
        )}
      </div>
      
      {/* Mobile Participants Panel */}
      {isMobile && showParticipants && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-40 pt-16">
          <div className="p-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Participants ({participants})</h2>
              <button
                onClick={() => setShowParticipants(false)}
                className="p-2 hover:bg-gray-800 rounded-lg"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3">
              {/* Local user */}
              <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                  <User size={20} />
                </div>
                <div className="flex-1">
                  <p className="font-medium">You (Host)</p>
                  <p className="text-sm text-gray-400">Connected</p>
                </div>
                <div className="flex gap-1">
                  {muted && <MicOff size={16} className="text-red-400" />}
                  {cameraOff && <VideoOff size={16} className="text-red-400" />}
                </div>
              </div>
              
              {/* Remote users */}
              {Object.keys(peers).map((userId) => (
                <div key={userId} className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl">
                  <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center">
                    <User size={20} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">User {userId.slice(-4)}</p>
                    <p className="text-sm text-gray-400">Connected</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Control Bar - Responsive */}
      <div className={`fixed ${
        isMobile 
          ? showControls 
            ? 'bottom-0 left-0 right-0 animate-slideUp' 
            : 'bottom-0 left-0 right-0 -translate-y-full animate-slideDown'
          : 'bottom-8 left-1/2 transform -translate-x-1/2'
      } transition-transform duration-300 z-30`}>
        <div className={`flex items-center ${
          isMobile 
            ? 'justify-between bg-gray-900/95 backdrop-blur-xl px-4 py-3 border-t border-gray-800' 
            : 'gap-2 bg-gray-800/90 backdrop-blur-xl px-6 py-3 rounded-2xl shadow-2xl border border-gray-700/50'
        }`}>
          
          {/* Mobile: Left controls */}
          {isMobile && (
            <div className="flex items-center gap-1">
              <button
                onClick={toggleMute}
                className={`p-3 rounded-full ${
                  muted ? 'bg-red-600' : 'bg-gray-700'
                }`}
              >
                {muted ? (
                  <MicOff size={20} className="text-white" />
                ) : (
                  <Mic size={20} className="text-white" />
                )}
              </button>
              
              <button
                onClick={toggleCamera}
                className={`p-3 rounded-full ${
                  cameraOff ? 'bg-red-600' : 'bg-gray-700'
                }`}
              >
                {cameraOff ? (
                  <VideoOff size={20} className="text-white" />
                ) : (
                  <Video size={20} className="text-white" />
                )}
              </button>
            </div>
          )}
          
          {/* Desktop: All controls in center */}
          {!isMobile && (
            <>
              <div className="hidden md:block px-3 py-1.5 bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Bell size={16} className="text-yellow-400" />
                  <span className="text-sm">
                    {participants} {participants === 1 ? 'person' : 'people'}
                  </span>
                </div>
              </div>
              
              <div className="w-px h-6 bg-gray-600"></div>
              
              <div className="flex items-center gap-1">
                <button
                  onClick={toggleMute}
                  className={`p-3 rounded-full transition-all ${
                    muted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  {muted ? <MicOff size={22} /> : <Mic size={22} />}
                </button>
                
                <button
                  onClick={toggleCamera}
                  className={`p-3 rounded-full transition-all ${
                    cameraOff ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  {cameraOff ? <VideoOff size={22} /> : <Video size={22} />}
                </button>
                
                <button
                  onClick={toggleScreenShare}
                  className={`p-3 rounded-full transition-all ${
                    screenSharing ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  <ScreenShare size={22} />
                </button>
              </div>
              
              <div className="w-px h-6 bg-gray-600"></div>
            </>
          )}
          
          {/* Mobile: Center - Screen share */}
          {isMobile && (
            <button
              onClick={toggleScreenShare}
              className={`p-3 rounded-full ${
                screenSharing ? 'bg-green-600' : 'bg-gray-700'
              }`}
            >
              <ScreenShare size={20} className="text-white" />
            </button>
          )}
          
          {/* Leave button - Right side on mobile, center on desktop */}
          <button
            onClick={leaveMeeting}
            className={`${
              isMobile 
                ? 'px-4 py-2 bg-red-600 rounded-full font-medium flex items-center gap-2'
                : 'px-6 py-3 bg-red-600 hover:bg-red-700 rounded-full font-medium flex items-center gap-2 transition-all transform hover:scale-105'
            }`}
          >
            <Phone size={20} className={isMobile ? "" : "rotate-135"} />
            {!isMobile && <span>Leave</span>}
          </button>
        </div>
        
        {/* Mobile tap indicator */}
        {isMobile && !showControls && (
          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800/80 backdrop-blur-sm px-3 py-1 rounded-full text-xs animate-pulse">
            Tap to show controls
          </div>
        )}
      </div>
      
      {/* Settings Panel - Responsive */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-gray-700">
            <div className="flex justify-between items-center p-6 border-b border-gray-700">
              <h2 className="text-xl font-bold">Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 hover:bg-gray-700 rounded-lg"
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
                  <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
                    <span className="text-sm">Status</span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      status === 'connected' ? 'bg-green-600' : 'bg-red-600'
                    }`}>
                      {status}
                    </span>
                  </div>
                  <button
                    onClick={reconnect}
                    className="w-full p-3 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={18} />
                    Reconnect
                  </button>
                </div>
              </div>
              
              <div>
                <h3 className="font-medium mb-3">Video Quality</h3>
                <div className="grid grid-cols-2 gap-2">
                  {['360p', '720p', '1080p', 'Auto'].map((quality) => (
                    <button
                      key={quality}
                      className="py-3 px-4 bg-gray-700/50 hover:bg-gray-600 rounded-lg text-sm"
                    >
                      {quality}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <h3 className="font-medium mb-3">Meeting Info</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
                    <span className="text-sm">Meeting ID</span>
                    <code className="font-mono">{id}</code>
                  </div>
                  <button
                    onClick={copyMeetingId}
                    className="w-full p-3 bg-gray-700 hover:bg-gray-600 rounded-lg flex items-center justify-center gap-2"
                  >
                    <Copy size={18} />
                    Copy Meeting ID
                  </button>
                </div>
              </div>
              
              {!isMobile && (
                <div>
                  <h3 className="font-medium mb-3">Layout</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {["grid", "speaker", "sidebar"].map((layout) => (
                      <button
                        key={layout}
                        onClick={() => setVideoLayout(layout)}
                        className={`py-3 rounded-lg flex flex-col items-center gap-2 ${
                          videoLayout === layout 
                            ? 'bg-blue-600' 
                            : 'bg-gray-700/50 hover:bg-gray-600'
                        }`}
                      >
                        <Layout size={20} />
                        <span className="text-xs capitalize">{layout}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="pt-4 border-t border-gray-700">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Shield size={16} className="text-green-400" />
                  <span>End-to-end encrypted</span>
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