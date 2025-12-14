import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import io from "socket.io-client";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Phone,
  Copy,
  User,
  AlertCircle
} from "lucide-react";

const socket = io(import.meta.env.VITE_API_URL);

const Meeting = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);

  const peerConnection = useRef(null);

  useEffect(() => {
    initializeMedia();

    return () => {
      cleanup();
    };
  }, [id]);

  const initializeMedia = async () => {
    try {
      console.log("Initializing media...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      console.log("Got media stream");
      setLocalStream(stream);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Join room after getting media
      socket.emit("join-room", id);
      setupSocketListeners();

    } catch (err) {
      console.error("Error accessing media:", err);
      setError("Could not access camera/microphone. Please check permissions.");
    }
  };

  const setupSocketListeners = () => {
    socket.on("existing-users", (otherUsers) => {
      console.log("Existing users in room:", otherUsers);
      if (otherUsers.length > 0 && localStream) {
        // Create peer connection for each existing user
        otherUsers.forEach(userId => {
          createPeerConnection(userId);
        });
      }
    });

    socket.on("user-joined", (userId) => {
      console.log("New user joined:", userId);
      if (localStream) {
        createPeerConnection(userId);
      }
    });

    socket.on("user-left", (userId) => {
      console.log("User left:", userId);
      setIsConnected(false);
      setRemoteStream(null);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
    });

    socket.on("signal", async (data) => {
      console.log("Received signal from:", data.from, "type:", data.signal.type || "candidate");

      if (!peerConnection.current) {
        await createPeerConnection(data.from);
      }

      try {
        if (data.signal.type === 'offer') {
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.signal));
          const answer = await peerConnection.current.createAnswer();
          await peerConnection.current.setLocalDescription(answer);

          socket.emit("signal", {
            to: data.from,
            signal: peerConnection.current.localDescription
          });

        } else if (data.signal.type === 'answer') {
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.signal));

        } else if (data.signal.candidate) {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.signal));
        }
      } catch (err) {
        console.error("Error handling signal:", err);
      }
    });

    socket.on("error", (errorData) => {
      console.error("Socket error:", errorData);
      setError(errorData.message);
    });
  };

  const createPeerConnection = (targetUserId) => {
    console.log("Creating peer connection for:", targetUserId);

    try {
      // Close existing connection if any
      if (peerConnection.current) {
        peerConnection.current.close();
      }

      const config = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        ]
      };

      const pc = new RTCPeerConnection(config);
      peerConnection.current = pc;

      // Add local tracks
      if (localStream) {
        localStream.getTracks().forEach(track => {
          pc.addTrack(track, localStream);
          console.log("Added local track:", track.kind);
        });
      }

      // Handle remote stream
      pc.ontrack = (event) => {
        console.log("Received remote track:", event.track.kind);
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = event.streams[0];
          }
          setIsConnected(true);
          setError(null);
        }
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("Sending ICE candidate to:", targetUserId);
          socket.emit("signal", {
            to: targetUserId,
            signal: event.candidate
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", pc.iceConnectionState);
        if (pc.iceConnectionState === 'disconnected' ||
          pc.iceConnectionState === 'failed' ||
          pc.iceConnectionState === 'closed') {
          setIsConnected(false);
        }
      };

      pc.onsignalingstatechange = () => {
        console.log("Signaling state:", pc.signalingState);
      };

      // If we're initiating, create an offer
      if (localStream && pc.signalingState === 'stable') {
        pc.createOffer()
          .then(offer => {
            console.log("Created offer, setting local description");
            return pc.setLocalDescription(offer);
          })
          .then(() => {
            console.log("Sending offer to:", targetUserId);
            socket.emit("signal", {
              to: targetUserId,
              signal: pc.localDescription
            });
          })
          .catch(err => console.error("Error creating offer:", err));
      }

      return pc;

    } catch (err) {
      console.error("Error creating peer connection:", err);
      setError("Failed to establish connection");
    }
  };

  const toggleMic = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOn(videoTrack.enabled);
      }
    }
  };

  const copyMeetingCode = () => {
    navigator.clipboard.writeText(id);
    alert("Meeting code copied!");
  };

  const cleanup = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection.current) {
      peerConnection.current.close();
    }
    socket.emit("leave-room", id);
    socket.disconnect();
  };

  const leaveMeeting = () => {
    cleanup();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 px-6 py-3 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Video className="w-5 h-5 text-blue-400" />
            <h1 className="text-xl font-bold">Video Call</h1>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm">{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-sm text-gray-400">Meeting ID</p>
              <div className="flex items-center gap-2">
                <code className="font-mono font-bold">{id}</code>
                <button
                  onClick={copyMeetingCode}
                  className="p-1 hover:bg-gray-700 rounded"
                  title="Copy meeting code"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 mx-4 mt-4 p-3 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-red-300">{error}</span>
        </div>
      )}

      {/* Video Area */}
      <div className="p-4 h-[calc(100vh-140px)]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
          {/* Remote Video */}
          <div className="relative rounded-xl overflow-hidden bg-gray-800 border border-gray-700 h-full">
            {remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="w-32 h-32 rounded-full bg-gray-700 flex items-center justify-center mb-4">
                  <User className="w-16 h-16 text-gray-400" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Waiting for participant</h3>
                <p className="text-gray-400">No one has joined yet</p>
              </div>
            )}

            <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm px-3 py-2 rounded-lg">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4" />
                <span className="font-medium">Remote Participant</span>
                {isConnected && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-xs text-green-400">Live</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Local Video */}
          <div className="relative rounded-xl overflow-hidden bg-gray-800 border border-gray-700 h-full">
            {isVideoOn ? (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                <div className="text-center">
                  <VideoOff className="w-16 h-16 mx-auto text-gray-600 mb-4" />
                  <p className="text-gray-400">Camera is off</p>
                </div>
              </div>
            )}

            <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm px-3 py-2 rounded-lg">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-blue-400" />
                <span className="font-medium">You</span>
                <div className="flex items-center gap-1 ml-2">
                  {!isMicOn && <MicOff className="w-3 h-3 text-red-400" />}
                  {!isVideoOn && <VideoOff className="w-3 h-3 text-red-400" />}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-6">
          <button
            onClick={toggleMic}
            className={`p-3 rounded-full ${isMicOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'}`}
            title={isMicOn ? "Mute" : "Unmute"}
          >
            {isMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
          </button>

          <button
            onClick={toggleVideo}
            className={`p-3 rounded-full ${isVideoOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'}`}
            title={isVideoOn ? "Stop Video" : "Start Video"}
          >
            {isVideoOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
          </button>

          <button
            onClick={leaveMeeting}
            className="p-3 rounded-full bg-red-600 hover:bg-red-700"
            title="Leave Call"
          >
            <Phone className="w-6 h-6 rotate-135" />
          </button>
        </div>

        <div className="text-center mt-3">
          <span className="text-sm text-gray-400">
            {isConnected ? "✅ Connected to remote user" : "⏳ Waiting for connection..."}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Meeting;