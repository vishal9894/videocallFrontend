import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { 
  Video, 
  Users, 
  Copy, 
  Check,
  LogIn,
  PlusCircle,
  Shield,
  Zap,
  X
} from "lucide-react";

const Home = () => {
    const navigate = useNavigate();
    const [copied, setCopied] = useState(false);
    const [codeInput, setCodeInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [generatedCode, setGeneratedCode] = useState("");
    const [showCodeModal, setShowCodeModal] = useState(false);

    const createMeeting = async () => {
        setIsLoading(true);
        const code = uuidv4().split("-")[0].toUpperCase();
        setGeneratedCode(code);
        setShowCodeModal(true);
        setIsLoading(false);
    };

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(generatedCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error("Failed to copy:", error);
        }
    };

    const startMeeting = () => {
        navigate(`/meeting/${generatedCode}`);
    };

    const joinMeeting = (e) => {
        e.preventDefault();
        const code = codeInput.trim().toUpperCase();
        
        if (!code) {
            alert("Please enter a meeting code");
            return;
        }
        
        setIsLoading(true);
        navigate(`/meeting/${code}`);
    };

    const features = [
        { icon: <Shield size={20} />, text: "End-to-end encrypted" },
        { icon: <Users size={20} />, text: "Up to 50 participants" },
        { icon: <Zap size={20} />, text: "HD video & audio" }
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
            <div className="relative w-full max-w-lg">
                {/* Header */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center p-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl mb-4 shadow-lg">
                        <Video className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-4xl font-bold text-gray-900 mb-2 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
                        Instant Meetings
                    </h1>
                    <p className="text-gray-600 text-lg">
                        Connect instantly with crystal-clear video
                    </p>
                </div>

                {/* Main Card */}
                <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/20">
                    {/* Create Meeting Button */}
                    <button
                        onClick={createMeeting}
                        disabled={isLoading}
                        className="w-full group bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white py-4 rounded-xl font-semibold transition-all duration-300 hover:shadow-xl disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        <div className="flex items-center justify-center gap-3">
                            {isLoading ? (
                                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    <PlusCircle className="w-5 h-5" />
                                    Create New Meeting
                                </>
                            )}
                        </div>
                    </button>

                    {/* Divider */}
                    <div className="flex items-center my-8">
                        <div className="flex-1 border-t border-gray-200"></div>
                        <span className="px-4 text-gray-400 text-sm font-medium">OR</span>
                        <div className="flex-1 border-t border-gray-200"></div>
                    </div>

                    {/* Join Meeting Form */}
                    <form onSubmit={joinMeeting}>
                        <div className="relative mb-6">
                            <LogIn className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                            <input
                                name="code"
                                type="text"
                                value={codeInput}
                                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                                placeholder="Enter meeting code"
                                className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-300 text-lg font-medium tracking-wider placeholder-gray-400"
                                maxLength="8"
                                autoComplete="off"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white py-4 rounded-xl font-semibold transition-all duration-300 hover:shadow-xl disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            <div className="flex items-center justify-center gap-3">
                                {isLoading ? (
                                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <>
                                        <Users className="w-5 h-5" />
                                        Join Meeting
                                    </>
                                )}
                            </div>
                        </button>
                    </form>

                    {/* Features */}
                    <div className="mt-10 pt-8 border-t border-gray-100">
                        <div className="grid grid-cols-3 gap-4">
                            {features.map((feature, index) => (
                                <div 
                                    key={index}
                                    className="text-center group"
                                >
                                    <div className="inline-flex items-center justify-center p-2 bg-gray-100 text-gray-600 rounded-lg group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors duration-300 mb-2">
                                        {feature.icon}
                                    </div>
                                    <p className="text-xs text-gray-600 font-medium group-hover:text-gray-800 transition-colors duration-300">
                                        {feature.text}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Instructions */}
                    <div className="mt-8 p-4 bg-gradient-to-r from-gray-50 to-blue-50 rounded-xl border border-blue-100">
                        <div className="flex items-start gap-3">
                            <Copy className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm text-gray-700">
                                    <span className="font-semibold">Pro tip:</span> Share the meeting code with others to invite them to your meeting
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="text-center mt-8">
                    <p className="text-gray-500 text-sm">
                        Secure • No sign-up required • Free to use
                    </p>
                </div>
            </div>

            {/* Generated Code Modal */}
            {showCodeModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-gray-900">
                                Meeting Created Successfully!
                            </h2>
                            <button
                                onClick={() => setShowCodeModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="mb-6">
                            <p className="text-gray-600 mb-4">
                                Share this code with participants to join the meeting:
                            </p>
                            
                            <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl p-4 mb-4">
                                <div className="text-center">
                                    <p className="text-sm text-gray-500 mb-1">Meeting Code</p>
                                    <p className="text-3xl font-bold tracking-wider text-gray-900 font-mono">
                                        {generatedCode}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={copyToClipboard}
                                    className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold transition-all duration-300"
                                >
                                    {copied ? (
                                        <>
                                            <Check className="w-5 h-5" />
                                            Copied to Clipboard!
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-5 h-5" />
                                            Copy Meeting Code
                                        </>
                                    )}
                                </button>

                                <button
                                    onClick={startMeeting}
                                    className="w-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white py-3 rounded-lg font-semibold transition-all duration-300"
                                >
                                    Enter Meeting Room
                                </button>
                            </div>
                        </div>

                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                            <p className="text-sm text-amber-800 text-center">
                                <span className="font-semibold">Note:</span> Save this code to join later
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Home;