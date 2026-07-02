"use client";

import { useEffect, useRef, useState } from "react";

// A mic button that dictates into the Ask Hearth box using the browser's
// built-in Web Speech API (no backend, no API key). Lets a homeowner ask
// hands-free while standing in front of the problem, the moment they would
// normally reach for Google. Renders nothing on browsers without support.
//
// It listens continuously until tapped again, and commits only FINALIZED
// speech segments (not interim guesses), reading each new segment from
// resultIndex. The old version read only the first result and stopped after a
// short pause, which truncated longer questions and dropped words.
export default function VoiceButton({
  onText,
  disabled,
}: {
  onText: (text: string) => void;
  disabled?: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  // True while the user means to keep dictating, so an automatic end event can
  // restart recognition instead of cutting them off mid sentence.
  const wantOnRef = useRef(false);

  useEffect(() => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);

    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e: any) => {
      // Append only the segments that just became final, starting at
      // resultIndex, so we never double count and never commit interim guesses.
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal && res[0]?.transcript) finalText += res[0].transcript;
      }
      const trimmed = finalText.trim();
      if (trimmed) onText(trimmed);
    };

    rec.onend = () => {
      // Chrome ends the session after a pause even in continuous mode. If the
      // user still wants to dictate, restart so their next words are captured.
      if (wantOnRef.current) {
        try {
          rec.start();
          return;
        } catch {
          /* fall through to stop */
        }
      }
      setListening(false);
    };

    rec.onerror = (e: any) => {
      // A brief silence ("no-speech") is not a real failure; keep going. Any
      // other error stops cleanly.
      if (e?.error === "no-speech" || e?.error === "aborted") return;
      wantOnRef.current = false;
      setListening(false);
    };

    recRef.current = rec;
    return () => {
      wantOnRef.current = false;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!supported) return null;

  function toggle() {
    const rec = recRef.current;
    if (!rec) return;
    if (listening) {
      wantOnRef.current = false;
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      setListening(false);
    } else {
      wantOnRef.current = true;
      try {
        rec.start();
        setListening(true);
      } catch {
        /* already started */
      }
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      title={listening ? "Listening. Tap to stop." : "Speak your question"}
      className={`flex items-center rounded-lg border px-2 text-lg disabled:opacity-50 ${
        listening
          ? "animate-pulse border-red-300 bg-red-50 text-red-600"
          : "border-stone-200 text-stone-500 hover:border-hearth-400 hover:text-hearth-700"
      }`}
    >
      🎙
    </button>
  );
}
