"use client";

import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";

// A mic button that dictates into the Ask Hearth box. Two modes:
//
// 1. "speech": the browser's built-in Web Speech API (fast, free). It streams
//    INTERIM words into a small live bubble above the button so the homeowner
//    sees their words appear the moment they speak, and commits finalized
//    segments via onText. Chrome's implementation ships audio to Google's
//    speech servers, so it dies with a "network" error in Brave, Electron
//    shells, and on some networks even though the mic itself works fine.
// 2. "recorder": getUserMedia + MediaRecorder, then POST /api/transcribe
//    (Gemini) for the transcript. This is the primary mode when
//    SpeechRecognition doesn't exist (Firefox), and the speech mode switches
//    to it transparently on a "network" error, so the button keeps working
//    instead of silently picking up nothing.
//
// Errors (mic blocked, no mic, transcription failed) surface as a short
// message in the same bubble instead of being swallowed. Only when neither
// SpeechRecognition nor getUserMedia exists does the button render nothing.

type Mode = "speech" | "recorder" | "none";

// Hard cap on a single recording so a forgotten open mic can't record forever
// or blow past the transcribe route's payload limit.
const MAX_RECORD_MS = 60_000;
const PREFERRED_MIME = "audio/webm;codecs=opus";
// Denied-state copy that says HOW to fix it, not just what happened. Shown
// longer than other flashes because it's instructions to follow.
const BLOCKED_MSG =
  "Microphone is blocked. Tap the icon by the address bar (or your browser's site settings), allow the mic, then try again.";
