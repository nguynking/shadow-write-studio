"use client";

import Script from "next/script";
import { useCallback, useEffect, useId, useRef, useState } from "react";

type Clip = {
  id: string;
  startSeconds: number;
  endSeconds: number;
};

type YoutubePlayerProps = {
  videoId: string;
  clip: Clip | null;
  playRequest: number;
  loop: boolean;
  playbackRate: number;
  onTimeUpdate?: (seconds: number) => void;
  onClipComplete?: () => void;
};

declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export function YoutubePlayer({
  videoId,
  clip,
  playRequest,
  loop,
  playbackRate,
  onTimeUpdate,
  onClipComplete,
}: YoutubePlayerProps) {
  const reactId = useId();
  const playerElementId = `youtube-player-${reactId.replace(/:/g, "")}`;
  const playerRef = useRef<YT.Player | null>(null);
  const clipRef = useRef<Clip | null>(clip);
  const loopRef = useRef(loop);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onClipCompleteRef = useRef(onClipComplete);
  const [ready, setReady] = useState(false);
  const [scriptReady, setScriptReady] = useState(
    () => typeof window !== "undefined" && Boolean(window.YT?.Player),
  );
  const [playerError, setPlayerError] = useState<string | null>(null);

  useEffect(() => {
    clipRef.current = clip;
    loopRef.current = loop;
    onTimeUpdateRef.current = onTimeUpdate;
    onClipCompleteRef.current = onClipComplete;
  }, [clip, loop, onClipComplete, onTimeUpdate]);

  const initializePlayer = useCallback(() => {
    if (!window.YT?.Player || playerRef.current) return;

    try {
      setPlayerError(null);
      playerRef.current = new window.YT.Player(playerElementId, {
        videoId,
        width: "100%",
        height: "100%",
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            setReady(true);
            setPlayerError(null);
          },
          onError: () => {
            setReady(false);
            setPlayerError("The embedded player could not load this video.");
          },
        },
      });
    } catch {
      setPlayerError("The embedded player could not start.");
    }
  }, [playerElementId, videoId]);

  useEffect(() => {
    if (!scriptReady) return;
    if (window.YT?.Player) {
      const initializeTask = window.setTimeout(initializePlayer, 0);
      return () => window.clearTimeout(initializeTask);
    }

    const previous = window.onYouTubeIframeAPIReady;
    const readyHandler = () => {
      previous?.();
      initializePlayer();
    };
    window.onYouTubeIframeAPIReady = readyHandler;

    return () => {
      if (window.onYouTubeIframeAPIReady === readyHandler) {
        window.onYouTubeIframeAPIReady = previous;
      }
    };
  }, [initializePlayer, scriptReady]);

  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player) return;
    player.cueVideoById(videoId);
  }, [ready, videoId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player || !clip || playRequest === 0) return;

    player.seekTo(Math.max(0, clip.startSeconds - 0.25), true);
    player.playVideo();
  }, [clip, playRequest, ready]);

  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player) return;
    player.setPlaybackRate(playbackRate);
  }, [playbackRate, ready]);

  useEffect(() => {
    if (!ready) return;

    const interval = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== "function") return;

      const currentTime = player.getCurrentTime();
      onTimeUpdateRef.current?.(currentTime);
      const activeClip = clipRef.current;

      if (activeClip && currentTime >= activeClip.endSeconds) {
        if (loopRef.current) {
          player.seekTo(Math.max(0, activeClip.startSeconds - 0.15), true);
          player.playVideo();
        } else {
          player.pauseVideo();
          onClipCompleteRef.current?.();
        }
      }
    }, 160);

    return () => window.clearInterval(interval);
  }, [ready]);

  useEffect(
    () => () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    },
    [],
  );

  function retryPlayer() {
    playerRef.current?.destroy();
    playerRef.current = null;
    setReady(false);
    setPlayerError(null);
    if (window.YT?.Player) {
      initializePlayer();
    } else {
      setScriptReady(false);
    }
  }

  return (
    <div className="relative aspect-video min-h-[200px] w-full overflow-hidden rounded-[18px] bg-[var(--ink)] shadow-[var(--shadow-media)]">
      <Script
        src="https://www.youtube.com/iframe_api"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() =>
          setPlayerError("YouTube could not be reached from this browser.")
        }
      />
      <div id={playerElementId} className="h-full w-full" />
      {playerError ? (
        <div className="absolute inset-0 grid place-items-center bg-[var(--ink)] p-6 text-center text-white" role="alert">
          <div>
            <p className="font-semibold">Player unavailable</p>
            <p className="mt-1 text-sm leading-6 text-white/70">{playerError}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" className="button bg-white text-[var(--ink)]" onClick={retryPlayer}>
                Try again
              </button>
              <a className="button border border-white/30 bg-transparent text-white" href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer">
                Open on YouTube
              </a>
            </div>
          </div>
        </div>
      ) : !ready ? (
        <div
          className="absolute inset-0 grid place-items-center bg-[var(--ink)] text-sm font-medium text-white"
          role="status"
        >
          Preparing the player…
        </div>
      ) : null}
    </div>
  );
}
