import { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import * as ort from 'onnxruntime-web';
import { api } from './api';

const SAMPLE_INTERVAL_MS = 100;
const WINDOW_SIZE = 100;
const LANDMARK_COUNT = 478;
const VALUES_PER_POINT = 3;
const FACE_TASK_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const VISION_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';

export function useAttentionTracker({ token, contentId, onUnauthorized }) {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const landmarkerRef = useRef(null);
  const sessionRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const framesRef = useRef([]);
  const pendingFramesRef = useRef(null);
  const busyRef = useRef(false);
  const [modelName, setModelName] = useState('');
  const [modelState, setModelState] = useState('empty');
  const [cameraState, setCameraState] = useState('off');
  const [faceDetected, setFaceDetected] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [latestScore, setLatestScore] = useState(null);
  const [error, setError] = useState('');

  async function loadModel(file) {
    if (!file) return;
    setError('');
    setModelState('loading');
    try {
      const session = await ort.InferenceSession.create(await file.arrayBuffer(), {
        executionProviders: ['wasm'],
      });
      if (session.inputNames.length !== 1 || session.outputNames.length < 1) {
        throw new Error('המודל חייב להכיל קלט יחיד ופלט ציון.');
      }
      sessionRef.current = session;
      setModelName(file.name);
      setModelState('ready');
    } catch (loadError) {
      sessionRef.current = null;
      setModelState('error');
      setError(`לא ניתן לטעון את מודל ה־ONNX: ${loadError.message}`);
    }
  }

  async function startCamera() {
    if (!sessionRef.current) {
      setError('יש לטעון מודל ONNX לפני הפעלת המצלמה.');
      return;
    }
    setError('');
    setCameraState('starting');
    try {
      const vision = await FilesetResolver.forVisionTasks(VISION_WASM_URL);
      const options = {
        baseOptions: { modelAssetPath: FACE_TASK_URL },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });

      landmarkerRef.current = landmarker;
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraState('running');
      framesRef.current = [];
      setFrameCount(0);
      intervalRef.current = window.setInterval(captureFrame, SAMPLE_INTERVAL_MS);
    } catch (cameraError) {
      stopCamera();
      setCameraState('error');
      setError(`לא ניתן להפעיל את המצלמה: ${cameraError.message}`);
    }
  }

  function captureFrame() {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    const result = landmarker.detectForVideo(video, performance.now());
    const landmarks = result.faceLandmarks?.[0];
    setFaceDetected(Boolean(landmarks));
    drawLandmarks(landmarks);
    if (!landmarks) return;

    const frame = new Float32Array(LANDMARK_COUNT * VALUES_PER_POINT);
    landmarks.slice(0, LANDMARK_COUNT).forEach((point, index) => {
      const offset = index * VALUES_PER_POINT;
      frame[offset] = point.x;
      frame[offset + 1] = point.y;
      frame[offset + 2] = point.z;
    });
    framesRef.current.push(frame);

    if (framesRef.current.length === WINDOW_SIZE) {
      const windowFrames = framesRef.current;
      framesRef.current = [];
      if (busyRef.current) pendingFramesRef.current = windowFrames;
      else void inferAttention(windowFrames);
    }
    setFrameCount(framesRef.current.length);
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
    for (const point of landmarks) {
      context.beginPath();
      context.arc(point.x * canvas.width, point.y * canvas.height, 1.3, 0, Math.PI * 2);
      context.fill();
    }
  }

  async function inferAttention(frames) {
    busyRef.current = true;
    try {
      const values = new Float32Array(WINDOW_SIZE * LANDMARK_COUNT * VALUES_PER_POINT);
      frames.forEach((frame, index) => values.set(frame, index * frame.length));
      const tensor = new ort.Tensor('float32', values, [1, WINDOW_SIZE, LANDMARK_COUNT, VALUES_PER_POINT]);
      const outputs = await sessionRef.current.run({ [sessionRef.current.inputNames[0]]: tensor });
      const output = outputs[sessionRef.current.outputNames[0]];
      if (output.data.length !== 1 || !Number.isFinite(output.data[0]) || output.data[0] < 0 || output.data[0] > 1) {
        throw new Error('הפלט חייב להיות ציון יחיד בין 0 ל־1.');
      }
      const score = Math.round(output.data[0] * 100);
      setLatestScore(score);
      await api.saveAttentionScore(token, contentId, score);
    } catch (inferenceError) {
      setError(`חישוב ציון הקשב נכשל: ${inferenceError.message}`);
      if (inferenceError.status === 401) onUnauthorized();
    } finally {
      busyRef.current = false;
      const nextWindow = pendingFramesRef.current;
      pendingFramesRef.current = null;
      if (nextWindow && streamRef.current) void inferAttention(nextWindow);
    }
  }

  function stopCamera() {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const context = overlayRef.current?.getContext('2d');
    if (context && overlayRef.current) {
      context.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
    }
    framesRef.current = [];
    pendingFramesRef.current = null;
    setFrameCount(0);
    setFaceDetected(false);
    setCameraState('off');
  }

  useEffect(() => () => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    landmarkerRef.current?.close();
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
    error,
    loadModel,
    startCamera,
    stopCamera,
    clearError: () => setError(''),
  };
}