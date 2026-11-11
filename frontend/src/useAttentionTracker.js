import { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { frameFeatures } from './attentionScore';
import { concentrationScore } from './concentration';

const SAMPLE_INTERVAL_MS = 100;
// The displayed score is concentration (see concentration.js), refreshed every second.
const SCORE_INTERVAL_MS = 1000;
// 60s of per-frame features: blink rate needs a full minute, the other signals use the tail.
const GEO_WINDOW_SIZE = 600;
const MIN_GEO_FRAMES = 10;
const SAVE_INTERVAL_MS = 3000;
const FACE_TASK_PATH = '/models/face_landmarker.task';
const VISION_WASM_PATH = '/mediapipe/wasm';

// Away = the tab is hidden or another window has focus. hasFocus() stays true while the
// YouTube iframe has focus, so clicking Play inside the player does not count as leaving.
function isAway() {
  return document.hidden || !document.hasFocus();
}

// `active` = whether attention should be measured right now (e.g. the video is playing).
// While inactive the camera stays on (no new permission prompt) but no frames are analyzed or scored.
export function useAttentionTracker({ onScore, onTick, active = true }) {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const landmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const captureIntervalRef = useRef(null);
  const scoreIntervalRef = useRef(null);
  const geoFramesRef = useRef([]);
  const lastSaveRef = useRef(0);
  const onScoreRef = useRef(onScore);
  const [cameraState, setCameraState] = useState('off');
  const [faceDetected, setFaceDetected] = useState(false);
  const [latestScore, setLatestScore] = useState(null);
  const [lowAttention, setLowAttention] = useState(false);
  const [breakdown, setBreakdown] = useState(null);
  const [error, setError] = useState('');

  const onTickRef = useRef(onTick);
  const activeRef = useRef(active);

  useEffect(() => {
    onScoreRef.current = onScore;
    onTickRef.current = onTick;
  }, [onScore, onTick]);

  // Pausing drops everything collected so far, so time spent paused never counts once measuring resumes.
  useEffect(() => {
    activeRef.current = active;
    if (active) return;
    geoFramesRef.current = [];
    setLatestScore(null);
    setBreakdown(null);
    setLowAttention(false);
    const canvas = overlayRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, [active]);

  async function startCamera() {
    if (!navigator?.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setCameraState('error');
      setError('המצלמה לא זמינה בדפדפן הזה. השתמשו ב-Chrome או Edge ב-localhost/HTTPS ובחרו לאפשר גישה למצלמה.');
      return;
    }

    setError('');
    setCameraState('starting');

    try {
      const vision = await FilesetResolver.forVisionTasks(VISION_WASM_PATH);
      const options = {
        baseOptions: { modelAssetPath: FACE_TASK_PATH },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      };

      let landmarker;
      try {
        landmarker = await FaceLandmarker.createFromOptions(vision, {
          ...options,
          baseOptions: { ...options.baseOptions, delegate: 'GPU' },
        });
      } catch {
        landmarker = await FaceLandmarker.createFromOptions(vision, options);
      }
      landmarkerRef.current = landmarker;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;

      // The <video> element must already be mounted (ReaderPage always renders it), otherwise no frames arrive.
      if (!videoRef.current) {
        throw new Error('רכיב הווידאו לא נמצא בעמוד.');
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      geoFramesRef.current = [];
      lastSaveRef.current = 0;
      setFaceDetected(false);
      setLatestScore(null);
      setBreakdown(null);
      setLowAttention(false);
      setCameraState('running');

      if (captureIntervalRef.current) window.clearInterval(captureIntervalRef.current);
      if (scoreIntervalRef.current) window.clearInterval(scoreIntervalRef.current);

      captureIntervalRef.current = window.setInterval(captureFrame, SAMPLE_INTERVAL_MS);
      scoreIntervalRef.current = window.setInterval(updateScore, SCORE_INTERVAL_MS);
    } catch (cameraError) {
      stopCamera();
      setCameraState('error');
      setError(`לא ניתן להפעיל את המצלמה: ${cameraError.message}`);
    }
  }

  function drawLandmarks(landmarks) {
    const canvas = overlayRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const context = canvas.getContext('2d');
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!landmarks) return;

    context.fillStyle = '#b7f35b';
    landmarks.forEach((point) => {
      context.beginPath();
      context.arc(point.x * canvas.width, point.y * canvas.height, 1.3, 0, Math.PI * 2);
      context.fill();
    });
  }

  function pushGeoFrame(features) {
    geoFramesRef.current.push(features);
    if (geoFramesRef.current.length > GEO_WINDOW_SIZE) {
      geoFramesRef.current = geoFramesRef.current.slice(-GEO_WINDOW_SIZE);
    }
  }

  function captureFrame() {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker || !activeRef.current) return;

    if (isAway()) {
      pushGeoFrame({ face: false, head: 0, gaze: 0, closed: false, away: true });
      return;
    }
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    const result = landmarker.detectForVideo(video, performance.now());
    const landmarks = result.faceLandmarks?.[0];
    drawLandmarks(landmarks);

    // No face counts as "not looking", so the score keeps going while the face is missing.
    pushGeoFrame(frameFeatures(result));
    setFaceDetected(Boolean(landmarks));
    if (landmarks) setError('');
  }

  function updateScore() {
    if (!activeRef.current || geoFramesRef.current.length < MIN_GEO_FRAMES) return;
    const concentration = concentrationScore(geoFramesRef.current);
    const { score } = concentration;

    setLatestScore(score);
    setLowAttention(score < 0.4);
    setBreakdown(concentration);
    onTickRef.current?.(concentration);

    const now = Date.now();
    if (now - lastSaveRef.current >= SAVE_INTERVAL_MS) {
      lastSaveRef.current = now;
      onScoreRef.current?.(score);
    }
  }

  function stopCamera() {
    if (captureIntervalRef.current) window.clearInterval(captureIntervalRef.current);
    if (scoreIntervalRef.current) window.clearInterval(scoreIntervalRef.current);
    captureIntervalRef.current = null;
    scoreIntervalRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    const context = overlayRef.current?.getContext('2d');
    if (context && overlayRef.current) {
      context.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
    }

    geoFramesRef.current = [];
    setFaceDetected(false);
    setBreakdown(null);
    setCameraState('off');
  }

  useEffect(() => () => {
    stopCamera();
  }, []);

  return {
    videoRef,
    overlayRef,
    cameraState,
    faceDetected,
    latestScore,
    lowAttention,
    breakdown,
    error,
    startCamera,
    stopCamera,
    clearError: () => setError(''),
  };
}
