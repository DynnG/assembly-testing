import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Square,
  Trash2,
  AlertCircle,
  Clock,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  MessageSquare,
  Bot,
  User,
  RefreshCw,
  Send,
} from 'lucide-react';
import type { ConversationTurn, DialogueMessage } from '../types';
import { startDialogue, respondDialogue } from '../services/api';

interface ConversationRecorderCardProps {
  onSessionComplete: (turns: ConversationTurn[], speakingMode: 'prompted' | 'spontaneous', promptTarget?: string) => void;
  isProcessing: boolean;
  speakingMode: 'prompted' | 'spontaneous';
  onSpeakingModeChange: (mode: 'prompted' | 'spontaneous') => void;
  promptTarget: string;
  onPromptTargetChange: (target: string) => void;
}

interface TopicOption {
  id: string;
  title: string;
  topicKey: string;
  starterTarget: string;
}

const CONVERSATION_TOPICS: TopicOption[] = [
  {
    id: 'topic_1',
    title: 'Daily Life & Interests',
    topicKey: 'daily_life_and_interests',
    starterTarget: 'think',
  },
  {
    id: 'topic_2',
    title: 'Workplace & Challenges',
    topicKey: 'workplace_and_goals',
    starterTarget: 'communication',
  },
  {
    id: 'topic_3',
    title: 'Travel & Experiences',
    topicKey: 'travel_and_culture',
    starterTarget: 'speaking',
  },
];

