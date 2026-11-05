import { useEffect, useState } from 'react';
import { ArrowLeft, FileText, Link2, LoaderCircle } from 'lucide-react';
import { api } from '../api';

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function formatAverage(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Number(value).toFixed(2);
}

export function HistoryPage({ token, onBack, onUnauthorized, onOpenContent }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);

  async function loadSessions() {
    setLoading(true);
    setError('');
    try {
      const data = await api.getSessions(token);
      setSessions(data);
      if (selectedSessionId) {
        const current = data.find((session) => session.id === selectedSessionId);
        setSelectedSession(current || null);
      }
    } catch (requestError) {
      if (requestError.status === 401) onUnauthorized();
      else setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSessions(); }, [token]);

  async function openSession(sessionId) {
    setSelectedSessionId(sessionId);
    try {
      const detail = await api.getSession(token, sessionId);
      setSelectedSession(detail);
    } catch (requestError) {
      if (requestError.status === 401) onUnauthorized();
      else setSelectedSession({ notFound: true });
    }
  }

  if (selectedSession && !selectedSession.notFound) {
    return (
      <main className="history-shell">
        <header className="history-topbar">
          <button type="button" className="button button-quiet" onClick={() => { setSelectedSession(null); setSelectedSessionId(null); }}>
            <ArrowLeft size={17} /> חזרה להיסטוריה
          </button>
        </header>
        <section className="history-detail card-shell">
          <div className="section-kicker">פרטי סשן</div>
          <h1>{selectedSession.content_title || 'תוכן שנמחק'}</h1>
          <div className="history-metrics">
            <span>התחלה: {formatDateTime(selectedSession.started_at)}</span>
            <span>סיום: {formatDateTime(selectedSession.ended_at)}</span>
            <span>מדידות: {selectedSession.reading_count}</span>
            <span>ציון ממוצע: {formatAverage(selectedSession.average_score)}</span>
          </div>

          <div className="session-table-wrap">
            <table className="session-table">
              <thead>
                <tr>
                  <th>מיקום</th>
                  <th>ציון</th>
                  <th>זמן</th>
                </tr>
              </thead>
              <tbody>
                {(selectedSession.readings || []).map((reading) => (
                  <tr key={`${reading.position}-${reading.created_at}`}>
                    <td>{reading.position}</td>
                    <td>{Number(reading.score).toFixed(2)}</td>
                    <td>{formatDateTime(reading.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" className="button button-outline" onClick={() => { setSelectedSession(null); setSelectedSessionId(null); }}>
            חזרה
          </button>
        </section>
      </main>
    );
  }

  if (selectedSession && selectedSession.notFound) {
    return (
      <main className="history-shell">
        <header className="history-topbar">
          <button type="button" className="button button-quiet" onClick={() => { setSelectedSession(null); setSelectedSessionId(null); }}>
            <ArrowLeft size={17} /> חזרה להיסטוריה
          </button>
        </header>
        <section className="history-detail card-shell empty-state">
          <div className="empty-symbol"><FileText size={22} /></div>
          <h2>לא נמצא</h2>
        </section>
      </main>
    );
  }

  return (
    <main className="history-shell">
      <header className="history-topbar">
        <button type="button" className="button button-quiet" onClick={onBack}><ArrowLeft size={17} /> חזרה לספרייה</button>
      </header>

      <section className="history-card card-shell">
        <div className="library-heading history-header">
          <div>
            <div className="section-kicker">היסטוריית קריאה</div>
            <h1>סשני קשב<span className="heading-period">.</span></h1>
          </div>
        </div>

        {error && <div className="form-message error-message" role="alert">{error}</div>}

        {loading ? (
          <div className="loading-state"><LoaderCircle className="spin" size={22} /> טוענים את ההיסטוריה...</div>
        ) : sessions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-symbol"><FileText size={24} /></div>
            <div className="section-kicker">עדיין אין מה לראות</div>
            <h2>אין סשנים עדיין.</h2>
          </div>
        ) : (
          <div className="history-list">
            {sessions.map((session) => (
              <button type="button" key={session.id} className="history-item" onClick={() => openSession(session.id)}>
                <span className="history-icon">{session.content_title ? <FileText size={18} /> : <Link2 size={18} />}</span>
                <span className="history-main">
                  <strong>{session.content_title || 'תוכן שנמחק'}</strong>
                  <small>{formatDateTime(session.started_at)}</small>
                </span>
                <span className="history-meta">
                  <span>{session.reading_count} מדידות</span>
                  <span>ממוצע: {formatAverage(session.average_score)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
