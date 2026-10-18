import React, { useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeft,
  BookOpen,
  Check,
  ChevronLeft,
  CircleHelp,
  FileText,
  Link2,
  LoaderCircle,
  LogOut,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api } from './api';
import { useAttentionTracker } from './useAttentionTracker';

function readSavedSession() {
  try {
    return JSON.parse(localStorage.getItem('focusflow_session') || 'null');
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState(readSavedSession);
  const [screen, setScreen] = useState('library');
  const [activeContent, setActiveContent] = useState(null);

  function signOut() {
    localStorage.removeItem('focusflow_session');
    setSession(null);
    setActiveContent(null);
  }

  if (!session?.access_token) {
    return <AuthScreen onAuthenticated={(nextSession) => {
      localStorage.setItem('focusflow_session', JSON.stringify(nextSession));
      setSession(nextSession);
    }} />;
  }

  if (screen === 'reader' && activeContent) {
    return (
      <ReaderScreen
        content={activeContent}
        token={session.access_token}
        onBack={() => { setScreen('library'); setActiveContent(null); }}
        onUnauthorized={signOut}
      />
    );
  }

  return (
    <LibraryScreen
      token={session.access_token}
      user={session}
      onOpen={(content) => { setActiveContent(content); setScreen('reader'); }}
      onSignOut={signOut}
      onUnauthorized={signOut}
    />
  );
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [values, setValues] = useState({ email: '', password: '', display_name: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'register') {
        await api.register(values);
        setMode('login');
        setNotice('החשבון נוצר. אפשר להתחבר עכשיו.');
      } else {
        const result = await api.login(values);
        onAuthenticated(result);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-layout">
      <aside className="auth-aside">
        <div className="brand brand-light"><span className="brand-mark"><BookOpen size={19} /></span> FocusFlow</div>
        <div className="auth-aside-copy">
          <span className="eyebrow">מרחב ללמידה ממוקדת</span>
          <h1>התוכן שלך.<br />הקצב שלך.</h1>
          <p>שומרים את מה שמעניין, חוזרים אליו, ונשארים עם הראש במשימה.</p>
        </div>
        <div className="privacy-note"><ShieldCheck size={17} /> המצלמה תופעל רק אחרי אישור מפורש שלך</div>
        <div className="aside-index">01 <span /> 03</div>
      </aside>
      <section className="auth-panel">
        <div className="auth-topline"><span>FOCUSFLOW / חשבון אישי</span><CircleHelp size={17} /></div>
        <div className="auth-form-wrap">
          <div className="section-kicker">ברוכים הבאים</div>
          <h2>{mode === 'login' ? 'נכנסים לעניינים.' : 'פותחים מרחב משלכם.'}</h2>
          <p className="muted">{mode === 'login' ? 'התחברו כדי להמשיך לספרייה שלכם.' : 'כמה פרטים קצרים, והספרייה מוכנה.'}</p>
          <div className="auth-tabs" role="tablist" aria-label="מצב חשבון">
            <button className={mode === 'login' ? 'selected' : ''} onClick={() => { setMode('login'); setError(''); setNotice(''); }}>התחברות</button>
            <button className={mode === 'register' ? 'selected' : ''} onClick={() => { setMode('register'); setError(''); setNotice(''); }}>הרשמה</button>
          </div>
          <form className="auth-form" onSubmit={submit}>
            {mode === 'register' && <label>שם לתצוגה<input value={values.display_name} onChange={(event) => setValues({ ...values, display_name: event.target.value })} autoComplete="name" required minLength={1} /></label>}
            <label>כתובת אימייל<input type="email" value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} autoComplete="email" required /></label>
            <label>סיסמה<input type="password" value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : undefined} /></label>
            {error && <div className="form-message error-message" role="alert">{error}</div>}
            {notice && <div className="form-message success-message" role="status">{notice}</div>}
            <button className="button button-dark button-wide" type="submit" disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={17} /> : null}
              {busy ? 'רגע...' : mode === 'login' ? 'התחברות לספרייה' : 'יצירת חשבון'}
              {!busy && <ArrowDownLeft size={17} />}
            </button>
          </form>
          <div className="auth-footnote"><ShieldCheck size={15} /> פרטי החשבון נשמרים בחיבור מאובטח</div>
        </div>
        <div className="auth-footer"><span>FOCUS / FLOW</span><span>כל התוכן במקום אחד</span></div>
      </section>
    </main>
  );
}

