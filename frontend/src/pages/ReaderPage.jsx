import { useEffect, useState } from 'react';
import React from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Link2,
  Upload,
  X,
} from 'lucide-react';
import { useAttentionTracker } from '../useAttentionTracker';

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

export function ReaderPage({ content, token, onBack, onUnauthorized }) {
  const tracker = useAttentionTracker({ token, contentId: content.id, onUnauthorized });
  const [consent, setConsent] = useState(false);
  const embedUrl = content.type === 'link' ? toEmbedUrl(content.source) : null;

  useEffect(() => () => tracker.stopCamera(), []);

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
            <span>{tracker.latestScore === null ? 'עדיין אין ציון' : `ציון אחרון ${tracker.latestScore}`}</span>
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
                      className="source-frame"
                      title={`תוכן: ${content.title}`}
                      src={embedUrl}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      referrerPolicy="strict-origin-when-cross-origin"
                      loading="lazy"
                    />
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
              <h2>קשב בזמן קריאה</h2>
            </div>
            <span className="live-indicator"><i /> מקומי</span>
          </div>

          <div className="score-display">
            <strong>{tracker.latestScore === null ? '--' : tracker.latestScore}</strong>
            <span>/ 100</span>
            <div className="score-track"><i style={{ width: `${tracker.latestScore ?? 0}%` }} /></div>
          </div>

          <div className="capture-status">
            <span className={`status-dot ${tracker.cameraState === 'running' ? 'is-live' : ''}`} />
            {tracker.cameraState === 'running' ? (tracker.faceDetected ? 'פנים זוהו' : 'מחפשים פנים בפריים') : tracker.cameraState === 'starting' ? 'מתחברים למצלמה...' : 'המצלמה כבויה'}
          </div>

          {tracker.cameraState === 'running' ? (
            <div className="camera-preview">
              <video ref={tracker.videoRef} playsInline muted />
              <canvas ref={tracker.overlayRef} />
              <button type="button" className="camera-stop" onClick={tracker.stopCamera}><X size={15} /> עצירה</button>
            </div>
          ) : (
            <div className="camera-placeholder">
              <div className="camera-aperture"><span /><i /><b /></div>
              <span>תצוגת מצלמה תופיע כאן</span>
            </div>
          )}

          <div className="model-picker">
            <div className="model-picker-title">
              <span>מודל קשב</span>
              <span className={`model-state ${tracker.modelState}`}>
                {tracker.modelState === 'ready' ? <><Check size={13} /> מוכן</> : tracker.modelState === 'loading' ? 'טוען...' : 'נדרש קובץ'}
              </span>
            </div>

            <label className="file-button">
              <Upload size={16} />
              <span>{tracker.modelName || 'בחירת קובץ ONNX'}</span>
              <input type="file" accept=".onnx,application/onnx" onChange={(event) => tracker.loadModel(event.target.files?.[0])} />
            </label>

            <small>קלט צפוי: 100 פריימים × 478 נקודות × XYZ; פלט: הסתברות 0–1.</small>
          </div>

          {tracker.cameraState !== 'running' && (
            <div className="consent-box">
              <label className="consent-check">
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span className="custom-check"><Check size={13} /></span>
                <span>אני מאשר להפעיל את המצלמה לצורך מדידת קשב</span>
              </label>

              <button
                type="button"
                className="button button-dark button-wide"
                onClick={tracker.startCamera}
                disabled={!consent || !tracker.modelName || tracker.cameraState === 'starting'}
              >
                {tracker.cameraState === 'starting' ? 'מתחבר...' : 'הפעלת מצלמה'}
              </button>
            </div>
          )}

          {tracker.error && <div className="form-message error-message" role="alert">{tracker.error}</div>}
        </aside>
      </div>
    </main>
  );
}
