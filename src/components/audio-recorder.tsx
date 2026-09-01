"use client";

import { Mic, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function AudioRecorder({ onRecorded }: { onRecorded?: () => void }) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        onRecorded?.();
      });

      recorder.start();
      setRecording(true);
    } catch {
      setError("Microphone access is unavailable. Allow access in your browser, then try again.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  function resetRecording() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setError(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {recording ? (
          <button type="button" className="button danger-button" onClick={stopRecording}>
            <Square aria-hidden="true" size={17} fill="currentColor" />
            Stop recording
          </button>
        ) : (
          <button type="button" className="button secondary-button" onClick={startRecording}>
            <Mic aria-hidden="true" size={18} />
            {audioUrl ? "Record again" : "Record your voice"}
          </button>
        )}
        {recording ? (
          <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--danger)]" role="status">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-current" />
            Recording
          </span>
        ) : null}
      </div>

      {audioUrl ? (
        <div className="flex flex-col gap-2 rounded-[14px] bg-[var(--surface-subtle)] p-3 sm:flex-row sm:items-center">
          <audio className="h-10 w-full min-w-0 flex-1" controls src={audioUrl}>
            Your browser does not support audio playback.
          </audio>
          <button type="button" className="button ghost-button min-h-10 self-end sm:shrink-0 sm:self-auto" onClick={resetRecording} aria-label="Delete recording">
            <RotateCcw aria-hidden="true" size={18} />
            Delete
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
