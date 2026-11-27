import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Square,
  Sparkles,
  Send,
  RefreshCw,
  Bot,
  User,
  Lightbulb,
  BookOpen,
  CheckCircle2,
  X,
  Copy,
  Check,
  Compass,
  Briefcase,
  GraduationCap,
  Coffee,
  MessageSquare,
  Sparkle,
} from 'lucide-react';
import type {
  ConversationTurn,
  DialogueMessage,
  ConversationalMode,
  ExpressionAssistResponse,
} from '../types';
import {
  startDialogue,
  respondDialogue,
  requestExpressionAssist,
} from '../services/api';

interface ConversationRecorderCardProps {
  onSessionComplete: (
    turns: ConversationTurn[],
    topic: string,
    mode: ConversationalMode
  ) => void;
  isProcessing: boolean;
}

export interface ConversationCategoryOption {
  id: string;
  topicKey: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
}

const CONVERSATION_CATEGORIES: ConversationCategoryOption[] = [
  {
    id: 'everyday',
    topicKey: 'everyday_conversations',
    title: 'Everyday Conversations',
    subtitle: 'Routines, Hobbies, Food & Friends',
    description: 'Casual chat about your daily life, weekend plans, favorite meals, and hobbies.',
    icon: <Coffee className="w-4 h-4 text-amber-400" />,
  },
  {
    id: 'school',
    topicKey: 'school_and_academic',
    title: 'School & Academic Life',
    subtitle: 'Classes, Projects & Studying',
    description: 'Practice discussing assignments, presentations, study habits, and favorite subjects.',
    icon: <GraduationCap className="w-4 h-4 text-sky-400" />,
  },
  {
    id: 'work',
    topicKey: 'work_and_professional',
    title: 'Work & Professional Life',
    subtitle: 'Meetings, Updates & Teamwork',
    description: 'Practice communicating workplace updates, career goals, and collaborative ideas.',
    icon: <Briefcase className="w-4 h-4 text-emerald-400" />,
  },
  {
    id: 'opinions',
    topicKey: 'opinions_and_discussions',
    title: 'Opinions & Discussions',
    subtitle: 'Perspectives, Trends & Ideas',
    description: 'Share your viewpoint on modern technology, social trends, and different perspectives.',
    icon: <MessageSquare className="w-4 h-4 text-purple-400" />,
  },
  {
    id: 'storytelling',
    topicKey: 'storytelling_and_experiences',
    title: 'Storytelling & Experiences',
    subtitle: 'Memorable Moments & Journeys',
    description: 'Tell stories about memorable trips, overcoming challenges, or personal achievements.',
    icon: <Compass className="w-4 h-4 text-teal-400" />,
  },
  {
    id: 'situational',
    topicKey: 'situational_practice',
    title: 'Situational Practice',
    subtitle: 'Ordering, Directions & Daily Tasks',
    description: 'Real-world scenarios like ordering at a cafe, making appointments, or asking directions.',
    icon: <Sparkle className="w-4 h-4 text-pink-400" />,
  },
];

