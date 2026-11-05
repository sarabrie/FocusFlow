import { useEffect, useRef, useState } from 'react';
import React from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Link2,
  X,
} from 'lucide-react';
import { api } from '../api';
import { useAttentionTracker } from '../useAttentionTracker';
import { useYouTubePlayer, withJsApi } from '../useYouTubePlayer';
import { initialInterventionState, step as interventionStep } from '../interventions';
import { playAlertSound, unlockAlertSound } from '../alertSound';
import { formatClock, formatPercent } from '../format';

// Reminder lowers the video to 30% of its volume until concentration recovers.
const REMINDER_VOLUME = 0.3;

export function toEmbedUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  const pathSegments = parsed.pathname.split('/').filter(Boolean);

  let videoId = null;

  if (hostname === 'youtu.be') {
    videoId = pathSegments[0] ?? null;
  } else if (hostname === 'youtube.com' || hostname === 'www.youtube.com' || hostname === 'm.youtube.com') {
    videoId = parsed.searchParams.get('v');

    if (!videoId && pathSegments.length >= 2) {
      const [kind, candidateId] = pathSegments;
      if (['embed', 'shorts', 'live'].includes(kind)) {
        videoId = candidateId;
      }
    }
  }

  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return null;
  }

  return `https://www.youtube.com/embed/${videoId}`;
}

const GAUGE_CENTER = 100;
const GAUGE_RADIUS = 78;
const GAUGE_SWEEP = 270;
const GAUGE_ARC_LENGTH = (GAUGE_SWEEP / 360) * 2 * Math.PI * GAUGE_RADIUS;

// 0 → bottom-left, 100 → bottom-right, clockwise like a car speedometer.
function gaugeAngle(percent) {
  return -GAUGE_SWEEP / 2 + (GAUGE_SWEEP * percent) / 100;
}

function gaugePoint(percent, radius) {
  const radians = (gaugeAngle(percent) * Math.PI) / 180;
  return [GAUGE_CENTER + radius * Math.sin(radians), GAUGE_CENTER - radius * Math.cos(radians)];
}

function gaugeLevel(percent) {
  if (percent === null) return { tone: 'idle', label: 'ממתין למדידה' };
  if (percent < 40) return { tone: 'low', label: 'קשב נמוך' };
  if (percent < 70) return { tone: 'mid', label: 'קשב בינוני' };
  return { tone: 'high', label: 'קשב גבוה' };
}