function LibraryScreen({ token, user, onOpen, onSignOut, onUnauthorized }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState('link');
  const [form, setForm] = useState({ title: '', source: '' });
  const [deleting, setDeleting] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      setItems(await api.listContent(token));
    } catch (requestError) {
      if (requestError.status === 401) onUnauthorized();
      else setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [token]);

  async function addContent(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.createContent(token, { ...form, type });
      setForm({ title: '', source: '' });
      setShowAdd(false);
      await refresh();
    } catch (requestError) {
      if (requestError.status === 401) onUnauthorized();
      else setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeContent(event, id) {
    event.stopPropagation();
    setDeleting(id);
    try {
      await api.deleteContent(token, id);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (requestError) {
      if (requestError.status === 401) onUnauthorized();
      else setError(requestError.message);
    } finally {
      setDeleting('');
    }
  }

  const firstName = user.display_name || user.email?.split('@')[0] || 'לומד/ת';

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><BookOpen size={19} /></span> FocusFlow</div>
        <div className="side-label">סביבת עבודה</div>
        <button className="side-link active"><BookOpen size={17} /> הספרייה <span className="side-count">{items.length}</span></button>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><span className="tip-dot" /><div><b>מרחב פרטי</b><small>התכנים שלך בלבד</small></div></div>
          <div className="user-block"><div className="user-avatar">{firstName.slice(0, 1)}</div><div className="user-meta"><b>{firstName}</b><small>{user.email}</small></div><button className="icon-button sidebar-logout" title="התנתקות" aria-label="התנתקות" onClick={onSignOut}><LogOut size={17} /></button></div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar"><div className="crumb">FocusFlow <ChevronLeft size={13} /> הספרייה</div><div className="topbar-status"><span className="online-dot" /> נשמר בחשבון</div></header>
        <div className="library-content">
          <div className="library-heading">
            <div><div className="section-kicker">המרחב האישי שלך</div><h1>ספריית תוכן<span className="heading-period">.</span></h1><p>כל הדברים ששווה לחזור אליהם, מסודרים במקום אחד.</p></div>
            <button className="button button-lime" onClick={() => setShowAdd(true)}><Plus size={18} /> הוספת תוכן</button>
          </div>

          {error && <div className="form-message error-message" role="alert">{error}</div>}
          <div className="library-toolbar"><div className="results-count">התכנים שלך <span>{items.length.toString().padStart(2, '0')}</span></div><div className="sort-label">ממוינים מהחדש לישן</div></div>

          {loading ? <div className="loading-state"><LoaderCircle className="spin" size={22} /> טוענים את הספרייה...</div> : items.length === 0 ? (
            <div className="empty-state"><div className="empty-symbol"><BookOpen size={25} /></div><div className="section-kicker">התחלה טובה</div><h2>הספרייה עוד ריקה.</h2><p>הוסיפו קישור או טקסט, והפריט הראשון יופיע כאן.</p><button className="button button-outline" onClick={() => setShowAdd(true)}><Plus size={17} /> הוספת פריט ראשון</button></div>
          ) : (
            <div className="content-list">
              {items.map((item, index) => <article className="content-row" key={item.id}>
                <button className="content-open" onClick={() => onOpen(item)} aria-label={`פתיחת ${item.title}`}>
                  <span className={`content-kind ${item.type === 'text' ? 'kind-text' : 'kind-link'}`}>{item.type === 'text' ? <FileText size={18} /> : <Link2 size={18} />}</span>
                  <span className="content-copy"><span className="content-index">{String(index + 1).padStart(2, '0')} / {item.type === 'text' ? 'טקסט' : 'קישור'}</span><strong>{item.title}</strong><small>{item.source.length > 96 ? `${item.source.slice(0, 96)}…` : item.source}</small></span>
                  <span className="content-date">{new Date(item.created_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}</span>
                  <span className="open-arrow"><ArrowLeft size={17} /></span>
                </button>
                <button className="icon-button delete-button" title="מחיקת פריט" aria-label={`מחיקת ${item.title}`} disabled={deleting === item.id} onClick={(event) => removeContent(event, item.id)}>{deleting === item.id ? <LoaderCircle className="spin" size={17} /> : <Trash2 size={17} />}</button>
              </article>)}
            </div>
          )}
          <footer className="workspace-footer"><span>FOCUSFLOW / LIBRARY</span><span>התוכן שלך נשאר שלך</span></footer>
        </div>
      </section>

      {showAdd && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAdd(false); }}>
        <section className="add-modal" role="dialog" aria-modal="true" aria-labelledby="add-title">
          <div className="modal-heading"><div><div className="section-kicker">פריט חדש</div><h2 id="add-title">מוסיפים לספרייה.</h2></div><button className="icon-button" onClick={() => setShowAdd(false)} aria-label="סגירה"><X size={20} /></button></div>
          <form className="add-form" onSubmit={addContent}>
            <fieldset className="type-choice"><legend>סוג התוכן</legend><button type="button" className={type === 'link' ? 'type-option chosen' : 'type-option'} onClick={() => setType('link')}><Link2 size={17} /> קישור</button><button type="button" className={type === 'text' ? 'type-option chosen' : 'type-option'} onClick={() => setType('text')}><FileText size={17} /> טקסט</button></fieldset>
            <label>כותרת<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="למשל: מבוא לקשב" maxLength={200} required /></label>
            <label>{type === 'link' ? 'כתובת הקישור' : 'גוף הטקסט'}{type === 'link' ? <input type="url" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="https://" required /> : <textarea value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="הדביקו כאן את הטקסט לקריאה..." rows={6} required />}</label>
            {error && <div className="form-message error-message" role="alert">{error}</div>}
            <div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setShowAdd(false)}>ביטול</button><button className="button button-dark" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Plus size={17} />} הוספת פריט</button></div>
          </form>
        </section>
      </div>}
    </main>
  );
}

