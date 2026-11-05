import { useEffect, useRef, useState } from 'react';

// Loads the YouTube IFrame API once and controls an existing <iframe> whose src has enablejsapi=1.
let apiPromise = null;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => {
      apiPromise = null;
      reject(new Error('לא ניתן לטעון את ממשק YouTube'));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

export function withJsApi(embedUrl) {
  if (!embedUrl) return null;
  const url = new URL(embedUrl);
  url.searchParams.set('enablejsapi', '1');
  url.searchParams.set('origin', window.location.origin);
  return url.toString();
}

export function useYouTubePlayer(iframeRef, enabled) {
  const playerRef = useRef(null);
  const savedVolumeRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!enabled || !iframeRef.current) return undefined;
    let cancelled = false;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !iframeRef.current) return;
        playerRef.current = new YT.Player(iframeRef.current, {
          events: {
            onReady: () => !cancelled && setReady(true),
            onStateChange: (event) => !cancelled && setPlaying(event.data === YT.PlayerState.PLAYING),
          },
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      playerRef.current = null;
      setReady(false);
      setPlaying(false);
    };
  }, [enabled, iframeRef]);

  const player = () => (ready ? playerRef.current : null);

  return {
    ready,
    playing,
    currentTime: () => player()?.getCurrentTime?.() ?? null,
    pause: () => player()?.pauseVideo?.(),
    play: () => player()?.playVideo?.(),
    // Lowers volume to a fraction of the current level and remembers it for restoreVolume().
    duckVolume: (fraction) => {
      const p = player();
      if (!p || savedVolumeRef.current !== null) return;
      savedVolumeRef.current = p.getVolume();
      p.setVolume(Math.round(savedVolumeRef.current * fraction));
    },
    restoreVolume: () => {
      const p = player();
      if (!p || savedVolumeRef.current === null) return;
      p.setVolume(savedVolumeRef.current);
      savedVolumeRef.current = null;
    },
  };
}