const BLOCKED_MSG_MS = 8000;
// Some browsers/extensions let a permission prompt sit unanswered
// indefinitely instead of rejecting getUserMedia's promise, which would
// otherwise leave `requesting` (and the disabled button) stuck forever.
// This caps the wait so the button always comes back to life.
const MIC_REQUEST_TIMEOUT_MS = 15_000;
const MIC_TIMEOUT_MSG =
  "Still waiting for microphone permission. Check your browser prompt.";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result ?? "");
      resolve(s.slice(s.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export default function VoiceButton({
  onText,
  disabled,
}: {
  onText: (text: string) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [listening, setListening] = useState(false);
  // True from the moment the recorder path is tapped until getUserMedia
  // resolves (or rejects). Distinct from `listening`: the mic permission
  // prompt can take a real beat (or sit waiting for the person to answer
  // it), and without a state for that gap the button looks inert the whole
  // time, like the tap didn't register.
  const [requesting, setRequesting] = useState(false);
  // Set the instant the MIC_REQUEST_TIMEOUT_MS cap fires while still
  // requesting, so a getUserMedia promise that resolves AFTER the timeout
  // (the person finally clicks "Allow" on a prompt we'd already given up on)
  // is recognized as stale: the tracks it hands back get stopped immediately
  // instead of the button silently entering listening state on its own.
  const requestTimedOutRef = useRef(false);
  // The live bubble: interim speech, "Listening...", "Transcribing...", or a
  // short error message. Empty string hides it.
  const [bubble, setBubble] = useState("");

  // Mirror of `mode` for handlers wired up once inside the mount effect.
  const modeRef = useRef<Mode>("none");
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  // Speech mode.
  const recRef = useRef<any>(null);
  // True while the user means to keep dictating, so an automatic end event can
  // restart recognition instead of cutting them off mid sentence.
  const wantOnRef = useRef(false);
  const canRecordRef = useRef(false);

  // Recorder mode.
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function switchMode(m: Mode) {
    modeRef.current = m;
    setMode(m);
  }

  // Show a short error/status message in the bubble, then clear it.
  function flashBubble(msg: string, ms = 4000) {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setBubble(msg);
    flashTimerRef.current = setTimeout(() => {
      flashTimerRef.current = null;
      setBubble("");
    }, ms);
  }

  function releaseStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      // The MIC_REQUEST_TIMEOUT_MS cap in toggle() may have already fired
      // while this promise was still pending (a prompt left unanswered past
      // the cap). If so, `requesting` was already cleared and the button
      // re-enabled - entering listening now would be a stale grant nobody is
      // waiting on anymore. Release the tracks this call obtained and stop,
      // without touching state that's already moved on.
      if (requestTimedOutRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (requestTimerRef.current) {
        clearTimeout(requestTimerRef.current);
        requestTimerRef.current = null;
      }
      streamRef.current = stream;
      // Prefer webm/opus (small, well supported by Gemini); otherwise let the
      // browser pick and send whatever mimeType it actually used.
      const rec =
        typeof MediaRecorder.isTypeSupported === "function" &&
        MediaRecorder.isTypeSupported(PREFERRED_MIME)
          ? new MediaRecorder(stream, { mimeType: PREFERRED_MIME })
          : new MediaRecorder(stream);
      rec.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        void finishRecording(rec.mimeType || "audio/webm");
      };
      chunksRef.current = [];
      mediaRef.current = rec;
      rec.start();
      setRequesting(false);
      setListening(true);
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
      setBubble("Listening...");
      stopTimerRef.current = setTimeout(() => stopRecording(), MAX_RECORD_MS);
    } catch (err: any) {
      if (requestTimerRef.current) {
        clearTimeout(requestTimerRef.current);
        requestTimerRef.current = null;
      }
      // If the timeout already fired, requesting/bubble were already reset
      // by it; resetting again here is harmless and covers the normal case
      // where the rejection (e.g. "denied") arrives before the cap does.
      setRequesting(false);
      setListening(false);
      releaseStream();
      const noMic =
        err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError";
      flashBubble(
        noMic ? "No microphone found." : BLOCKED_MSG,
        noMic ? undefined : BLOCKED_MSG_MS
      );
    }
  }

  function stopRecording() {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    setListening(false);
    const rec = mediaRef.current;
    mediaRef.current = null;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop(); // onstop hands off to finishRecording
        return;
      } catch {
        /* fall through to cleanup */
      }
    }
    releaseStream();
    if (!flashTimerRef.current) setBubble("");
  }

  async function finishRecording(mime: string) {
    releaseStream();
    const chunks = chunksRef.current;
    chunksRef.current = [];
    const blob = new Blob(chunks, { type: mime });
    if (blob.size === 0) {
      if (!flashTimerRef.current) setBubble("");
      return;
    }
    setBubble("Transcribing...");
    try {
      const audio = await blobToBase64(blob);
      const resp = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audio, mime }),
      });
      const data: any = await resp.json().catch(() => ({}));
      if (typeof data?.text === "string") {
        const text = data.text.trim();
        if (text) {
          onTextRef.current(text);
          // Don't clobber the bubble if a new recording already started.
          if (!mediaRef.current) setBubble("");
        } else {
          flashBubble("Didn't catch any words, try again.");
        }
      } else if (data?.reason === "rate_limited") {
        // Same daily cap message Ask Hearth itself shows.
        flashBubble(
          "You have reached today's Ask Hearth limit. It resets tomorrow."
        );
      } else if (data?.reason === "no_key") {
        flashBubble("Voice transcription isn't set up yet.");
      } else {
        flashBubble("Could not transcribe, try again.");
      }
    } catch {
      flashBubble("Could not transcribe, try again.");
    }
  }

  useEffect(() => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    canRecordRef.current = !!(
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function" &&
      typeof window.MediaRecorder !== "undefined"
    );

    if (!SR) {
      // Firefox and friends: no Web Speech at all. Recording + server
      // transcription becomes the primary mode instead of hiding the button.
      switchMode(canRecordRef.current ? "recorder" : "none");
      return;
    }
    switchMode("speech");

    const rec = new SR();
    // Dictate in the browser's language (a Spanish speaker's browser is set to
    // es-*), falling back to English if it's unavailable.
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e: any) => {
      // Commit only the segments that just became final, starting at
      // resultIndex, so we never double count. Interim guesses go to the live
      // bubble so the homeowner sees words appear immediately while speaking.
      let finalText = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const t = res[0]?.transcript ?? "";
        if (res.isFinal) finalText += t;
        else interim += t;
      }
      const done = finalText.trim();
      if (done) onTextRef.current(done);
      if (wantOnRef.current) setBubble(interim.trim() || "Listening...");
    };

    rec.onend = () => {
      if (modeRef.current !== "speech") return; // recorder took over
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
      if (!flashTimerRef.current) setBubble("");
    };

    rec.onerror = (e: any) => {
      const err = e?.error;
      // A brief silence ("no-speech") is not a real failure; keep going.
      if (err === "no-speech" || err === "aborted") return;
      if (err === "network") {
        // Chrome's cloud speech service is unreachable (Brave, Electron,
        // blocked networks). Switch to the recorder fallback transparently
        // and keep listening, so the homeowner never has to do anything.
        wantOnRef.current = false;
        try {
          rec.abort();
        } catch {
          /* ignore */
        }
        if (canRecordRef.current) {
          switchMode("recorder");
          void startRecording();
        } else {
          setListening(false);
          flashBubble("Voice input is unavailable in this browser.");
        }
        return;
      }
      wantOnRef.current = false;
      setListening(false);
      if (err === "not-allowed" || err === "service-not-allowed") {
        flashBubble(BLOCKED_MSG, BLOCKED_MSG_MS);
      } else if (err === "audio-capture") {
        flashBubble("No microphone found.");
      } else {
        flashBubble("Voice input failed, try again.");
      }
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

  // Release recorder resources and timers on unmount.
  useEffect(() => {
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      if (requestTimerRef.current) clearTimeout(requestTimerRef.current);
      const media = mediaRef.current;
      mediaRef.current = null;
      if (media && media.state !== "inactive") {
        try {
          media.stop();
        } catch {
          /* ignore */
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  if (!mode || mode === "none") return null;

  function toggle() {
    if (modeRef.current === "recorder") {
      if (listening) {
        stopRecording();
      } else if (!requesting) {
        // Set the pending bubble synchronously, before startRecording's
        // first await (getUserMedia). Permission prompts can take a beat -
        // or sit waiting on the person to answer - and getUserMedia doesn't
        // resolve until then, so without this the button shows nothing
        // happening for that whole stretch. `!requesting` guards against a
        // second tap re-firing getUserMedia while the first prompt is still
        // pending.
        setRequesting(true);
        requestTimedOutRef.current = false;
        setBubble("Requesting microphone...");
        // Cap the wait: some browsers/extensions let a permission prompt
        // sit unanswered indefinitely rather than ever rejecting
        // getUserMedia's promise, which would otherwise leave `requesting`
        // (and the disabled button) stuck forever. If the promise later
        // resolves anyway, startRecording checks requestTimedOutRef and
        // discards the stale grant instead of entering listening.
        if (requestTimerRef.current) clearTimeout(requestTimerRef.current);
        requestTimerRef.current = setTimeout(() => {
          requestTimerRef.current = null;
          requestTimedOutRef.current = true;
          setRequesting(false);
          flashBubble(MIC_TIMEOUT_MSG, BLOCKED_MSG_MS);
        }, MIC_REQUEST_TIMEOUT_MS);
        void startRecording();
      }
      return;
    }
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
      if (!flashTimerRef.current) setBubble("");
    } else {
      wantOnRef.current = true;
      try {
        rec.start();
        setListening(true);
        setBubble("Listening...");
      } catch {
        /* already started */
      }
    }
  }

  return (
    <span className="relative flex">
      {bubble ? (
        <span className="pointer-events-none absolute bottom-full left-0 z-10 mb-1.5 w-max max-w-[min(220px,70vw)] rounded-lg border border-stone-200 bg-white px-2 py-1 text-left text-xs leading-snug text-stone-600 shadow-sm dark:border-white/10 dark:bg-stone-800 dark:text-stone-300">
          {bubble}
        </span>
      ) : null}
      <button
        type="button"
        onClick={toggle}
        disabled={disabled || requesting}
        // title only shows on hover; aria-label covers touch + screen readers.
        aria-label={
          requesting
            ? "Requesting microphone access"
            : listening
              ? "Listening. Tap to stop."
              : "Speak your question"
        }
        aria-pressed={listening}
        title={
          requesting
            ? "Requesting microphone access"
            : listening
              ? "Listening. Tap to stop."
              : "Speak your question"
        }
        className={`flex items-center rounded-lg border px-2 text-lg disabled:opacity-50 ${
          listening
            ? "animate-pulse border-red-300 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
            : requesting
              ? "animate-pulse border-bark-300 bg-bark-50 text-bark-600 dark:border-bark-700 dark:bg-bark-700/40 dark:text-stone-300"
              : "border-stone-200 text-stone-500 hover:border-bark-500 hover:text-bark-700 dark:border-white/10 dark:text-stone-400 dark:hover:text-stone-300"
        }`}
      >
        <Mic className="h-5 w-5" aria-hidden="true" />
      </button>
    </span>
  );
}