export const ConversationRecorderCard: React.FC<ConversationRecorderCardProps> = ({
  onSessionComplete,
  isProcessing,
  speakingMode,
  onSpeakingModeChange,
  promptTarget,
  onPromptTargetChange,
}) => {
  const [selectedTopic, setSelectedTopic] = useState<TopicOption>(CONVERSATION_TOPICS[0]);
  const [sessionId, setSessionId] = useState<string>(() => `sess_${Date.now()}`);
  const [dialogue, setDialogue] = useState<DialogueMessage[]>([]);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [isAiResponding, setIsAiResponding] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);

  // Audio recording states
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordSeconds, setRecordSeconds] = useState<number>(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  // Optional manual text input for graceful recovery if learner mic fails
  const [manualText, setManualText] = useState<string>('');
  const [showManualInput, setShowManualInput] = useState<boolean>(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const dialogueEndRef = useRef<HTMLDivElement | null>(null);

  // Helper to convert Blob to Base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Scroll to bottom of dialogue
  useEffect(() => {
    dialogueEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dialogue, isAiResponding]);

  // Clean up audio object URLs on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        window.clearInterval(timerIntervalRef.current);
      }
      turns.forEach((t) => {
        if (t.audio_url) URL.revokeObjectURL(t.audio_url);
      });
    };
  }, []);

  // Initialize conversation with Gemini opening question
  const initConversation = async (topicKey: string, newSession: boolean = false) => {
    setIsInitializing(true);
    setRecordingError(null);
    const sid = newSession ? `sess_${Date.now()}` : sessionId;
    if (newSession) {
      setSessionId(sid);
      setTurns([]);
      setDialogue([]);
    }

    try {
      const res = await startDialogue(topicKey, sid);
      setDialogue([
        {
          speaker: 'ai',
          text: res.response,
          turn_id: res.turn_id,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          topic: res.topic,
          intent: res.intent,
        },
      ]);
    } catch (err: any) {
      // Graceful fallback opening
      setDialogue([
        {
          speaker: 'ai',
          text: "Hello! Welcome to your speaking practice session. What is something you really enjoy doing during your free time?",
          turn_id: 'turn_1',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          topic: topicKey,
          intent: 'opening',
        },
      ]);
    } finally {
      setIsInitializing(false);
    }
  };

  // Trigger initial question on mount
  useEffect(() => {
    initConversation(selectedTopic.topicKey, false);
  }, []);

  // Start recording a new turn
  const startRecordingTurn = async () => {
    setRecordingError(null);
    audioChunksRef.current = [];

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setRecordingError('Microphone recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const audioUrl = URL.createObjectURL(audioBlob);
        const audioBase64 = await blobToBase64(audioBlob);
        const durationSec = Math.max(recordSeconds, 0.5);
        const turnId = `turn_${turns.length + 1}`;

        const newTurn: ConversationTurn = {
          turn_id: turnId,
          audio_blob: audioBlob,
          audio_url: audioUrl,
          audio_base64: audioBase64,
          duration_seconds: durationSec,
          speaker: 'learner',
          prompt_target: speakingMode === 'prompted' ? promptTarget : undefined,
          speaking_mode: speakingMode,
          recorded_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        // Add turn to collection for post-conversation analysis
        setTurns((prev) => [...prev, newTurn]);
        setRecordSeconds(0);

        // Immediate responsive Conversational AI turn (without waiting for heavy phoneme/fluency pipeline)
        await handleLearnerTurnResponse(newTurn);
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordSeconds(0);

      const start = Date.now();
      timerIntervalRef.current = window.setInterval(() => {
        setRecordSeconds(Math.round(((Date.now() - start) / 1000) * 10) / 10);
      }, 100);
    } catch (err: any) {
      setIsRecording(false);
      setRecordingError(err.message || 'Microphone access denied or audio hardware unavailable.');
    }
  };

  // Stop recording current turn
  const stopRecordingTurn = () => {
    if (timerIntervalRef.current) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  // Handle learner's turn response and obtain Gemini's follow-up
  const handleLearnerTurnResponse = async (turn: ConversationTurn, explicitTranscript?: string) => {
    setIsAiResponding(true);

    // Build history for conversational partner
    const historyPayload = dialogue.map((d) => ({
      speaker: d.speaker,
      text: d.text,
      topic: d.topic,
    }));

    try {
      const resp = await respondDialogue({
        session_id: sessionId,
        turn_id: turn.turn_id,
        learner_transcript: explicitTranscript || turn.transcript,
        audio_base64: turn.audio_base64 || undefined,
        history: historyPayload,
        current_topic: selectedTopic.topicKey,
      });

      // Update turn with recognized transcript if retrieved
      if (resp.transcribed_text) {
        turn.transcript = resp.transcribed_text;
        setTurns((prev) =>
          prev.map((t) => (t.turn_id === turn.turn_id ? { ...t, transcript: resp.transcribed_text || t.transcript } : t))
        );
      }

      // Add learner's turn to dialogue UI
      const learnerText = resp.transcribed_text || explicitTranscript || 'Spoken utterance recorded.';
      setDialogue((prev) => [
        ...prev,
        {
          speaker: 'learner',
          text: learnerText,
          turn_id: turn.turn_id,
          timestamp: turn.recorded_at,
          topic: selectedTopic.topicKey,
        },
        {
          speaker: 'ai',
          text: resp.response,
          turn_id: resp.turn_id,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          topic: resp.topic,
          intent: resp.intent,
        },
      ]);
    } catch (err: any) {
      // Graceful recovery: encourage learner to continue without losing session history
      setDialogue((prev) => [
        ...prev,
        {
          speaker: 'learner',
          text: explicitTranscript || 'Audio turn recorded.',
          turn_id: turn.turn_id,
          timestamp: turn.recorded_at,
          topic: selectedTopic.topicKey,
        },
        {
          speaker: 'ai',
          text: "I heard your response! What else can you share about that experience, and how did it make you feel?",
          turn_id: `turn_${turns.length + 1}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          topic: selectedTopic.topicKey,
          intent: 'follow_up',
        },
      ]);
    } finally {
      setIsAiResponding(false);
    }
  };

  // Submit manual text turn (graceful recovery if mic is silent/unavailable)
  const handleManualSubmit = async () => {
    const text = manualText.trim();
    if (!text || isAiResponding) return;

    setManualText('');
    const turnId = `turn_${turns.length + 1}`;
    const syntheticTurn: ConversationTurn = {
      turn_id: turnId,
      duration_seconds: 3.0,
      speaker: 'learner',
      transcript: text,
      speaking_mode: speakingMode,
      recorded_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setTurns((prev) => [...prev, syntheticTurn]);
    await handleLearnerTurnResponse(syntheticTurn, text);
  };

  const removeTurn = (turnId: string) => {
    setTurns((prev) => {
      const target = prev.find((t) => t.turn_id === turnId);
      if (target?.audio_url) URL.revokeObjectURL(target.audio_url);
      return prev.filter((t) => t.turn_id !== turnId);
    });
    setDialogue((prev) => prev.filter((d) => d.turn_id !== turnId));
  };

  const clearAllTurns = () => {
    initConversation(selectedTopic.topicKey, true);
  };

  const handleEndConversation = () => {
    if (turns.length === 0 || isProcessing) return;
    onSessionComplete(turns, speakingMode, promptTarget);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-teal-400" />
            <h2 className="text-base font-semibold text-white tracking-wide">
              Conversational Practice (Gemini 3.5 Flash-Lite)
            </h2>
            <span className="bg-teal-500/10 text-teal-300 text-[10px] font-medium px-2 py-0.5 rounded-full border border-teal-500/20">
              Interactive Dialogue Partner
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Engage in natural back-and-forth conversation. Detailed fluency and pronunciation analysis runs after you conclude.
          </p>
        </div>

        {/* Mode Selector */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs">
            <button
              onClick={() => onSpeakingModeChange('prompted')}
              disabled={isProcessing || isRecording}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                speakingMode === 'prompted'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Prompted Target
            </button>
            <button
              onClick={() => onSpeakingModeChange('spontaneous')}
              disabled={isProcessing || isRecording}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                speakingMode === 'spontaneous'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Spontaneous Flow
            </button>
          </div>
        </div>
      </div>

      {/* Topic Selection */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold text-slate-300">Choose Conversation Focus:</span>
          <button
            onClick={() => clearAllTurns()}
            disabled={isRecording || isProcessing || isInitializing}
            className="flex items-center gap-1 text-[11px] text-teal-400 hover:text-teal-300 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${isInitializing ? 'animate-spin' : ''}`} />
            <span>New Session</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {CONVERSATION_TOPICS.map((topic) => (
            <button
              key={topic.id}
              type="button"
              onClick={() => {
                setSelectedTopic(topic);
                if (speakingMode === 'prompted') {
                  onPromptTargetChange(topic.starterTarget);
                }
                initConversation(topic.topicKey, true);
              }}
              disabled={isRecording || isProcessing || isInitializing}
              className={`p-3 rounded-lg text-left border transition-all text-xs ${
                selectedTopic.id === topic.id
                  ? 'bg-slate-800 border-teal-500/50 shadow-sm'
                  : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 text-slate-400'
              }`}
            >
              <div className="font-semibold text-slate-200 flex items-center justify-between">
                <span>{topic.title}</span>
                {selectedTopic.id === topic.id && <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Target Word (in prompted mode) */}
      {speakingMode === 'prompted' && (
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 flex items-center justify-between gap-3 text-xs">
          <div className="text-slate-400">
            Target Focus Word: <span className="font-mono text-purple-300 font-semibold">/{promptTarget}/</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">Edit target:</span>
            <input
              type="text"
              value={promptTarget}
              onChange={(e) => onPromptTargetChange(e.target.value)}
              placeholder="e.g. think"
              disabled={isRecording || isProcessing}
              className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-white font-mono focus:border-purple-500 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Live Conversational Chat Timeline */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 min-h-[220px] max-h-[360px] overflow-y-auto space-y-3.5">
        {isInitializing ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-2 text-slate-400 text-xs">
            <RefreshCw className="w-5 h-5 text-teal-400 animate-spin" />
            <span>Connecting to Gemini 3.5 Flash-Lite...</span>
          </div>
        ) : (
          dialogue.map((msg, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-3 ${
                msg.speaker === 'learner' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs shadow-md ${
                  msg.speaker === 'ai'
                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                    : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                }`}
              >
                {msg.speaker === 'ai' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>

              <div
                className={`max-w-[80%] rounded-xl p-3.5 text-xs space-y-1 shadow-md ${
                  msg.speaker === 'ai'
                    ? 'bg-slate-900 border border-slate-800 text-slate-100 rounded-tl-none'
                    : 'bg-purple-950/40 border border-purple-800/40 text-purple-100 rounded-tr-none'
                }`}
              >
                <div className="flex items-center justify-between gap-3 text-[10px] text-slate-400 pb-1 border-b border-slate-800/60">
                  <span className="font-semibold text-slate-300">
                    {msg.speaker === 'ai' ? 'Gemini Partner (gemini-3.5-flash-lite)' : 'You (Learner)'}
                  </span>
                  <span>{msg.timestamp}</span>
                </div>
                <p className="text-[13px] leading-relaxed pt-0.5">{msg.text}</p>
              </div>
            </div>
          ))
        )}

        {isAiResponding && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 animate-bounce" />
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-slate-400 flex items-center gap-2 rounded-tl-none">
              <Sparkles className="w-3.5 h-3.5 text-teal-400 animate-spin" />
              <span>Gemini is listening and formulating a follow-up...</span>
            </div>
          </div>
        )}

        <div ref={dialogueEndRef} />
      </div>

      {/* Recording Control Center */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col items-center justify-center space-y-3">
        {isRecording ? (
          <div className="flex flex-col items-center space-y-2">
            <div className="relative">
              <div className="w-14 h-14 rounded-full bg-red-500/20 animate-ping absolute inset-0" />
              <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-500/30 relative">
                <Mic className="w-7 h-7 animate-pulse" />
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold text-white">Recording Your Response...</div>
              <div className="text-[11px] font-mono text-red-400">{recordSeconds.toFixed(1)}s elapsed</div>
            </div>
            <button
              onClick={stopRecordingTurn}
              className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium text-xs flex items-center gap-2 shadow-lg shadow-red-600/30 transition-all"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Done Speaking (Send to Gemini)</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-2 py-1">
            <button
              onClick={startRecordingTurn}
              disabled={isProcessing || isAiResponding || isInitializing}
              className={`w-14 h-14 rounded-full flex items-center justify-center text-slate-950 transition-all shadow-lg ${
                isProcessing || isAiResponding || isInitializing
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-teal-400 hover:bg-teal-300 active:scale-95 shadow-teal-500/20'
              }`}
            >
              <Mic className="w-7 h-7" />
            </button>
            <div className="text-center">
              <div className="text-xs font-medium text-slate-200">
                {turns.length === 0 ? 'Click microphone to speak your answer' : 'Click to answer Gemini'}
              </div>
              <div className="text-[11px] text-slate-500">
                Your speech stays natural. Assessment does not interrupt your conversation.
              </div>
            </div>
          </div>
        )}

        {recordingError && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/40 border border-red-800/50 px-3 py-1.5 rounded-lg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{recordingError}</span>
          </div>
        )}

        {/* Graceful Recovery: Manual Input Toggle if Mic fails */}
        <div className="pt-1 text-center">
          <button
            onClick={() => setShowManualInput(!showManualInput)}
            className="text-[11px] text-slate-500 hover:text-slate-400 underline"
          >
            {showManualInput ? 'Hide manual text input' : 'Microphone issue? Type your response instead'}
          </button>
        </div>

        {showManualInput && (
          <div className="w-full flex items-center gap-2 pt-1">
            <input
              type="text"
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
              placeholder="Type what you want to say to Gemini..."
              disabled={isAiResponding || isProcessing}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
            />
            <button
              onClick={handleManualSubmit}
              disabled={isAiResponding || !manualText.trim()}
              className="px-3 py-2 rounded-lg bg-teal-500 text-slate-950 font-semibold text-xs flex items-center gap-1 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </div>
        )}
      </div>

      {/* Recorded Turns & Conclude Conversation */}
      {turns.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span className="font-semibold text-slate-300">
              Recorded Turns for Post-Conversation Assessment ({turns.length})
            </span>
            <button
              onClick={clearAllTurns}
              disabled={isRecording || isProcessing}
              className="text-slate-500 hover:text-red-400 transition-colors text-[11px]"
            >
              Reset Session
            </button>
          </div>

          <div className="space-y-2">
            {turns.map((turn, idx) => (
              <div
                key={turn.turn_id}
                className="flex items-center justify-between gap-3 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-mono font-semibold text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20 text-[11px]">
                    Turn #{idx + 1}
                  </span>
                  <div className="text-slate-400 flex items-center gap-1 text-[11px]">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>{turn.duration_seconds.toFixed(1)}s</span>
                  </div>
                  {turn.transcript && (
                    <span className="text-slate-300 italic text-[11px] truncate max-w-xs">
                      "{turn.transcript}"
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {turn.audio_url && (
                    <audio
                      src={turn.audio_url}
                      controls
                      className="h-6 w-36 [&::-webkit-media-controls-panel]:bg-slate-900"
                    />
                  )}
                  <button
                    onClick={() => removeTurn(turn.turn_id)}
                    disabled={isRecording || isProcessing}
                    className="text-slate-500 hover:text-red-400 transition-colors p-1"
                    title="Remove turn"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* End Conversation & Begin Assessment Action */}
          <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-400">
              Finished chatting? Conclude the conversation to run full fluency and pronunciation assessment.
            </div>

            <button
              onClick={handleEndConversation}
              disabled={isRecording || isProcessing || turns.length === 0}
              className={`px-5 py-2.5 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-lg ${
                isRecording || isProcessing || turns.length === 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-teal-500 hover:bg-teal-400 active:bg-teal-600 text-slate-950 shadow-teal-500/20'
              }`}
            >
              <span>Conclude & Generate Assessment</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
