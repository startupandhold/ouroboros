"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { OuroSocialLinks } from "@/components/OuroSocialLinks";
import {
  OURO_DOC_CREDIT_LABEL,
  OURO_DOC_CREDIT_URL,
} from "@/lib/siteLinks";

const GARDEN_VIDEO_SRC = "/video/ouro_doc_web.mp4";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function GardenVideoControls({
  videoRef,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const [paused, setPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const sync = () => {
      setPaused(video.paused);
      setCurrentTime(video.currentTime);
      setDuration(video.duration || 0);
      setVolume(video.volume);
      setMuted(video.muted);
    };

    sync();

    video.addEventListener("play", sync);
    video.addEventListener("pause", sync);
    video.addEventListener("timeupdate", sync);
    video.addEventListener("loadedmetadata", sync);
    video.addEventListener("durationchange", sync);
    video.addEventListener("volumechange", sync);

    return () => {
      video.removeEventListener("play", sync);
      video.removeEventListener("pause", sync);
      video.removeEventListener("timeupdate", sync);
      video.removeEventListener("loadedmetadata", sync);
      video.removeEventListener("durationchange", sync);
      video.removeEventListener("volumechange", sync);
    };
  }, [videoRef]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }, [videoRef]);

  const seek = useCallback(
    (value: number) => {
      const video = videoRef.current;
      if (!video || !Number.isFinite(video.duration)) return;
      video.currentTime = (value / 100) * video.duration;
    },
    [videoRef],
  );

  const setVideoVolume = useCallback(
    (value: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.volume = value;
      video.muted = value === 0;
    },
    [videoRef],
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, [videoRef]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="garden-welcome__controls" aria-label="Video controls">
      <button
        type="button"
        className="garden-welcome__ctrl-btn"
        onClick={togglePlay}
        aria-label={paused ? "Play" : "Pause"}
      >
        {paused ? "▶" : "❚❚"}
      </button>

      <div className="garden-welcome__ctrl-track">
        <span className="garden-welcome__ctrl-time">{formatTime(currentTime)}</span>
        <input
          type="range"
          className="garden-welcome__ctrl-seek"
          min={0}
          max={100}
          step={0.1}
          value={progress}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Seek"
          aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
        />
        <span className="garden-welcome__ctrl-time garden-welcome__ctrl-time--end">
          {formatTime(duration)}
        </span>
      </div>

      <div className="garden-welcome__ctrl-volume">
        <button
          type="button"
          className="garden-welcome__ctrl-btn garden-welcome__ctrl-btn--mute"
          onClick={toggleMute}
          aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
        >
          {muted || volume === 0 ? "mut" : "vol"}
        </button>
        <input
          type="range"
          className="garden-welcome__ctrl-volume-slider"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => setVideoVolume(Number(e.target.value))}
          aria-label="Volume"
        />
      </div>
    </div>
  );
}

export function OuroGardenWelcome() {
  const [playing, setPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const playVideo = useCallback(() => {
    setPlaying(true);
    setVideoError(false);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const video = videoRef.current;
    if (!video) return;
    void video.play().catch(() => {
      /* autoplay may require user gesture — play button satisfies that */
    });
  }, [playing]);

  const onVideoKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLVideoElement>) => {
      const video = videoRef.current;
      if (!video) return;
      if (event.key === " " || event.key === "k") {
        event.preventDefault();
        if (video.paused) void video.play();
        else video.pause();
      }
    },
    [],
  );

  return (
    <section
      className="garden-welcome"
      aria-label="Welcome to the garden of Ouroboros"
    >
      <div className="garden-welcome__header">
        <h2 className="garden-welcome__title">
          <span className="garden-welcome__title-lead">
            welcome to the garden of
          </span>
          <span className="garden-welcome__title-brand">Ouroboros</span>
        </h2>
      </div>
      <div className="garden-welcome__body">
        <div className="garden-welcome__media">
          <div className="garden-welcome__frame">
            {playing ? (
              <div className="garden-welcome__video-wrap">
                <video
                  ref={videoRef}
                  className="garden-welcome__video"
                  playsInline
                  preload="auto"
                  aria-label="Ouroboros garden documentary"
                  onKeyDown={onVideoKeyDown}
                  onError={() => setVideoError(true)}
                >
                  <source src={GARDEN_VIDEO_SRC} type="video/mp4" />
                </video>
                {videoError && (
                  <p className="garden-welcome__video-error">
                    video unavailable — re-encode to H.264 for browser playback
                  </p>
                )}
              </div>
            ) : (
              <>
                <Image
                  src="/image/ouro_garden_bg.png"
                  alt=""
                  width={2172}
                  height={724}
                  className="garden-welcome__bg"
                  sizes="(max-width: 1180px) 100vw, 1100px"
                  priority
                  aria-hidden
                />
                <div className="garden-welcome__play-area">
                  <button
                    type="button"
                    className="garden-welcome__play"
                    onClick={playVideo}
                    aria-label="Play Ouroboros garden video"
                  >
                    <span className="garden-welcome__ouro-spin">
                      <span className="garden-welcome__ouro-breathe">
                        <Image
                          src="/image/ouro_circle.png"
                          alt=""
                          width={1536}
                          height={1024}
                          className="garden-welcome__ouro-img"
                          sizes="(max-width: 1180px) 52vw, 420px"
                        />
                      </span>
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>

          {playing && <GardenVideoControls videoRef={videoRef} />}
        </div>

        <footer className="garden-welcome__footer">
          <OuroSocialLinks className="garden-welcome__social" />
          <p className="garden-welcome__credit">
            video credit:
            <a
              href={OURO_DOC_CREDIT_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              {OURO_DOC_CREDIT_LABEL}
            </a>
          </p>
        </footer>
      </div>
    </section>
  );
}
