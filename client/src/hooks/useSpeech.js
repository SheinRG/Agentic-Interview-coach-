import { useState, useRef, useCallback, useEffect } from 'react';
import { authFetch } from '../utils/authFetch';

/**
 * useSpeech — wraps the browser-native Web Speech API for live feedback
 * AND uses MediaRecorder + Groq Whisper for high-accuracy final results.
 */
export default function useSpeech() {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('Web Speech API is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let currentTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        currentTranscript += event.results[i][0].transcript;
      }
      setTranscript(currentTranscript);
    };

    recognition.onerror = (event) => {
      // Ignore some common "errors" that happen on start/stop
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.error('Speech recognition error:', event.error);
      }
    };

    // Auto-restart if listening was intended but dropped by browser
    recognition.onend = () => {
      if (isListening) {
        try { recognition.start(); } catch (e) {}
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, [isListening]);

  const start = useCallback(async () => {
    setTranscript('');
    setIsListening(true);

    // 1. Start Browser Recognition (for live UI feedback only)
    if (recognitionRef.current) {
      try { 
        recognitionRef.current.start(); 
      } catch (e) {
        console.warn('Recognition already started');
      }
    }

    // 2. Start Raw Audio Recording (for High-Accuracy Whisper)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
    } catch (err) {
      console.error('Mic access error:', err);
    }
  }, []);

  /**
   * stop()
   * Stops recording and returns the HIGH-ACCURACY transcript from Groq.
   */
  const stop = useCallback(() => {
    return new Promise((resolve) => {
      setIsListening(false);
      
      // Stop Browser Recognition
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }

      // Stop MediaRecorder and Process Audio
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          
          // Cleanup media tracks
          mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());

          // Send to Backend for Groq Whisper
          try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'answer.webm');
            
            const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
            const response = await authFetch(`${API}/stt`, {
              method: 'POST',
              body: formData,
            });
            const data = await response.json();
            
            if (data.text) {
              setTranscript(data.text);
              resolve(data.text);
            } else {
              throw new Error('No text returned');
            }
          } catch (err) {
            console.error('Whisper STT fallback to browser:', err);
            // Fallback to whatever the browser caught if upload/API failed
            resolve(transcript);
          }
        };
        mediaRecorderRef.current.stop();
      } else {
        // No recording was active — user skipped this question.
        // Clear transcript and resolve empty to avoid leaking previous answers.
        setTranscript('');
        resolve('');
      }
    });
  }, [transcript]);

  const reset = useCallback(() => {
    setTranscript('');
  }, []);

  return { transcript, isListening, start, stop, reset };
}
