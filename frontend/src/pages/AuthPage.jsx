import { useState } from 'react';
import React from 'react';
import {
  ArrowDownLeft,
  BookOpen,
  CircleHelp,
  LoaderCircle,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../api';

export function AuthPage({ onAuthenticated }) {
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
        <div className="brand brand-light">
          <span className="brand-mark"><BookOpen size={19} /></span>
          FocusFlow
        </div>
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
            <button
              type="button"
              className={mode === 'login' ? 'selected' : ''}
              onClick={() => { setMode('login'); setError(''); setNotice(''); }}
            >
              התחברות
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'selected' : ''}
              onClick={() => { setMode('register'); setError(''); setNotice(''); }}
            >
              הרשמה
            </button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {mode === 'register' && (
              <label>
                שם לתצוגה
                <input
                  value={values.display_name}
                  onChange={(event) => setValues({ ...values, display_name: event.target.value })}
                  autoComplete="name"
                  required
                  minLength={1}
                />
              </label>
            )}

            <label>
              כתובת אימייל
              <input
                type="email"
                value={values.email}
                onChange={(event) => setValues({ ...values, email: event.target.value })}
                autoComplete="email"
                required
              />
            </label>

            <label>
              סיסמה
              <input
                type="password"
                value={values.password}
                onChange={(event) => setValues({ ...values, password: event.target.value })}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'register' ? 8 : undefined}
              />
            </label>

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