function ReaderScreen({ content, token, onBack, onUnauthorized }) {
  const tracker = useAttentionTracker({ token, contentId: content.id, onUnauthorized });
  const [consent, setConsent] = useState(false);

  useEffect(() => () => tracker.stopCamera(), []);

  return (
    <main className="reader-shell">
      <header className="reader-topbar"><button className="button button-quiet" onClick={onBack}><ArrowLeft size={17} /> חזרה לספרייה</button><div className="brand"><span className="brand-mark"><BookOpen size={18} /></span> FocusFlow</div><span className="reader-label">מרחב קריאה</span></header>
      <div className="reader-grid">
        <section className="reading-pane">
          <div className="reader-meta"><span>{content.type === 'text' ? 'טקסט שמור' : 'קריאה מקישור'}</span><span>{tracker.latestScore === null ? 'עדיין אין ציון' : `ציון אחרון ${tracker.latestScore}`}</span></div>
          <h1>{content.title}</h1>
          {content.type === 'text' ? <div className="reading-text">{content.source}</div> : <>
            <div className="external-source"><Link2 size={17} /><a href={content.source} target="_blank" rel="noreferrer">פתיחת המקור בחלון חדש</a><span>{content.source}</span></div>
            <iframe className="source-frame" title={`תוכן: ${content.title}`} src={content.source} sandbox="allow-scripts allow-forms allow-popups" referrerPolicy="no-referrer" />
            <p className="frame-note">אם האתר חוסם הצגה כאן, פתחו את המקור בחלון חדש.</p>
          </>}
        </section>

        <aside className="focus-panel">
          <div className="focus-panel-head"><div><div className="section-kicker">מדד אישי</div><h2>קשב בזמן קריאה</h2></div><span className="live-indicator"><i /> מקומי</span></div>
          <div className="score-display"><strong>{tracker.latestScore === null ? '--' : tracker.latestScore}</strong><span>/ 100</span><div className="score-track"><i style={{ width: `${tracker.latestScore ?? 0}%` }} /></div></div>
          <div className="capture-status"><span className={`status-dot ${tracker.cameraState === 'running' ? 'is-live' : ''}`} />{tracker.cameraState === 'running' ? (tracker.faceDetected ? 'פנים זוהו' : 'מחפשים פנים בפריים') : tracker.cameraState === 'starting' ? 'מתחברים למצלמה...' : 'המצלמה כבויה'}</div>

          {tracker.cameraState === 'running' ? <div className="camera-preview"><video ref={tracker.videoRef} playsInline muted /><canvas ref={tracker.overlayRef} /><button className="camera-stop" onClick={tracker.stopCamera}><X size={15} /> עצירה</button></div> : <div className="camera-placeholder"><div className="camera-aperture"><span /><i /><b /></div><span>תצוגת מצלמה תופיע כאן</span></div>}

          <div className="model-picker"><div className="model-picker-title"><span>מודל קשב</span><span className={`model-state ${tracker.modelState}`}>{tracker.modelState === 'ready' ? <><Check size={13} /> מוכן</> : tracker.modelState === 'loading' ? 'טוען...' : 'נדרש קובץ'}</span></div><label className="file-button"><Upload size={16} /><span>{tracker.modelName || 'בחירת קובץ ONNX'}</span><input type="file" accept=".onnx,application/onnx" onChange={(event) => tracker.loadModel(event.target.files?.[0])} /></label><small>קלט צפוי: 100 פריימים × 478 נקודות × XYZ; פלט: הסתברות 0–1.</small></div>

          {tracker.cameraState !== 'running' && <div className="consent-box"><label className="consent-check"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span className="custom-check"><Check size={13} /></span><span>אני מאשר/ת שימוש במצלמה לצורך ניתוח מקומי בזמן הקריאה.</span></label><button className="button button-dark button-wide" disabled={!consent || tracker.modelState !== 'ready' || tracker.cameraState === 'starting'} onClick={tracker.startCamera}><span className="camera-icon" /> הפעלת מצלמה</button></div>}
          <div className="privacy-inline"><ShieldCheck size={15} /><span>וידאו ונקודות פנים לא נשלחים לשרת. נשלח רק ציון קשב בכל 100 פריימים.</span></div>
          {tracker.cameraState === 'running' && <div className="window-progress"><span>חלון ניתוח</span><span>{tracker.frameCount} / 100 פריימים</span><div><i style={{ width: `${tracker.frameCount}%` }} /></div></div>}
          {tracker.error && <div className="form-message error-message tracker-error" role="alert">{tracker.error}<button onClick={tracker.clearError} aria-label="סגירת הודעה"><X size={14} /></button></div>}
        </aside>
      </div>
    </main>
  );
}