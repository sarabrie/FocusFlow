import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronLeft, FileText, LoaderCircle, PlayCircle } from 'lucide-react';
import { api } from '../api';
import { formatPercent, formatPosition } from '../format';
import { attentionLevel, groupByDay, lowSegments, parseServerDate, sessionDurationSeconds, summarizeSessions } from '../historyStats';
import { SessionTrendChart, TimelineChart } from '../components/ConcentrationCharts';

const timeFormat = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' });
const dateTimeFormat = new Intl.DateTimeFormat('he-IL', { dateStyle: 'full', timeStyle: 'short' });

function formatTime(value) {
  const date = parseServerDate(value);
  return date ? timeFormat.format(date) : '—';
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${Math.round(seconds)} שנ׳`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} דק׳`;
  return `${Math.floor(minutes / 60)} שע׳ ${minutes % 60} דק׳`;
}

function KindIcon({ type }) {
  return (
    <span className={type === 'text' ? 'content-kind kind-text' : 'content-kind'}>
      {type === 'text' ? <FileText size={18} /> : <PlayCircle size={18} />}
    </span>
  );
}

// Thin meter: fill length = score, fill color = level; the level is also written out, never color alone.
function LevelMeter({ score }) {
  const level = attentionLevel(score);
  return (
    <span className={`level-meter tone-${level.tone}`}>
      <span className="level-meter-value">{formatPercent(score)}</span>
      <span className="level-meter-track"><i style={{ width: `${Math.round((score ?? 0) * 100)}%` }} /></span>
      <span className="level-meter-label">{level.label}</span>
    </span>
  );
}

function StatTile({ label, value, hint, hero }) {
  return (
    <div className={hero ? 'stat-tile is-hero' : 'stat-tile'}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <small className="stat-hint">{hint}</small>}
    </div>
  );
}