function AttentionGauge({ percent }) {
  const value = percent ?? 0;
  const level = gaugeLevel(percent);
  const [startX, startY] = gaugePoint(0, GAUGE_RADIUS);
  const [endX, endY] = gaugePoint(100, GAUGE_RADIUS);
  const arcPath = `M ${startX} ${startY} A ${GAUGE_RADIUS} ${GAUGE_RADIUS} 0 1 1 ${endX} ${endY}`;
  const ticks = Array.from({ length: 21 }, (_, index) => index * 5);

  return (
    <div className={`attention-gauge tone-${level.tone}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-label="ציון קשב">
      <svg viewBox="0 0 200 186" dir="ltr">
        <path className="gauge-track" d={arcPath} />
        <path
          className="gauge-fill"
          d={arcPath}
          strokeDasharray={GAUGE_ARC_LENGTH}
          strokeDashoffset={GAUGE_ARC_LENGTH * (1 - value / 100)}
        />
        {ticks.map((tick) => {
          const major = tick % 10 === 0;
          const [x1, y1] = gaugePoint(tick, GAUGE_RADIUS - 12);
          const [x2, y2] = gaugePoint(tick, GAUGE_RADIUS - (major ? 20 : 16));
          const [labelX, labelY] = gaugePoint(tick, GAUGE_RADIUS - 31);
          return (
            <g key={tick}>
              <line className={major ? 'gauge-tick major' : 'gauge-tick'} x1={x1} y1={y1} x2={x2} y2={y2} />
              {tick % 20 === 0 && <text className="gauge-label" x={labelX} y={labelY}>{tick}</text>}
            </g>
          );
        })}
        <g className="gauge-needle" style={{ transform: `rotate(${gaugeAngle(value)}deg)` }}>
          <path d={`M ${GAUGE_CENTER - 3.5} ${GAUGE_CENTER} L ${GAUGE_CENTER} ${GAUGE_CENTER - GAUGE_RADIUS + 16} L ${GAUGE_CENTER + 3.5} ${GAUGE_CENTER} Z`} />
        </g>
        <circle className="gauge-hub" cx={GAUGE_CENTER} cy={GAUGE_CENTER} r="7" />
        <text className="gauge-value" x={GAUGE_CENTER} y={GAUGE_CENTER + 56}>{percent === null ? '--' : `${percent}%`}</text>
        <text className="gauge-caption" x={GAUGE_CENTER} y={GAUGE_CENTER + 76} dir="rtl">{level.label}</text>
      </svg>
    </div>
  );
}

export function ReaderPage({ content, token, onBack, onUnauthorized, onViewHistory }) {
  const [consent, setConsent] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [sessionMessage, setSessionMessage] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [readingPosition, setReadingPosition] = useState(0);
  const lastReadingRef = useRef({ position: null, score: null });
  const sessionClosedRef = useRef(false);
  const [intervention, setIntervention] = useState(null);
  const iframeRef = useRef(null);
  const interventionRef = useRef(initialInterventionState);
  // Per-session counts for the summary; refs because they don't need to re-render anything.
  const sessionStatsRef = useRef({ startedAt: null, reminders: 0, pauses: 0 });
  const embedUrl = content.type === 'link' ? toEmbedUrl(content.source) : null;
  const isVideo = Boolean(embedUrl);
  const player = useYouTubePlayer(iframeRef, isVideo);
  // For videos, concentration only counts while the video plays; a paused video is a break, not distraction.
  const measuring = !isVideo || player.playing;

  function handleTick(concentration) {
    if (!isVideo || !sessionId) return;
    const { state, actions } = interventionStep(interventionRef.current, {
      now: Date.now(),
      score: concentration.score,
      away: concentration.away,
      playing: player.playing,
    });
    interventionRef.current = state;

    actions.forEach((action) => {
      if (action === 'remind') {
        sessionStatsRef.current.reminders += 1;
        player.duckVolume(REMINDER_VOLUME);
        playAlertSound();
        setIntervention('remind');
      } else if (action === 'restore') {
        player.restoreVolume();
        setIntervention((current) => (current === 'remind' ? null : current));
      } else if (action === 'pause') {
        sessionStatsRef.current.pauses += 1;
        player.pause();
        playAlertSound();
        setIntervention('pause');
      }
    });
  }

  useEffect(() => {
    if (player.playing) setIntervention((current) => (current === 'pause' ? null : current));
  }, [player.playing]);

  const tracker = useAttentionTracker({
    onTick: handleTick,
    onScore: async (score) => {
      if (!sessionId || !measuring) return;
      const safeScore = Number(Math.min(Math.max(score, 0), 1).toFixed(4));
      if (!Number.isFinite(safeScore)) return;

      // Videos store the second in the video; text stores the scroll percentage.
      const position = isVideo ? player.currentTime() ?? 0 : readingPosition;
      const last = lastReadingRef.current;
      const sameValue = last.position !== null && last.score !== null && Math.abs(position - last.position) < 1 && Math.abs(safeScore - last.score) < 0.01;
      if (sameValue) return;

      setSessionMessage('שומר מדידה...');
      lastReadingRef.current = { position, score: safeScore };

      try {
        await api.addReading(token, sessionId, {
          position: Number(position.toFixed(2)),
          score: safeScore,
        });
        setSessionMessage('');
      } catch (requestError) {
        if (requestError.status === 401) onUnauthorized();
        else {
          setSessionError('שמירה נכשלה');
          setSessionMessage('');
        }
      }
    },
  });

  async function startSession() {
    if (!content?.id) return null;
    setSessionMessage('');
    setSessionError('');

    try {
      const created = await api.startSession(token, content.id);
      setSessionId(created.id);
      sessionClosedRef.current = false;
      sessionStatsRef.current = { startedAt: Date.now(), reminders: 0, pauses: 0 };
      lastReadingRef.current = { position: null, score: null };
      interventionRef.current = initialInterventionState;
      setSessionMessage('סשן התחיל. מדידות יישמרו בזמן הקריאה.');
      return created.id;
    } catch (requestError) {
      if (requestError.status === 401) onUnauthorized();
      else setSessionError('לא הצלחנו להתחיל סשן קריאה.');
      return null;
    }
  }

  async function finishSession() {
    if (!sessionId) return;

    try {
      const result = await api.endSession(token, sessionId);
      sessionClosedRef.current = true;
      // Ending the session also ends the watching: stop the video and undo a lowered volume.
      player.restoreVolume();
      player.pause();
      interventionRef.current = initialInterventionState;
      setIntervention(null);
      const stats = sessionStatsRef.current;
      setSessionSummary({
        ...result,
        durationSeconds: stats.startedAt ? (Date.now() - stats.startedAt) / 1000 : null,
        reminders: stats.reminders,
        pauses: stats.pauses,
      });
      setSessionMessage('הסשן נסגר והיסטוריית הקריאה עודכנה.');
      setSessionId(null);
      tracker.stopCamera();
    } catch (requestError) {
      if (requestError.status === 401) onUnauthorized();
      else setSessionError('שמירת הסשן נכשלה.');
    }
  }

  useEffect(() => {
    const handleScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const percent = maxScroll > 0 ? (window.scrollY / maxScroll) * 100 : 0;
      setReadingPosition(Math.min(100, Math.max(0, percent)));
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [content.id]);

  useEffect(() => {
    const handlePageHide = () => {
      if (sessionId && !sessionClosedRef.current) {
        void api.endSession(token, sessionId).catch(() => {});
        sessionClosedRef.current = true;
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      if (sessionId && !sessionClosedRef.current) {
        void api.endSession(token, sessionId).catch(() => {});
        sessionClosedRef.current = true;
      }
    };
  }, [sessionId, token]);

  const handleStartCamera = async () => {
    setSessionError('');
    const activeSessionId = sessionId ?? await startSession();

    if (!activeSessionId) {
      setSessionMessage('המצלמה לא הופעלה; אפשר להמשיך לקריאה בלי מדידה.');
      return;
    }

    if (tracker.cameraState === 'running') return;

    const wasConsent = consent;
    if (!wasConsent) {
      setSessionMessage('כדי להפעיל מצלמה, עליך לאשר שימוש במצלמה.');
      return;
    }

    setSessionMessage('המערכת אוספת רק נקודות פנים לצורך מדידת קשב, הסרטון לא עוזב את הדפדפן.');
    tracker.startCamera();
  };

  // Consent was already given for the previous session, so a new one starts the camera right away.
  async function startNewSession() {
    setSessionSummary(null);
    setSessionMessage('');
    setSessionError('');
    unlockAlertSound();
    await handleStartCamera();
  }

  const showLowAttention = tracker.lowAttention && sessionId && measuring;
  const scorePercent = tracker.latestScore === null ? null : Math.round(tracker.latestScore * 100);

  useEffect(() => {
    if (tracker.modelState === 'error') {
      setSessionMessage('מודל הקשב לא נטען. אפשר להמשיך לקריאה בלי מדידה.');
    }
  }, [tracker.modelState]);

  return (
    <main className="reader-shell">
      <header className="reader-topbar">
        <button type="button" className="button button-quiet" onClick={onBack}><ArrowLeft size={17} /> חזרה לספרייה</button>
        <div className="brand"><span className="brand-mark"><BookOpen size={18} /></span> FocusFlow</div>
        <span className="reader-label">מרחב קריאה</span>
      </header>

      <div className="reader-grid">
        <section className="reading-pane">
          <div className="reader-meta">
            <span>{content.type === 'text' ? 'טקסט שמור' : 'קריאה מקישור'}</span>
            <span>{scorePercent === null ? 'עדיין אין ציון' : `ציון אחרון ${scorePercent}`}</span>
          </div>

          <h1>{content.title}</h1>

          {content.type === 'text' ? (
            <div className="reading-text">{content.source}</div>
          ) : (
            <>
              <div className="external-source">
                <Link2 size={17} />
                <a href={content.source} target="_blank" rel="noreferrer">פתיחת המקור בחלון חדש</a>
                <span>{content.source}</span>
              </div>

              {embedUrl ? (
                <>
                  <div className="video-frame-wrap">
                    <iframe
                      ref={iframeRef}
                      className="source-frame"
                      title={`תוכן: ${content.title}`}
                      src={withJsApi(embedUrl)}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      referrerPolicy="strict-origin-when-cross-origin"
                    />
                    {intervention === 'pause' && (
                      <div className="focus-overlay" role="alert">
                        <strong>הסרטון נעצר</strong>
                        <span>נראה שהריכוז ירד לזמן ממושך. קחי נשימה וחזרי כשאת מוכנה.</span>
                        <button type="button" className="button button-lime" onClick={() => { setIntervention(null); player.play(); }}>המשך צפייה</button>
                      </div>
                    )}
                  </div>
                  <p className="frame-note">אם האתר חוסם הצגה כאן, פתחו את המקור בחלון חדש.</p>
                </>
              ) : (
                <>
                  <p className="frame-note warning-note">לא ניתן להציג את הסרטון בתוך האתר. אפשר לפתוח את הקישור בחלון חדש.</p>
                </>
              )}
            </>
          )}
        </section>

        <aside className="focus-panel">
          <div className="focus-panel-head">
            <div>
              <div className="section-kicker">מדד אישי</div>
              <h2>{isVideo ? 'ריכוז בזמן צפייה' : 'ריכוז בזמן קריאה'}</h2>
            </div>
            <span className="live-indicator"><i /> מקומי</span>
          </div>

          <AttentionGauge percent={scorePercent} />

          {intervention === 'remind' && <div className="form-message warning-message" role="status">תזכורת: נראה שהריכוז ירד, הנמכנו את הווליום. הוא יחזור כשתתרכזי שוב.</div>}
          {isVideo && tracker.cameraState === 'running' && !player.playing && intervention !== 'pause' && (
            <div className="form-message" role="status">הסרטון לא מנגן, המדידה מושהית.</div>
          )}

          {tracker.breakdown && (
            <dl className="score-compare">
              <div className="is-primary"><dt>ריכוז</dt><dd>{scorePercent}%</dd></div>
              <div><dt>קשב חזותי (מסתכלת על המסך)</dt><dd>{Math.round(tracker.breakdown.visual * 100)}%</dd></div>
              <div><dt>משולב (90% קשב חזותי + 10% מודל)</dt><dd>{tracker.breakdown.combined === null ? 'ממתין למודל' : `${Math.round(tracker.breakdown.combined * 100)}%`}</dd></div>
              <div><dt>מודל ONNX לבד</dt><dd>{tracker.breakdown.model === null ? 'ממתין' : `${Math.round(tracker.breakdown.model * 100)}%`}</dd></div>
            </dl>
          )}

          {tracker.breakdown && (
            <dl className="score-breakdown">
              <div><dt>כיוון ראש</dt><dd>{Math.round(tracker.breakdown.head * 100)}</dd></div>
              <div><dt>מבט</dt><dd>{Math.round(tracker.breakdown.gaze * 100)}</dd></div>
              <div><dt>עיניים פתוחות</dt><dd>{Math.round(tracker.breakdown.eyes * 100)}</dd></div>
              <div><dt>פנים בפריים</dt><dd>{Math.round(tracker.breakdown.face * 100)}</dd></div>
              <div><dt>תנועת מבט</dt><dd>{Math.round(tracker.breakdown.parts.stare * 100)}</dd></div>
              <div><dt>מצמוצים/דקה</dt><dd>{tracker.breakdown.raw.bpm === null ? '--' : Math.round(tracker.breakdown.raw.bpm)}</dd></div>
              <div><dt>פיהוק</dt><dd>{tracker.breakdown.raw.yawn ? 'כן' : 'לא'}</dd></div>
              <div><dt>שקט ראש</dt><dd>{Math.round(tracker.breakdown.parts.restless * 100)}</dd></div>
              <div><dt>בטאב</dt><dd>{tracker.breakdown.away ? 'לא' : 'כן'}</dd></div>
            </dl>
          )}

          <div className="capture-status">
            <span className={`status-dot ${tracker.cameraState === 'running' ? 'is-live' : ''}`} />
            {tracker.cameraState === 'running' ? (tracker.faceDetected ? 'פנים זוהו' : 'מחפשים פנים בפריים') : tracker.cameraState === 'starting' ? 'מתחברים למצלמה...' : 'המצלמה כבויה'}
          </div>

          {/* The video stays mounted so the tracker can attach the stream before the camera is "running". */}
          <div className="camera-preview" style={tracker.cameraState === 'running' ? undefined : { display: 'none' }}>
            <video ref={tracker.videoRef} playsInline muted autoPlay />
            <canvas ref={tracker.overlayRef} />
            <button type="button" className="camera-stop" onClick={tracker.stopCamera}><X size={15} /> עצירה</button>
          </div>
          {tracker.cameraState !== 'running' && (
            <div className="camera-placeholder">
              <div className="camera-aperture"><span /><i /><b /></div>
              <span>תצוגת מצלמה תופיע כאן</span>
            </div>
          )}

          {showLowAttention && <div className="form-message error-message" role="status">נראה שהקשב ירד. אולי כדאי לעשות הפסקה קצרה.</div>}

          <div className="model-picker">
            <div className="model-picker-title">
              <span>מודל קשב</span>
              <span className={`model-state ${tracker.modelState}`}>
                {tracker.modelState === 'ready' ? <><Check size={13} /> מוכן</> : tracker.modelState === 'loading' ? 'טוען...' : 'שגיאה'}
              </span>
            </div>

            <small>ריכוז = קשב חזותי (ראש, מבט, עיניים) × מעורבות (תנועת מבט, מצמוצים, פיהוקים, שקט ראש). מתעדכן כל שנייה{isVideo ? ' ונמדד רק כשהסרטון מנגן' : ''}. {tracker.modelName || 'v4_2.onnx'} מוצג להשוואה בלבד ({tracker.progressText}).</small>
          </div>

          {sessionSummary ? (
            <div className="session-summary-box">
              <div className="section-kicker">סיכום סשן</div>
              <strong>{formatPercent(sessionSummary.average_score)}</strong>
              <span>ריכוז ממוצע</span>
              <dl className="summary-stats">
                <div><dt>משך</dt><dd>{sessionSummary.durationSeconds === null ? '—' : formatClock(sessionSummary.durationSeconds)}</dd></div>
                <div><dt>מדידות</dt><dd>{sessionSummary.reading_count}</dd></div>
                {isVideo && <div><dt>תזכורות</dt><dd>{sessionSummary.reminders}</dd></div>}
                {isVideo && <div><dt>עצירות</dt><dd>{sessionSummary.pauses}</dd></div>}
              </dl>
              <div className="session-summary-actions">
                <button type="button" className="button button-dark button-wide" onClick={startNewSession}>סשן חדש</button>
                <button type="button" className="button button-outline button-wide" onClick={onViewHistory}>להיסטוריה</button>
              </div>
            </div>
          ) : (
            <div className="consent-box">
              <label className="consent-check">
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span className="custom-check"><Check size={13} /></span>
                <span>אני מאשר להפעיל את המצלמה לצורך מדידת קשב</span>
              </label>

              <button
                type="button"
                className="button button-dark button-wide"
                onClick={async () => {
                  if (!consent) {
                    setSessionMessage('כדי להפעיל מצלמה, עליך לאשר שימוש במצלמה.');
                    return;
                  }
                  // Must run inside the click: browsers block sound that wasn't started by a user gesture.
                  unlockAlertSound();
                  await handleStartCamera();
                }}
                disabled={!consent || tracker.cameraState === 'starting' || tracker.cameraState === 'running'}
              >
                {tracker.cameraState === 'starting' ? 'מתחבר...' : sessionId ? 'הפעלת מצלמה' : 'התחל סשן'}
              </button>

              <button type="button" className="button button-outline button-wide" onClick={finishSession} disabled={!sessionId}>סיים סשן</button>
            </div>
          )}

          {sessionMessage && <div className="form-message success-message" role="status">{sessionMessage}</div>}
          {sessionError && <div className="form-message error-message" role="alert">{sessionError}</div>}
          {tracker.error && <div className="form-message error-message" role="alert">{tracker.error}</div>}
        </aside>
      </div>
    </main>
  );
}
