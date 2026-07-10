import { useState, useCallback, useRef, useEffect } from 'react';
import { authFetch } from '../utils/authFetch';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * useTTS — Text-to-Speech hook powered by ElevenLabs via our backend.
 * Falls back to the browser's native speechSynthesis if the API fails.
 */
export default function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef(null);
  const abortRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
      window.speechSynthesis?.cancel();
    };
  }, []);

  /**
   * Fallback: use the browser's built-in (robotic) speech synthesis.
   */
  const speakWithBrowser = useCallback((text) => {
    if (!window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.lang = 'en-US';

    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) =>
        v.lang.startsWith('en') &&
        (v.name.includes('Google') || v.name.includes('Microsoft'))
    );
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, []);

  /**
   * Primary: call our ElevenLabs-powered backend and play the returned audio.
   */
  const speak = useCallback(
    async (text) => {
      if (!text) return;

      // Stop anything currently playing
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      window.speechSynthesis?.cancel();

      // Abort any in-flight fetch
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        setIsSpeaking(true);

        const response = await authFetch(`${API_BASE_URL}/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`TTS API returned ${response.status}`);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
          audioRef.current = null;
        };

        audio.onerror = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
          audioRef.current = null;
        };

        await audio.play();
      } catch (err) {
        if (err.name === 'AbortError') {
          setIsSpeaking(false);
          return;
        }
        console.warn('⚠️ ElevenLabs TTS failed, falling back to browser voice:', err.message);
        speakWithBrowser(text);
      }
    },
    [speakWithBrowser]
  );

  /**
   * Stop any currently playing speech immediately.
   */
  const stopSpeaking = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  return { speak, stopSpeaking, isSpeaking };
}
