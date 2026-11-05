import { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import * as ort from 'onnxruntime-web';
import { combineScores, frameFeatures, windowScore } from './attentionScore';

const SAMPLE_INTERVAL_MS = 100;
const INFERENCE_INTERVAL_MS = 3000;
// The displayed score comes from head pose / gaze / eyes over the last 3 seconds, refreshed every second.
const SCORE_INTERVAL_MS = 1000;
const GEO_WINDOW_SIZE = 30;
const MIN_GEO_FRAMES = 10;
const SAVE_INTERVAL_MS = 3000;
// v4_2.onnx barely reacts to its input (~0.12 for any face); the blended score is shown for comparison only.
const MODEL_WEIGHT = 0.1;
const WINDOW_SIZE = 100;
const NO_FACE_FRAME_LIMIT = 10;
const LANDMARK_COUNT = 478;
const VALUES_PER_POINT = 3;
const MODEL_PATH = '/models/v4_2.onnx';
const FACE_TASK_PATH = '/models/face_landmarker.task';
const VISION_WASM_PATH = '/mediapipe/wasm';
// v4_2.onnx outputs: regression_scores [B,1] (already sigmoid, 0–1), classification_logits [B,5], attention_weights [B,T]
const SCORE_OUTPUT = 'regression_scores';

const modelCache = { session: null, promise: null };

// Only the .wasm binary is served from /ort/. The JS glue is embedded in the ORT bundle;
// pointing ORT at /ort/*.mjs breaks under Vite dev (public files can't be imported as modules).
ort.env.wasm.wasmPaths = { wasm: '/ort/ort-wasm-simd-threaded.jsep.wasm' };
ort.env.wasm.numThreads = 1;

function getProgressText(frameCount) {
  if (frameCount <= 0) return 'אוסף נתונים... 0 מתוך 10 שניות';
  const steps = Math.max(1, Math.min(10, Math.round((frameCount / WINDOW_SIZE) * 10)));
  return `אוסף נתונים... ${steps} מתוך 10 שניות`;
}

export function useAttentionTracker({ onScore, onUnauthorized }) {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const landmarkerRef = useRef(null);
  const sessionRef = useRef(null);
  const streamRef = useRef(null);
  const captureIntervalRef = useRef(null);
  const inferenceIntervalRef = useRef(null);
  const scoreIntervalRef = useRef(null);
  const framesRef = useRef([]);
  const geoFramesRef = useRef([]);
  const modelScoreRef = useRef(null);
  const lastSaveRef = useRef(0);
  const busyRef = useRef(false);
  const noFaceFramesRef = useRef(0);
  const onScoreRef = useRef(onScore);
  const [modelName, setModelName] = useState('v4_2.onnx');
  const [modelState, setModelState] = useState('loading');
  const [cameraState, setCameraState] = useState('off');
  const [faceDetected, setFaceDetected] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [latestScore, setLatestScore] = useState(null);
  const [lowAttention, setLowAttention] = useState(false);
  const [breakdown, setBreakdown] = useState(null);
  const [progressText, setProgressText] = useState('אוסף נתונים... 0 מתוך 10 שניות');
  const [error, setError] = useState('');

  useEffect(() => {
    onScoreRef.current = onScore;
  }, [onScore]);

  async function loadModel() {
    if (modelCache.session) {
      sessionRef.current = modelCache.session;
      setModelName('v4_2.onnx');
      setModelState('ready');
      setProgressText('אוסף נתונים... 0 מתוך 10 שניות');
      return;
    }

    setError('');
    setModelState('loading');
    setProgressText('טוען מודל...');

    try {
      if (!modelCache.promise) {
        modelCache.promise = ort.InferenceSession.create(MODEL_PATH, { executionProviders: ['wasm'] });
      }
      const session = await modelCache.promise;

      if (!session?.inputNames?.length || !session.outputNames?.includes(SCORE_OUTPUT)) {
        throw new Error(`המודל חייב להכיל פלט בשם ${SCORE_OUTPUT}.`);
      }

      modelCache.session = session;
      sessionRef.current = session;
      setModelName('v4_2.onnx');
      setModelState('ready');
      setProgressText('אוסף נתונים... 0 מתוך 10 שניות');
    } catch (loadError) {
      sessionRef.current = null;
      modelCache.session = null;
      modelCache.promise = null;
      setModelState('error');
      setError(`לא ניתן לטעון את מודל ה־ONNX: ${loadError.message}`);
    } finally {
      modelCache.promise = null;
    }
  }

  async function startCamera() {
    if (!navigator?.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setCameraState('error');
      setError('המצלמה לא זמינה בדפדפן הזה. השתמשו ב-Chrome או Edge ב-localhost/HTTPS ובחרו לאפשר גישה למצלמה.');
      return;
    }

    setError('');
    setCameraState('starting');
    setProgressText('אוסף נתונים... 0 מתוך 10 שניות');

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

      framesRef.current = [];
      geoFramesRef.current = [];
      modelScoreRef.current = null;
      lastSaveRef.current = 0;
      noFaceFramesRef.current = 0;
      setFaceDetected(false);
      setLatestScore(null);
      setBreakdown(null);
      setLowAttention(false);
      setProgressText('אוסף נתונים... 0 מתוך 10 שניות');
      setFrameCount(0);
      setCameraState('running');

      if (captureIntervalRef.current) window.clearInterval(captureIntervalRef.current);
      if (inferenceIntervalRef.current) window.clearInterval(inferenceIntervalRef.current);
      if (scoreIntervalRef.current) window.clearInterval(scoreIntervalRef.current);

      captureIntervalRef.current = window.setInterval(captureFrame, SAMPLE_INTERVAL_MS);
      scoreIntervalRef.current = window.setInterval(updateScore, SCORE_INTERVAL_MS);
      // Sliding window: once 10 seconds are collected, score the latest 100 frames every 3 seconds.
      inferenceIntervalRef.current = window.setInterval(() => {
        if (busyRef.current || framesRef.current.length < WINDOW_SIZE) return;
        void inferAttention(framesRef.current.slice(-WINDOW_SIZE));
      }, INFERENCE_INTERVAL_MS);
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

  function captureFrame() {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    const result = landmarker.detectForVideo(video, performance.now());
    const landmarks = result.faceLandmarks?.[0];
    drawLandmarks(landmarks);

    // No face counts as "not looking" for the geometric score, so it keeps going while the face is missing.
    geoFramesRef.current.push(frameFeatures(result));
    if (geoFramesRef.current.length > GEO_WINDOW_SIZE) {
      geoFramesRef.current = geoFramesRef.current.slice(-GEO_WINDOW_SIZE);
    }

    if (!landmarks) {
      setFaceDetected(false);
      noFaceFramesRef.current += 1;
      if (noFaceFramesRef.current >= NO_FACE_FRAME_LIMIT) {
        framesRef.current = [];
        modelScoreRef.current = null;
        noFaceFramesRef.current = 0;
        setFrameCount(0);
        setProgressText('לא זוהו פנים');
      }
      return;
    }

    noFaceFramesRef.current = 0;
    setFaceDetected(true);
    setError('');

    const frame = new Float32Array(LANDMARK_COUNT * VALUES_PER_POINT);
    landmarks.slice(0, LANDMARK_COUNT).forEach((point, index) => {
      const offset = index * VALUES_PER_POINT;
      frame[offset] = point.x;
      frame[offset + 1] = point.y;
      frame[offset + 2] = point.z;
    });

    framesRef.current.push(frame);
    if (framesRef.current.length > WINDOW_SIZE) {
      framesRef.current = framesRef.current.slice(-WINDOW_SIZE);
    }

    const nextCount = framesRef.current.length;
    setFrameCount(nextCount);
    setProgressText(getProgressText(nextCount));
  }

  async function inferAttention(frames) {
    if (!sessionRef.current || !frames?.length || busyRef.current) return;
    busyRef.current = true;

    try {
      const values = new Float32Array(frames.length * LANDMARK_COUNT * VALUES_PER_POINT);
      frames.forEach((frame, index) => values.set(frame, index * frame.length));

      const tensor = new ort.Tensor('float32', values, [1, WINDOW_SIZE, LANDMARK_COUNT, VALUES_PER_POINT]);
      const outputs = await sessionRef.current.run({ [sessionRef.current.inputNames[0]]: tensor });
      const output = outputs[SCORE_OUTPUT];
      const rawScore = Number(output?.data?.[0]);

      if (!Number.isFinite(rawScore)) {
        throw new Error('הפלט של המודל אינו תקין.');
      }

      modelScoreRef.current = Math.min(1, Math.max(0, rawScore));
    } catch (inferenceError) {
      setError(`חישוב ציון הקשב נכשל: ${inferenceError.message}`);
    } finally {
      busyRef.current = false;
    }
  }

  function updateScore() {
    if (geoFramesRef.current.length < MIN_GEO_FRAMES) return;
    const geometric = windowScore(geoFramesRef.current);
    // Main score ignores the ONNX model for now; the blended score is kept alongside for comparison.
    const score = geometric.score;
    const combined = modelScoreRef.current === null ? null : combineScores(geometric.score, modelScoreRef.current, MODEL_WEIGHT);

    setLatestScore(score);
    setLowAttention(score < 0.4);
    setBreakdown({ ...geometric, model: modelScoreRef.current, combined });

    const now = Date.now();
    if (now - lastSaveRef.current >= SAVE_INTERVAL_MS) {
      lastSaveRef.current = now;
      onScoreRef.current?.(score);
    }
  }

  function stopCamera() {
    if (captureIntervalRef.current) window.clearInterval(captureIntervalRef.current);
    if (inferenceIntervalRef.current) window.clearInterval(inferenceIntervalRef.current);
    if (scoreIntervalRef.current) window.clearInterval(scoreIntervalRef.current);
    captureIntervalRef.current = null;
    inferenceIntervalRef.current = null;
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

    framesRef.current = [];
    geoFramesRef.current = [];
    modelScoreRef.current = null;
    noFaceFramesRef.current = 0;
    setFrameCount(0);
    setFaceDetected(false);
    setBreakdown(null);
    setCameraState('off');
    setProgressText('אוסף נתונים... 0 מתוך 10 שניות');
  }

  useEffect(() => {
    void loadModel();
  }, []);

  useEffect(() => () => {
    stopCamera();
  }, []);

  return {
    videoRef,
    overlayRef,
    modelName,
    modelState,
    cameraState,
    faceDetected,
    frameCount,
    latestScore,
    lowAttention,
    breakdown,
    progressText,
    error,
    loadModel,
    startCamera,
    stopCamera,
    clearError: () => setError(''),
  };
}