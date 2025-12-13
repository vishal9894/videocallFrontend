import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { CopyToClipboard } from "react-copy-to-clipboard";
const BASE_URL = import.meta.env.VITE_API_URL;


export default function Home() {
  const [meetingId, setMeetingId] = useState("");
  const [generatedId, setGeneratedId] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const navigate = useNavigate();

  console.log(BASE_URL , "base url");
  

  const createMeeting = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${BASE_URL}/api/meeting/create`);
      if (res.data.success) {
        setGeneratedId(res.data.meetingId);
      } else {
        alert("Failed to create meeting");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to create meeting. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const joinMeeting = async () => {
    if (!meetingId.trim()) {
      alert("Please enter a meeting ID");
      return;
    }
    
    setJoinLoading(true);
    try {
      // Check if meeting exists
      const res = await axios.post(`${BASE_URL}/api/meeting/join/${meetingId}`);
      
      if (res.data.success) {
        navigate(`/meeting/${meetingId}`);
      } else {
        alert(res.data.message || "Meeting not found");
      }
    } catch (err) {
      console.error(err);
      if (err.response?.data?.message) {
        alert(err.response.data.message);
      } else {
        alert("Failed to join meeting. Please check the ID and try again.");
      }
    } finally {
      setJoinLoading(false);
    }
  };

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEnterKey = (e) => {
    if (e.key === "Enter") {
      joinMeeting();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="inline-block p-3 bg-indigo-100 rounded-full mb-4">
            <span className="text-3xl">🎥</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-800">Video Meeting</h1>
          <p className="text-gray-600 mt-2">Connect with anyone, anywhere</p>
        </div>

        {/* Create Meeting Section */}
        <div className="space-y-4">
          <button
            onClick={createMeeting}
            disabled={loading}
            className={`w-full flex items-center justify-center gap-2 ${
              loading 
                ? "bg-indigo-400 cursor-not-allowed" 
                : "bg-indigo-500 hover:bg-indigo-600"
            } text-white py-3 rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg`}
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Creating...
              </>
            ) : (
              <>
                <span>➕</span>
                Create New Meeting
              </>
            )}
          </button>

          {generatedId && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-gray-700 font-medium">Meeting ID:</span>
                <CopyToClipboard text={generatedId} onCopy={handleCopy}>
                  <button className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1 rounded-lg transition-colors">
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </CopyToClipboard>
              </div>
              <div className="flex items-center justify-between">
                <code className="font-mono text-lg font-bold text-indigo-600 bg-indigo-50 px-3 py-2 rounded-lg flex-1 text-center">
                  {generatedId}
                </code>
              </div>
              <p className="text-sm text-gray-500 text-center">
                Share this ID with others to join your meeting
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setMeetingId(generatedId);
                    joinMeeting();
                  }}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 rounded-lg font-medium transition-colors"
                >
                  Join Now
                </button>
                <button
                  onClick={() => {
                    setMeetingId("");
                    setGeneratedId("");
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-white text-gray-500">OR</span>
          </div>
        </div>

        {/* Join Meeting Section */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="meetingId" className="block text-gray-700 font-medium">
              Join Existing Meeting
            </label>
            <input
              id="meetingId"
              type="text"
              placeholder="Enter meeting ID (e.g., aBcDeFgH)"
              value={meetingId}
              onChange={e => setMeetingId(e.target.value)}
              onKeyDown={handleEnterKey}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>
          
          <button
            onClick={joinMeeting}
            disabled={joinLoading || !meetingId.trim()}
            className={`w-full flex items-center justify-center gap-2 ${
              joinLoading || !meetingId.trim()
                ? "bg-green-400 cursor-not-allowed"
                : "bg-green-500 hover:bg-green-600"
            } text-white py-3 rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg`}
          >
            {joinLoading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Joining...
              </>
            ) : (
              <>
                <span>🚀</span>
                Join Meeting
              </>
            )}
          </button>
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-4 pt-6 border-t border-gray-200">
          <div className="text-center">
            <div className="inline-block p-2 bg-blue-100 rounded-lg mb-2">
              <span className="text-xl">🔒</span>
            </div>
            <p className="text-sm text-gray-600">Secure</p>
          </div>
          <div className="text-center">
            <div className="inline-block p-2 bg-green-100 rounded-lg mb-2">
              <span className="text-xl">⚡</span>
            </div>
            <p className="text-sm text-gray-600">Fast</p>
          </div>
          <div className="text-center">
            <div className="inline-block p-2 bg-purple-100 rounded-lg mb-2">
              <span className="text-xl">🎯</span>
            </div>
            <p className="text-sm text-gray-600">HD Video</p>
          </div>
        </div>

        {/* Footer Note */}
        <p className="text-center text-sm text-gray-500 pt-4">
          No account required • Free to use • Works in any browser
        </p>
      </div>
    </div>
  );
}