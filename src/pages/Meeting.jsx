import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import io from "socket.io-client";
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Phone
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
  
  const [peers, setPeers] = useState({});
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [status, setStatus] = useState("connecting");

  // Initialize
  useEffect(() => {
    console.log("Starting meeting:", id);
    
    socketRef.current = io(BASE_URL, {
      transports: ["websocket"]
    });
    
    const socket = socketRef.current;
    
    socket.on("connect", async () => {
      console.log("Connected:", socket.id);
      setStatus("connected");
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: true
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
      console.log("Existing users:", userIds);
      userIds.forEach(userId => createPeerConnection(userId, true));
    });
    
    socket.on("user-joined", (userId) => {
      console.log("New user:", userId);
      createPeerConnection(userId, true);
    });
    
    socket.on("user-left", (userId) => {
      console.log("User left:", userId);
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
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [id, navigate]);
  
  const createPeerConnection = (userId, isInitiator) => {
    if (peerConnections.current[userId]) {
      return peerConnections.current[userId];
    }
    
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
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
  
  const copyMeetingId = () => {
    navigator.clipboard.writeText(id);
    alert("Meeting ID copied!");
  };
  
  const leaveMeeting = () => {
    if (window.confirm("Leave this meeting?")) {
      navigate("/");
    }
  };

  // Render ALL participants including yourself
  const renderAllParticipants = () => {
    const totalParticipants = Object.keys(peers).length + 1; // +1 for yourself
    
    if (totalParticipants === 1) {
      // Only you in the meeting
      return (
        <div className="h-full flex items-center justify-center p-8">
          <div className="text-center">
            <h3 className="text-2xl font-bold mb-4">You're the only one here</h3>
            <p className="text-gray-400 mb-6">
              Share this meeting ID: <span className="font-mono bg-gray-800 px-3 py-1 rounded">{id}</span>
            </p>
            <button
              onClick={copyMeetingId}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
            >
              Copy Meeting ID
            </button>
          </div>
        </div>
      );
    }

    // Calculate grid columns based on number of participants
    let gridCols;
    if (totalParticipants === 2) {
      gridCols = "grid-cols-2";
    } else if (totalParticipants <= 4) {
      gridCols = "grid-cols-2";
    } else if (totalParticipants <= 9) {
      gridCols = "grid-cols-3";
    } else {
      gridCols = "grid-cols-4";
    }

    return (
      <div className={`grid ${gridCols} gap-4 p-4 h-full`}>
        {/* Your own video */}
        <div className="relative">
          <div className="bg-gray-900 rounded-lg overflow-hidden h-full">
            <video 
              ref={localVideo} 
              autoPlay 
              muted 
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 rounded text-xs">
              You {muted ? "🔇" : "🎤"} {cameraOff ? "📷❌" : "📷"}
            </div>
          </div>
        </div>

        {/* Remote participants */}
        {Object.entries(peers).map(([userId, stream]) => (
          <div key={userId} className="relative">
            <div className="bg-gray-900 rounded-lg overflow-hidden h-full">
              <video
                autoPlay
                playsInline
                className="w-full h-full object-cover"
                ref={el => {
                  if (el && stream) {
                    el.srcObject = stream;
                  }
                }}
              />
              <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 rounded text-xs">
                User {userId.slice(-4)}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Simple status bar */}
      <div className="flex justify-between items-center px-4 py-3 bg-gray-800">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            status === 'connected' ? 'bg-green-500' : 'bg-red-500'
          }`}></div>
          <span className="text-sm">Meeting: {id}</span>
        </div>
        <div className="text-sm">
          {Object.keys(peers).length + 1} participant{Object.keys(peers).length + 1 !== 1 ? 's' : ''}
        </div>
      </div>
      
      {/* Main Video Area - Shows ALL participants */}
      <div className="h-[calc(100vh-140px)]">
        {renderAllParticipants()}
      </div>
      
      {/* Control Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-800 py-4 z-40">
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={toggleMute}
            className={`p-3 rounded-full ${
              muted ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {muted ? (
              <MicOff size={24} />
            ) : (
              <Mic size={24} />
            )}
          </button>
          
          <button
            onClick={toggleCamera}
            className={`p-3 rounded-full ${
              cameraOff ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {cameraOff ? (
              <VideoOff size={24} />
            ) : (
              <Video size={24} />
            )}
          </button>
          
          <button
            onClick={leaveMeeting}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-full font-medium flex items-center gap-2"
          >
            <Phone size={20} className="rotate-135" />
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}