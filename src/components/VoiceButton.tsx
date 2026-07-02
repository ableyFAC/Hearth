"use client";

import { useEffect, useRef, useState } from "react";

// A mic button that dictates into the Ask Hearth box using the browser's
// built-in Web Speech API (no backend, no API key). Lets a homeowner ask
// hands-free while standing in front of the problem - the moment they'd
// normally reach for Google. Renders nothing on browsers without support.
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

  useEffect(() => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      const text = e.results?.[0]?.[0]?.transcript;
      if (text) onText(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    return () => {
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
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      setListening(false);
    } else {
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
      title={listening ? "Listening… tap to stop" : "Speak your question"}
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