function SessionDetail({ session, onClose }) {
  const readings = session.readings || [];
  const segments = lowSegments(readings);
  const isVideo = session.content_type === 'link';
  const lowest = readings.reduce((min, r) => (!min || r.score < min.score ? r : min), null);
  const started = parseServerDate(session.started_at);

  return (
    <main className="history-shell">
      <button type="button" className="button button-quiet history-back" onClick={onClose}>
        <ArrowLeft size={17} /> חזרה להיסטוריה
      </button>

      <header className="history-detail-head">
        <KindIcon type={session.content_type} />
        <div>
          <div className="section-kicker">פרטי סשן</div>
          <h1>{session.content_title || 'תוכן שנמחק'}</h1>
          <p>{started ? dateTimeFormat.format(started) : '—'}</p>
        </div>
      </header>

      <section className="stat-row">
        <StatTile hero label="ריכוז ממוצע" value={formatPercent(session.average_score)} hint={attentionLevel(session.average_score).label} />
        <StatTile label="משך הסשן" value={formatDuration(sessionDurationSeconds(session))} />
        <StatTile label="מדידות" value={session.reading_count} />
        <StatTile
          label="הרגע הכי חלש"
          value={lowest ? formatPercent(lowest.score) : '—'}
          hint={lowest ? `${isVideo ? 'בדקה' : 'במיקום'} ${formatPosition(lowest.position, session.content_type)}` : null}
        />
      </section>

      <section className="history-panel">
        <div className="panel-head">
          <h2>{isVideo ? 'ריכוז לאורך הסרטון' : 'ריכוז לאורך הטקסט'}</h2>
          <span className="panel-legend">
            <span><i className="legend-threshold" /> סף ריכוז נמוך (40%)</span>
            <span><i className="legend-low" /> ירידה מתחת לסף</span>
          </span>
        </div>
        <TimelineChart readings={readings} contentType={session.content_type} />
      </section>

      <section className="history-panel">
        <div className="panel-head"><h2>רגעים שבהם הריכוז ירד</h2></div>
        {segments.length === 0 ? (
          <p className="panel-empty">לא היו ירידות מתחת ל-40% בסשן הזה.</p>
        ) : (
          <ul className="low-moments">
            {segments.map((segment) => (
              <li key={segment.from}>
                <span className="low-moment-time">
                  {formatPosition(segment.from, session.content_type)}
                  {segment.to !== segment.from && ` – ${formatPosition(segment.to, session.content_type)}`}
                </span>
                <span className="low-moment-min">שפל של {formatPercent(segment.min)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="history-panel table-toggle">
        <summary>כל המדידות כטבלה ({readings.length})</summary>
        <div className="session-table-wrap">
          <table className="session-table">
            <thead>
              <tr>
                <th>{isVideo ? 'זמן בסרטון' : 'מיקום בטקסט'}</th>
                <th>ריכוז</th>
                <th>נמדד בשעה</th>
              </tr>
            </thead>
            <tbody>
              {readings.map((reading) => (
                <tr key={`${reading.position}-${reading.created_at}`}>
                  <td>{formatPosition(reading.position, session.content_type)}</td>
                  <td>{formatPercent(reading.score)}</td>
                  <td>{formatTime(reading.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </main>
  );
}

export function HistoryPage({ token, onBack, onUnauthorized }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSession, setSelectedSession] = useState(null);
  const [openingId, setOpeningId] = useState(null);

  async function loadSessions() {
    setLoading(true);
    setError('');
    try {
      setSessions(await api.getSessions(token));
    } catch (requestError) {
      if (requestError.status === 401) onUnauthorized();
      else setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSessions(); }, [token]);

  async function openSession(sessionId) {
    setOpeningId(sessionId);
    setError('');
    try {
      setSelectedSession(await api.getSession(token, sessionId));
      window.scrollTo({ top: 0 });
    } catch (requestError) {
      if (requestError.status === 401) onUnauthorized();
      else setError('לא הצלחנו לפתוח את הסשן.');
    } finally {
      setOpeningId(null);
    }
  }

  if (selectedSession) {
    return <SessionDetail session={selectedSession} onClose={() => setSelectedSession(null)} />;
  }

  const summary = summarizeSessions(sessions);
  const groups = groupByDay(sessions);

  return (
    <main className="history-shell">
      <button type="button" className="button button-quiet history-back" onClick={onBack}>
        <ArrowLeft size={17} /> חזרה לספרייה
      </button>

      <header className="library-heading history-heading">
        <div>
          <div className="section-kicker">היסטוריה</div>
          <h1>סשני ריכוז<span className="heading-period">.</span></h1>
          <p>כל סשן שסיימת, עם הריכוז שלך לאורך הזמן.</p>
        </div>
      </header>

      {error && <div className="form-message error-message" role="alert">{error}</div>}

      {loading ? (
        <div className="loading-state"><LoaderCircle className="spin" size={22} /> טוענים את ההיסטוריה...</div>
      ) : sessions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-symbol"><FileText size={24} /></div>
          <div className="section-kicker">עדיין אין מה לראות</div>
          <h2>אין סשנים עדיין.</h2>
          <p>פתחי סרטון מהספרייה והתחילי סשן. הוא יופיע כאן כשתסיימי.</p>
        </div>
      ) : (
        <>
          <section className="stat-row">
            <StatTile hero label="ריכוז ממוצע" value={formatPercent(summary.average)} hint={attentionLevel(summary.average).label} />
            <StatTile label="סשנים" value={summary.count} />
            <StatTile label="זמן כולל" value={formatDuration(summary.totalSeconds)} />
            <StatTile
              label="הסשן הכי מרוכז"
              value={summary.best ? formatPercent(summary.best.average_score) : '—'}
              hint={summary.best?.content_title}
            />
          </section>

          {sessions.some((s) => s.average_score !== null) && (
            <section className="history-panel">
              <div className="panel-head">
                <h2>ריכוז ממוצע לפי סשן</h2>
                <span className="panel-legend">
                  <span><i className="legend-threshold" /> סף ריכוז נמוך (40%)</span>
                  <span className="panel-note">12 הסשנים האחרונים · לחיצה פותחת סשן</span>
                </span>
              </div>
              <SessionTrendChart sessions={sessions} onSelect={openSession} />
            </section>
          )}

          <section className="history-groups">
            {groups.map((group) => (
              <div key={group.label} className="history-group">
                <h3 className="history-day">{group.label}</h3>
                <div className="history-list">
                  {group.sessions.map((session) => (
                    <button
                      type="button"
                      key={session.id}
                      className="history-item"
                      onClick={() => openSession(session.id)}
                      disabled={openingId === session.id}
                    >
                      <KindIcon type={session.content_type} />
                      <span className="history-main">
                        <strong>{session.content_title || 'תוכן שנמחק'}</strong>
                        <small>
                          {formatTime(session.started_at)} · {formatDuration(sessionDurationSeconds(session))} · {session.reading_count} מדידות
                        </small>
                      </span>
                      <LevelMeter score={session.average_score} />
                      <span className="open-arrow">{openingId === session.id ? <LoaderCircle className="spin" size={16} /> : <ChevronLeft size={18} />}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