export const ConversationRecorderCard: React.FC<ConversationRecorderCardProps> = ({
  onSessionComplete,
  isProcessing,
}) => {
  // Session configuration
  const [selectedCategory, setSelectedCategory] = useState<ConversationCategoryOption>(
    CONVERSATION_CATEGORIES[0]
  );
  const [conversationalMode, setConversationalMode] = useState<ConversationalMode>('natural');
  const [sessionId, setSessionId] = useState<string>(() => `sess_${Date.now()}`);

  // Dialogue & Turns
  const [dialogue, setDialogue] = useState<DialogueMessage[]>([]);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [isAiResponding, setIsAiResponding] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);

  // Audio recording states
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordSeconds, setRecordSeconds] = useState<number>(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  // Manual text input
  const [manualText, setManualText] = useState<string>('');
  const [showManualInput, setShowManualInput] = useState<boolean>(false);

  // Expression Assistance Panel
  const [showAssistPanel, setShowAssistPanel] = useState<boolean>(false);
  const [assistType, setAssistType] = useState<
    'help_express' | 'how_else' | 'explain_word' | 'expand_answer' | 'give_example'
  >('how_else');
  const [assistQuery, setAssistQuery] = useState<string>('');
  const [isAssisting, setIsAssisting] = useState<boolean>(false);
  const [assistResult, setAssistResult] = useState<ExpressionAssistResponse | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

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
  const initConversation = async (
    category: ConversationCategoryOption,
    mode: ConversationalMode,
    newSession: boolean = false
  ) => {
    setIsInitializing(true);
    setRecordingError(null);
    const sid = newSession ? `sess_${Date.now()}` : sessionId;
    if (newSession) {
      setSessionId(sid);
      setTurns([]);
      setDialogue([]);
    }

    try {
      const res = await startDialogue(category.topicKey, sid, mode);
      setDialogue([
        {
          speaker: 'ai',
          text: res.response,
          turn_id: res.turn_id,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          topic: res.topic,
          intent: res.intent,
          expression_tip: res.expression_tip,
        },
      ]);
    } catch {
      // Graceful fallback opening
      setDialogue([
        {
          speaker: 'ai',
          text: `Hello! Welcome to Articula. I'm excited to practice English with you today. To get us started, what is something about ${category.title.toLowerCase()} that you find interesting?`,
          turn_id: 'turn_1',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          topic: category.topicKey,
          intent: 'opening',
        },
      ]);
    } finally {
      setIsInitializing(false);
    }
  };

  // Trigger initial question on mount
  useEffect(() => {
    initConversation(selectedCategory, conversationalMode, false);
  }, []);

  // Switch category
  const handleSelectCategory = (cat: ConversationCategoryOption) => {
    setSelectedCategory(cat);
    initConversation(cat, conversationalMode, true);
  };

  // Switch mode
  const handleSelectMode = (mode: ConversationalMode) => {
    setConversationalMode(mode);
    initConversation(selectedCategory, mode, true);
  };

  // Start recording a new turn
  const startRecordingTurn = async () => {
    setRecordingError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
        else mimeType = '';
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        const durationSec = recordSeconds;
        await submitLearnerTurn(audioBlob, durationSec);
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordSeconds(0);

      timerIntervalRef.current = window.setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone error:', err);
      setRecordingError('Microphone access denied. You can also type your response below.');
      setShowManualInput(true);
    }
  };

  // Stop recording turn
  const stopRecordingTurn = () => {
    if (timerIntervalRef.current) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Submit learner spoken turn to Gemini partner
  const submitLearnerTurn = async (audioBlob: Blob, durationSec: number) => {
    setIsAiResponding(true);
    const turnIndex = turns.length + 1;
    const turnId = `turn_${turnIndex}`;
    const audioUrl = URL.createObjectURL(audioBlob);

    try {
      const base64Audio = await blobToBase64(audioBlob);

      // Conversational history format
      const historyContext = dialogue.map((d) => ({
        speaker: d.speaker,
        text: d.text,
        topic: d.topic,
      }));

      // Call Gemini partner
      const partnerRes = await respondDialogue({
        session_id: sessionId,
        turn_id: turnId,
        audio_base64: base64Audio,
        history: historyContext,
        current_topic: selectedCategory.topicKey,
        mode: conversationalMode,
      });

      const spokenText = partnerRes.transcribed_text || `[Spoken English Turn (${durationSec}s)]`;

      // Append learner message
      const learnerMsg: DialogueMessage = {
        speaker: 'learner',
        text: spokenText,
        turn_id: turnId,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      // Append AI follow-up message
      const aiMsg: DialogueMessage = {
        speaker: 'ai',
        text: partnerRes.response,
        turn_id: partnerRes.turn_id,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        topic: partnerRes.topic,
        intent: partnerRes.intent,
        expression_tip: partnerRes.expression_tip,
      };

      setDialogue((prev) => [...prev, learnerMsg, aiMsg]);

      // Save recorded turn
      const newTurn: ConversationTurn = {
        turn_id: turnId,
        audio_blob: audioBlob,
        audio_base64: base64Audio,
        audio_url: audioUrl,
        duration_seconds: durationSec || 1.0,
        speaker: 'learner',
        speaking_mode: 'spontaneous',
        transcript: partnerRes.transcribed_text || '',
        recorded_at: new Date().toISOString(),
      };

      setTurns((prev) => [...prev, newTurn]);
    } catch (err: any) {
      console.error('Dialogue error:', err);
      // Graceful fallback response
      setDialogue((prev) => [
        ...prev,
        {
          speaker: 'learner',
          text: `[Spoken English Turn (${durationSec}s)]`,
          turn_id: turnId,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        {
          speaker: 'ai',
          text: "I heard your spoken response! You expressed yourself clearly. To keep our conversation moving, what else would you add to that?",
          turn_id: `turn_${turnIndex + 1}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          topic: selectedCategory.topicKey,
        },
      ]);
    } finally {
      setIsAiResponding(false);
      setRecordSeconds(0);
    }
  };

  // Submit manual typed turn
  const handleSendManualText = async () => {
    if (!manualText.trim() || isAiResponding) return;

    const textToSend = manualText.trim();
    setManualText('');
    setIsAiResponding(true);
    const turnIndex = turns.length + 1;
    const turnId = `turn_${turnIndex}`;

    try {
      const historyContext = dialogue.map((d) => ({
        speaker: d.speaker,
        text: d.text,
        topic: d.topic,
      }));

      const partnerRes = await respondDialogue({
        session_id: sessionId,
        turn_id: turnId,
        learner_transcript: textToSend,
        history: historyContext,
        current_topic: selectedCategory.topicKey,
        mode: conversationalMode,
      });

      const learnerMsg: DialogueMessage = {
        speaker: 'learner',
        text: textToSend,
        turn_id: turnId,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      const aiMsg: DialogueMessage = {
        speaker: 'ai',
        text: partnerRes.response,
        turn_id: partnerRes.turn_id,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        topic: partnerRes.topic,
        intent: partnerRes.intent,
        expression_tip: partnerRes.expression_tip,
      };

      setDialogue((prev) => [...prev, learnerMsg, aiMsg]);

      const newTurn: ConversationTurn = {
        turn_id: turnId,
        audio_blob: new Blob(),
        audio_url: '',
        duration_seconds: Math.max(2.0, textToSend.split(' ').length * 0.4),
        speaker: 'learner',
        speaking_mode: 'spontaneous',
        transcript: textToSend,
        recorded_at: new Date().toISOString(),
      };

      setTurns((prev) => [...prev, newTurn]);
    } catch (err: any) {
      console.error('Manual turn error:', err);
    } finally {
      setIsAiResponding(false);
    }
  };

  // Request Expression Assistance
  const handleRequestAssist = async (type: typeof assistType, text: string) => {
    if (!text.trim()) return;
    setIsAssisting(true);
    setAssistType(type);
    try {
      const res = await requestExpressionAssist({
        assist_type: type,
        learner_input: text.trim(),
        context: selectedCategory.title,
      });
      setAssistResult(res);
      setShowAssistPanel(true);
    } catch (err: any) {
      console.error('Assist error:', err);
    } finally {
      setIsAssisting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleFinishAndReflect = () => {
    if (turns.length === 0) return;
    onSessionComplete(turns, selectedCategory.topicKey, conversationalMode);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-6">
      {/* Companion Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-teal-500/10 border border-teal-500/20 rounded-lg text-teal-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">
                Articula AI Conversation Companion
              </h2>
              <p className="text-xs text-slate-400">
                Your supportive partner for practicing English conversation naturally.
              </p>
            </div>
          </div>
        </div>

        {/* Conversational Mode Selector */}
        <div className="flex items-center gap-2 bg-slate-800/80 p-1.5 rounded-lg border border-slate-700/60">
          <span className="text-[11px] font-semibold text-slate-400 px-2 uppercase tracking-wider">Mode:</span>
          {(['natural', 'gentle_guidance', 'learning_support'] as ConversationalMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => handleSelectMode(mode)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                conversationalMode === mode
                  ? 'bg-teal-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              {mode === 'natural'
                ? 'Natural'
                : mode === 'gentle_guidance'
                ? 'Gentle Guidance'
                : 'Learning Support'}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation Categories */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
            Choose a Conversation Topic:
          </span>
          <span>Click to switch topic & start a fresh dialogue</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {CONVERSATION_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleSelectCategory(cat)}
              className={`p-2.5 rounded-lg border text-left flex flex-col justify-between transition-all ${
                selectedCategory.id === cat.id
                  ? 'bg-teal-500/10 border-teal-500/40 text-teal-300 shadow-sm shadow-teal-500/10'
                  : 'bg-slate-800/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                {cat.icon}
                <span className="text-xs font-semibold leading-tight line-clamp-1">{cat.title}</span>
              </div>
              <span className="text-[10px] text-slate-500 line-clamp-2 leading-tight">
                {cat.subtitle}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Dialogue Box */}
      <div className="border border-slate-800 rounded-xl bg-slate-950/60 flex flex-col overflow-hidden h-[380px]">
        {/* Dialogue Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs sm:text-sm">
          {isInitializing ? (
            <div className="flex items-center justify-center h-full text-slate-400 gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-teal-400" />
              <span>Connecting with your conversation companion...</span>
            </div>
          ) : dialogue.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-1">
              <Bot className="w-8 h-8 text-slate-600 mb-1" />
              <p>Ready to begin! Your companion will start the conversation.</p>
            </div>
          ) : (
            dialogue.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3 max-w-[85%] ${
                  msg.speaker === 'learner' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    msg.speaker === 'learner'
                      ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                      : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  }`}
                >
                  {msg.speaker === 'learner' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                <div className="space-y-1.5">
                  <div
                    className={`p-3 rounded-xl leading-relaxed ${
                      msg.speaker === 'learner'
                        ? 'bg-teal-600 text-white rounded-tr-none'
                        : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-tl-none'
                    }`}
                  >
                    <p>{msg.text}</p>
                  </div>

                  {/* Optional expression tip from companion */}
                  {msg.expression_tip && (
                    <div className="bg-amber-950/40 border border-amber-500/30 text-amber-300 text-xs px-2.5 py-1.5 rounded-lg flex items-start gap-1.5">
                      <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                      <span>{msg.expression_tip}</span>
                    </div>
                  )}

                  <div
                    className={`text-[10px] text-slate-500 flex items-center gap-1.5 ${
                      msg.speaker === 'learner' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <span>{msg.timestamp || ''}</span>
                    {msg.intent && (
                      <span className="capitalize px-1.5 py-0.2 bg-slate-800 rounded text-slate-400">
                        {msg.intent.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}

          {isAiResponding && (
            <div className="flex gap-3 max-w-[85%] mr-auto items-center text-xs text-teal-400">
              <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-700/60 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                <span>Companion is thinking & listening...</span>
              </div>
            </div>
          )}
          <div ref={dialogueEndRef} />
        </div>

        {/* Quick Expression Assistance Toolbar */}
        <div className="bg-slate-900 border-t border-slate-800/80 px-4 py-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
            <Lightbulb className="w-3 h-3 text-amber-400" /> Expression Help:
          </span>
          <button
            onClick={() => {
              setShowAssistPanel(true);
              setAssistType('how_else');
            }}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-all"
          >
            💡 How else can I say this?
          </button>
          <button
            onClick={() => {
              setShowAssistPanel(true);
              setAssistType('help_express');
            }}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-all"
          >
            ✍️ Help me express an idea
          </button>
          <button
            onClick={() => {
              setShowAssistPanel(true);
              setAssistType('expand_answer');
            }}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-all"
          >
            ✨ Help me expand my answer
          </button>
        </div>
      </div>

      {/* Expression Assistance Drawer/Modal */}
      {showAssistPanel && (
        <div className="bg-slate-850 border border-teal-500/30 rounded-xl p-4 space-y-3 bg-slate-900/95 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-teal-400" />
              <h3 className="text-sm font-semibold text-white">English Expression Assistant</h3>
            </div>
            <button
              onClick={() => setShowAssistPanel(false)}
              className="text-slate-400 hover:text-white p-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 text-xs">
            {[
              { id: 'how_else', label: 'How else can I say this?' },
              { id: 'help_express', label: 'Help me express this' },
              { id: 'explain_word', label: 'What does this word mean?' },
              { id: 'expand_answer', label: 'Help me expand my answer' },
              { id: 'give_example', label: 'Give me an example' },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setAssistType(opt.id as any)}
                className={`px-2.5 py-1 rounded transition-all ${
                  assistType === opt.id
                    ? 'bg-teal-500 text-slate-950 font-semibold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={assistQuery}
              onChange={(e) => setAssistQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRequestAssist(assistType, assistQuery)}
              placeholder="Type a word or thought you want help expressing..."
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
            />
            <button
              onClick={() => handleRequestAssist(assistType, assistQuery)}
              disabled={isAssisting || !assistQuery.trim()}
              className="px-4 py-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-slate-950 font-semibold text-xs rounded-lg flex items-center gap-1.5"
            >
              {isAssisting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>Get Phrasing</span>
            </button>
          </div>

          {/* Assist Results */}
          {assistResult && (
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 space-y-2 text-xs">
              <p className="font-semibold text-teal-300">{assistResult.primary_suggestion}</p>

              {assistResult.natural_alternatives.length > 0 && (
                <div className="space-y-1">
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Natural Ways to Say It:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {assistResult.natural_alternatives.map((alt, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded"
                      >
                        <span className="text-slate-300">{alt}</span>
                        <button
                          onClick={() => copyToClipboard(alt)}
                          title="Copy alternative"
                          className="text-slate-400 hover:text-white ml-2"
                        >
                          {copiedText === alt ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {assistResult.example_usage && (
                <div className="text-slate-400 italic bg-slate-900/50 p-2 rounded">
                  <span className="font-semibold text-slate-300 not-italic">Example: </span>
                  "{assistResult.example_usage}"
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recording & Input Controls */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-950/50 border border-slate-800/80 p-3.5 rounded-xl">
          {/* Main Record Spoken Turn Button */}
          <div className="flex items-center gap-3">
            {!isRecording ? (
              <button
                onClick={startRecordingTurn}
                disabled={isAiResponding || isProcessing}
                className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-slate-950 font-bold text-sm flex items-center gap-2 shadow-lg shadow-teal-500/20 transition-all"
              >
                <Mic className="w-4 h-4" />
                <span>Speak English Response</span>
              </button>
            ) : (
              <button
                onClick={stopRecordingTurn}
                className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-rose-500/20 animate-pulse transition-all"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>Stop Speaking ({recordSeconds}s)</span>
              </button>
            )}

            {isRecording && (
              <div className="flex items-center gap-2 text-xs text-rose-400">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                <span>Listening to your voice...</span>
              </div>
            )}
          </div>

          {/* Fallback & Wrap-up Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowManualInput(!showManualInput)}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700/60"
            >
              {showManualInput ? 'Hide Typing' : 'Type Instead'}
            </button>

            <button
              onClick={handleFinishAndReflect}
              disabled={turns.length === 0 || isProcessing}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Finish & Reflect ({turns.length} turns)</span>
            </button>
          </div>
        </div>

        {/* Manual typed turn input */}
        {showManualInput && (
          <div className="flex gap-2">
            <input
              type="text"
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendManualText()}
              placeholder="Type your response to continue the conversation in English..."
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
            />
            <button
              onClick={handleSendManualText}
              disabled={!manualText.trim() || isAiResponding}
              className="px-4 py-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-slate-950 font-semibold text-xs rounded-lg flex items-center gap-1"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </div>
        )}

        {recordingError && (
          <div className="text-xs text-rose-400 bg-rose-950/30 border border-rose-500/20 p-2 rounded">
            {recordingError}
          </div>
        )}
      </div>
    </div>
  );
};
