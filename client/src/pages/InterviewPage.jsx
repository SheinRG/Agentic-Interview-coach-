import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import PageWrapper from '../components/ui/PageWrapper';
import Button from '../components/ui/Button';
import useInterview from '../hooks/useInterview';
import useSpeech from '../hooks/useSpeech';
import useTTS from '../hooks/useTTS';
import DraggableCamera from '../components/interview/DraggableCamera';
import { authFetch } from '../utils/authFetch';

export default function InterviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const sessionId = location.state?.sessionId;
  const transcriptContainerRef = useRef(null);
  const webcamRef = useRef(null);

  const {
    questions,
    currentQuestion,
    currentIndex,
    totalQuestions,
    nextQuestion,
    insertNextQuestion,
    modifyNextQuestion,
    loading: sessionLoading,
    answers,
    isAiGenerated,
    isResumeTailored,
    conversationHistory,
  } = useInterview(sessionId);

  const { transcript, isListening, start, stop } = useSpeech();
  const { speak, stopSpeaking, isSpeaking } = useTTS();
  const [submitting, setSubmitting] = useState(false);
  
  const [hint, setHint] = useState('');
  const [hintLoading, setHintLoading] = useState(false);

  const [viewIndex, setViewIndex] = useState(0);
  const [snapshots, setSnapshots] = useState([]);

  // Redirect if no session ID exists
  useEffect(() => {
    if (!sessionId) {
      navigate('/onboarding');
    }
  }, [sessionId, navigate]);

  // Keep viewIndex synced with currentIndex
  useEffect(() => {
    setViewIndex(currentIndex);
  }, [currentIndex]);

  // Auto-speak the question whenever a new one appears
  useEffect(() => {
    if (questions[currentIndex]) {
      speak(questions[currentIndex]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, questions]);

  // Scroll transcript panel to bottom whenever conversation updates
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTo({
        top: transcriptContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [conversationHistory, transcript]);

  // User must manually click NEXT to advance.

  const handleMicClick = async () => {
    if (viewIndex !== currentIndex) return; // Ignore if looking at past questions
    if (isSpeaking) stopSpeaking(); // Stop AI voice if it's still talking
    if (isListening) {
      handleNext(); // Single action submit: Stops mic and moves to next
    } else {
      start();
    }
  };

  const handleEndTest = async () => {
    await stop();
    stopSpeaking();
    navigate('/dashboard');
  };

  const handleReplay = () => {
    if (questions[viewIndex]) {
      speak(questions[viewIndex]);
    }
  };

  const handleHint = async () => {
    if (!questions[viewIndex]) return;
    setHintLoading(true);
    try {
      const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const response = await authFetch(`${API}/sessions/${sessionId}/hint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: questions[viewIndex] }),
      });
      const data = await response.json();
      if (response.ok) {
        setHint(data.hint);
      }
    } catch (err) {
      console.error('Hint error:', err);
    } finally {
      setHintLoading(false);
    }
  };

  const handleNext = async () => {
    // Capture whether the mic was actually active BEFORE stopping it
    const wasListening = isListening;
    const finalTranscript = await stop();
    stopSpeaking();

    const isLast = currentIndex + 1 >= totalQuestions;
    
    // Only use the transcript if the user actually recorded audio for this question.
    // If they skipped (never started the mic), treat as empty string.
    const currentAnswer = wasListening ? (finalTranscript || transcript || '') : '';

    let currentSnapshot = null;
    if (webcamRef.current && webcamRef.current.readyState >= 2) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = webcamRef.current.videoWidth || 640;
        canvas.height = webcamRef.current.videoHeight || 480;
        if (canvas.width > 0) {
          const ctx = canvas.getContext('2d');
          ctx.drawImage(webcamRef.current, 0, 0, canvas.width, canvas.height);
          // Get base64 string without prefix
          currentSnapshot = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
        }
      } catch (e) {
        console.error("Frame capture error:", e);
      }
    }
    
    // Add to state
    const updatedSnapshots = [...snapshots, currentSnapshot];
    setSnapshots(updatedSnapshots);

    if (isLast) {
      setSubmitting(true);
      try {
        const fullAnswers = [...answers, currentAnswer];
        const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
        const response = await authFetch(`${API}/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, answers: fullAnswers, questions, snapshots: updatedSnapshots }),
        });

        if (!response.ok) throw new Error('Failed to generate feedback');
        navigate(`/feedback/${sessionId}`);
      } catch (err) {
        alert('Error submitting interview: ' + err.message);
      } finally {
        setSubmitting(false);
      }
    } else {
      setHint(''); // Clear hint for next question
      setSubmitting(true);

      // Track the actual next question text to pass to conversation history
      let actualNextQuestionText = null;

      try {
        const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
        
        // 1. Fetch conversational reaction
        const reactionRes = await authFetch(`${API}/sessions/${sessionId}/reaction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: questions[currentIndex], answer: currentAnswer }),
        });
        const reactionData = reactionRes.ok ? await reactionRes.json() : { reaction: '' };
        const reactionText = reactionData.reaction ? (reactionData.reaction + " ") : "Okay. ";

        // 2. Decide on Follow-up
        let followupText = null;
        if (currentAnswer && currentAnswer.length > 20 && totalQuestions < 8 && Math.random() > 0.5) {
          const followupRes = await authFetch(`${API}/sessions/${sessionId}/followup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: questions[currentIndex], answer: currentAnswer }),
          });
          const followupData = followupRes.ok ? await followupRes.json() : null;
          if (followupData && followupData.followup) {
            followupText = reactionText + followupData.followup;
          }
        }

        // 3. Apply the changes and track the actual question text
        if (followupText) {
          insertNextQuestion(followupText);
          actualNextQuestionText = followupText;
        } else {
          // If no follow-up, prepend reaction to the adjacent existing question
          modifyNextQuestion(reactionText);
          actualNextQuestionText = reactionText + ' ' + (questions[currentIndex + 1] || '');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setSubmitting(false);
        // Pass the explicit next question text so the conversation log matches
        // what's actually displayed, bypassing the stale questions closure
        nextQuestion(currentAnswer, actualNextQuestionText);
      }
    }
  };


  if (sessionLoading) {
    return (
      <PageWrapper className="flex items-center justify-center">
        <p className="text-surface-400">Loading interview questions...</p>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper className="flex flex-col min-h-screen lg:h-screen lg:overflow-hidden !pt-0 !pb-0">
      {/* ── Top bar ───────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 sm:py-5 border-b border-[#222] bg-[#111]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2 border border-[#333] px-3 py-1.5 rounded-full bg-[#1A1A1A]">
          <div className="w-2 h-2 rounded-full bg-[#E8563B] animate-pulse" />
          <span className="text-[10px] sm:text-xs font-bold tracking-[0.2em] text-[#aaa]">
            Q{currentIndex + 1} OF {totalQuestions}
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Speaking indicator */}
          {isSpeaking && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1.5 border border-[#2a3a2a] px-3 py-1.5 rounded-full bg-[#1a2a1a] hidden sm:flex"
            >
              <div className="flex items-center gap-0.5">
                <div className="w-1 h-3 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                <div className="w-1 h-4 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                <div className="w-1 h-2 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-[10px] font-bold tracking-[0.2em] text-green-400">
                COACH SPEAKING
              </span>
            </motion.div>
          )}
          <div className="flex items-center gap-2 border border-[#333] px-3 py-1.5 rounded-full bg-[#1A1A1A]">
            <span className={`text-[9px] sm:text-[10px] font-bold tracking-[0.1em] sm:tracking-[0.2em] ${
              isResumeTailored ? 'text-purple-400' : isAiGenerated ? 'text-green-400' : 'text-blue-400'
            }`}>
              {isResumeTailored ? '📄 TAILORED' : isAiGenerated ? '✨ AI' : '🛠️ DEMO'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Main content — two-panel layout ──────────── */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 lg:gap-8 px-4 sm:px-6 py-6 pb-20 lg:pb-4 max-w-7xl mx-auto w-full min-h-0">

        {/* ── Left: Live Stage ──────────────────────── */}
        <div className="flex-1 flex flex-col relative z-10 min-h-[50vh] lg:min-h-0 py-4 lg:py-0 overflow-y-auto overflow-x-hidden scrollbar-hide">
          <div className="w-full flex-1 flex flex-col items-center justify-center my-auto min-h-max gap-6 lg:gap-8 py-4">
          <motion.div
            key={viewIndex}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center w-full px-2 sm:px-6 max-w-3xl"
          >
            {viewIndex < currentIndex && (
              <div className="mb-4 inline-flex items-center gap-2 px-3 py-1 bg-[#E8563B]/20 border border-[#E8563B]/50 rounded-full">
                <span className="text-[10px] font-bold tracking-[0.2em] text-[#E8563B] uppercase">Reviewing Previous</span>
              </div>
            )}

            <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-white leading-relaxed tracking-tight px-2 sm:px-4">
              "{questions[viewIndex] || currentQuestion}"
            </p>

            {viewIndex === currentIndex && (
              <div className="flex items-center justify-center gap-3 mt-5">
                <button
                  onClick={handleReplay}
                  disabled={isSpeaking}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-[0.15em] bg-[#1a1a1a] text-[#888] border border-[#333] hover:text-[#E8563B] hover:border-[#E8563B]/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                  </svg>
                  REPLAY
                </button>
                <button
                  onClick={handleHint}
                  disabled={hintLoading || !!hint}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-[0.15em] bg-[#1a1a1a] text-[#888] border border-[#333] hover:text-[#E8563B] hover:border-[#E8563B]/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.829 1.508-2.311a5.112 5.112 0 002.13-2.186 5.333 5.333 0 00-3.321-7.234 5.352 5.352 0 00-4.004.148 5.333 5.333 0 00-3.321 7.234c.732 1.488 2.13 2.186 2.13 2.186v.192c0 1.25.962 2.348 2.213 2.45h2.124A2.49 2.49 0 0014.25 18z" />
                  </svg>
                  {hintLoading ? 'THINKING...' : 'HINT'}
                </button>
              </div>
            )}
          </motion.div>

          {/* Hint Display */}
          {hint && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 max-w-md bg-[#E8563B]/10 border border-[#E8563B]/30 rounded-xl p-4"
            >
              <div className="text-[10px] font-bold tracking-[0.2em] text-[#E8563B] mb-2">COACH'S HINT</div>
              <p className="text-sm font-medium text-white/90 leading-relaxed whitespace-pre-wrap">{hint}</p>
            </motion.div>
          )}

          {/* Microphone button */}
          <div className="flex flex-col items-center gap-6 mt-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleMicClick}
              disabled={viewIndex !== currentIndex}
              className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex flex-col items-center justify-center gap-1 transition-all shadow-2xl ${
                viewIndex !== currentIndex
                  ? 'opacity-20 grayscale pointer-events-none'
                  : isListening
                  ? 'bg-[#E8563B] text-white shadow-[0_0_40px_rgba(232,86,59,0.5)] scale-110'
                  : 'bg-[#1a1a1a] border border-[#333] text-[#888] hover:border-[#E8563B] hover:text-[#E8563B]'
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-8 h-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                />
              </svg>
            </motion.button>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => setViewIndex(Math.max(0, viewIndex - 1))}
              disabled={viewIndex === 0}
              className="w-12 h-12 rounded-xl bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-zinc-500 hover:text-white hover:border-[#E8563B] transition-all disabled:opacity-20"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            </button>

            {viewIndex === currentIndex ? (
              <Button 
                variant="primary" 
                onClick={handleNext} 
                disabled={submitting}
                className="min-w-[200px]"
              >
                {submitting ? 'PROCESSING...' : currentIndex + 1 < totalQuestions ? 'NEXT' : 'SUBMIT SIMULATION'}
              </Button>
            ) : (
              <Button 
                variant="primary" 
                onClick={() => setViewIndex(currentIndex)}
                className="min-w-[200px]"
              >
                BACK TO CURRENT
              </Button>
            )}

            <button
              onClick={() => setViewIndex(Math.min(currentIndex, viewIndex + 1))}
              disabled={viewIndex === currentIndex}
              className="w-12 h-12 rounded-xl bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-zinc-500 hover:text-white hover:border-[#E8563B] transition-all disabled:opacity-20"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
            </button>

            <div className="w-px h-8 bg-[#333] mx-2"></div>

            <button
               onClick={handleEndTest}
               title="End Test without grading"
               className="w-12 h-12 rounded-xl bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-red-500 hover:text-white hover:bg-red-500 hover:border-red-500 transition-all font-bold"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          </div>
        </div>

        {/* ── Right: Conversation Transcript ─────────── */}
        <div className="w-full lg:w-[420px] flex-1 lg:h-full flex flex-col bg-[#111]/80 backdrop-blur-xl rounded-3xl border border-[#222] overflow-hidden shadow-2xl relative min-h-[400px] lg:min-h-0">
          {/* Transcript header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#222]">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] font-bold tracking-[0.2em] text-[#888]">
                CONVERSATION LOG
              </span>
            </div>
            <span className="text-[10px] font-mono text-[#555]">
              {conversationHistory.length} messages
            </span>
          </div>

          {/* Transcript messages */}
          <div 
            ref={transcriptContainerRef}
            className="flex-1 overflow-y-auto px-5 py-6 space-y-5 scrollbar-thin pb-8"
            style={{ 
              maskImage: 'linear-gradient(to bottom, transparent 0%, black 5%, black 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 5%, black 100%)'
            }}
          >
            <AnimatePresence>
              {conversationHistory.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                      msg.role === 'coach'
                        ? 'bg-gradient-to-br from-[#E8563B] to-[#C4412A] text-white'
                        : 'bg-gradient-to-br from-[#3B82F6] to-[#2563EB] text-white'
                    }`}
                  >
                    {msg.role === 'coach' ? 'AI' : 'U'}
                  </div>

                  {/* Message bubble */}
                  <div
                    className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'coach'
                        ? 'bg-[#1a1a1a] border border-[#2a2a2a] text-white/90 rounded-tl-sm'
                        : 'bg-[#1a2a4a] border border-[#2a3a5a] text-blue-100 rounded-tr-sm'
                    }`}
                  >
                    <div className="text-[9px] font-bold tracking-[0.2em] text-[#666] mb-1.5">
                      {msg.role === 'coach' ? '🤖 AI COACH' : '👤 YOU'}
                    </div>
                    {msg.text}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Show live typing if user is recording */}
            {isListening && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-3 flex-row-reverse"
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold bg-gradient-to-br from-[#3B82F6] to-[#2563EB] text-white">
                  U
                </div>
                <div className="max-w-[85%] p-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed bg-[#1a2a4a]/60 border border-[#2a3a5a]/50 text-blue-200/70">
                  <div className="text-[9px] font-bold tracking-[0.2em] text-[#666] mb-1.5 flex items-center gap-1.5">
                    👤 YOU
                    <span className="text-[#E8563B] animate-pulse">● RECORDING</span>
                  </div>
                  {transcript ? transcript : <span className="opacity-50 italic">Listening...</span>}
                </div>
              </motion.div>
            )}

          </div>
        </div>
      </div>

      {/* ── ElevenLabs Attribution (required by free tier) ── */}
      <div className="flex items-center justify-center py-3 border-t border-[#222] bg-[#111]/80">
        <a
          href="https://elevenlabs.io"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-[#555] hover:text-[#888] transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
          </svg>
          Voiced by ElevenLabs
        </a>
      </div>

      {/* Draggable Webcam Component */}
      <DraggableCamera ref={webcamRef} />
    </PageWrapper>
  );
}
