import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import io from "socket.io-client";
import {
  Mic, MicOff, Video, VideoOff, Phone,
  ScreenShare, Users, Copy, Settings
} from "lucide-react";

const BASE_URL = import.meta.env.VITE_API_URL;

export default function Meeting() {
  const { id } = useParams();
  const navigate = useNavigate();

  const localVideo = useRef(null);
  const socketRef = useRef(null);
  const peerConnections = useRef({});
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);

  const [peers, setPeers] = useState({});
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [participants, setParticipants] = useState(1);
  const [status, setStatus] = useState("connecting");

  /* -------------------- INIT -------------------- */
  useEffect(() => {
    socketRef.current = io(BASE_URL, { transports: ["websocket"] });
    const socket = socketRef.current;

    socket.on("connect", async () => {
      setStatus("connected");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      localStreamRef.current = stream;
      localVideo.current.srcObject = stream;
      localVideo.current.muted = true;

      socket.emit("join-room", id);
    });

    socket.on("existing-users", users => {
      setParticipants(users.length + 1);
      users.forEach(uid => createPeer(uid, true));
    });

    socket.on("user-joined", uid => {
      setParticipants(p => p + 1);
      createPeer(uid, false);
    });

    socket.on("user-left", uid => {
      setParticipants(p => Math.max(1, p - 1));
      peerConnections.current[uid]?.close();
      delete peerConnections.current[uid];

      setPeers(prev => {
        const copy = { ...prev };
        delete copy[uid];
        return copy;
      });
    });

    socket.on("signal", async ({ from, type, payload }) => {
      let pc = peerConnections.current[from];

      if (type === "offer") {
        if (!pc) pc = createPeer(from, false);
        await pc.setRemoteDescription(payload);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("signal", { to: from, type: "answer", payload: pc.localDescription });
      }

      if (type === "answer") {
        await pc?.setRemoteDescription(payload);
      }

      if (type === "candidate") {
        await pc?.addIceCandidate(payload);
      }
    });

    return () => {
      Object.values(peerConnections.current).forEach(pc => pc.close());
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      socket.disconnect();
    };
  }, [id]);

  /* -------------------- PEER -------------------- */
  const createPeer = (userId, initiator) => {
    if (peerConnections.current[userId]) return peerConnections.current[userId];

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    peerConnections.current[userId] = pc;

    localStreamRef.current.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current);
    });

    pc.ontrack = e => {
      const stream = e.streams[0];
      if (!stream) return;

      setPeers(prev => ({ ...prev, [userId]: stream }));
    };

    pc.onicecandidate = e => {
      if (e.candidate) {
        socketRef.current.emit("signal", {
          to: userId,
          type: "candidate",
          payload: e.candidate
        });
      }
    };

    pc.onnegotiationneeded = async () => {
      if (!initiator) return;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current.emit("signal", {
        to: userId,
        type: "offer",
        payload: pc.localDescription
      });
    };

    return pc;
  };

  /* -------------------- CONTROLS -------------------- */
  const toggleMute = () => {
    const track = localStreamRef.current.getAudioTracks()[0];
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  };

  const toggleCamera = () => {
    const track = localStreamRef.current.getVideoTracks()[0];
    track.enabled = !track.enabled;
    setCameraOff(!track.enabled);
  };

  const toggleScreenShare = async () => {
    if (screenSharing) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      const camTrack = localStreamRef.current.getVideoTracks()[0];

      Object.values(peerConnections.current).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === "video");
        sender?.replaceTrack(camTrack);
      });

      localVideo.current.srcObject = localStreamRef.current;
      setScreenSharing(false);
    } else {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      screenStreamRef.current = screenStream;

      Object.values(peerConnections.current).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === "video");
        sender?.replaceTrack(screenTrack);
      });

      localVideo.current.srcObject = screenStream;
      setScreenSharing(true);

      screenTrack.onended = () => toggleScreenShare();
    }
  };

  const leaveMeeting = () => {
    navigate("/");
  };

  /* -------------------- UI -------------------- */
  return (
    <div className="h-screen bg-black text-white flex flex-col">
      <header className="p-4 flex justify-between items-center bg-gray-900">
        <span>Room: {id}</span>
        <span>Participants: {participants}</span>
      </header>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
        <video ref={localVideo} autoPlay muted playsInline className="rounded bg-gray-900" />

        {Object.entries(peers).map(([uid, stream]) => (
          <video
            key={uid}
            autoPlay
            playsInline
            className="rounded bg-gray-900"
            ref={el => el && (el.srcObject = stream)}
          />
        ))}
      </div>

      <footer className="p-4 flex justify-center gap-4 bg-gray-900">
        <button onClick={toggleMute}>{muted ? <MicOff /> : <Mic />}</button>
        <button onClick={toggleCamera}>{cameraOff ? <VideoOff /> : <Video />}</button>
        <button onClick={toggleScreenShare}><ScreenShare /></button>
        <button onClick={leaveMeeting} className="text-red-500"><Phone /></button>
      </footer>
    </div>
  );
}
