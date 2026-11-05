import { useEffect, useState } from 'react';
import React from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  FileText,
  Link2,
  LoaderCircle,
  LogOut,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../api';

export function LibraryPage({ token, user, onOpen, onSignOut, onUnauthorized }) {
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
        <button type="button" className="side-link active"><BookOpen size={17} /> הספרייה <span className="side-count">{items.length}</span></button>

        <div className="sidebar-bottom">
          <div className="sidebar-tip"><span className="tip-dot" /><div><b>מרחב פרטי</b><small>התכנים שלך בלבד</small></div></div>
          <div className="user-block">
            <div className="user-avatar">{firstName.slice(0, 1)}</div>
            <div className="user-meta"><b>{firstName}</b><small>{user.email}</small></div>
            <button type="button" className="icon-button sidebar-logout" title="התנתקות" aria-label="התנתקות" onClick={onSignOut}><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="crumb">FocusFlow <ChevronLeft size={13} /> הספרייה</div>
          <div className="topbar-status"><span className="online-dot" /> נשמר בחשבון</div>
        </header>

        <div className="library-content">
          <div className="library-heading">
            <div>
              <div className="section-kicker">המרחב האישי שלך</div>
              <h1>ספריית תוכן<span className="heading-period">.</span></h1>
              <p>כל הדברים ששווה לחזור אליהם, מסודרים במקום אחד.</p>
            </div>
            <button type="button" className="button button-lime" onClick={() => setShowAdd(true)}><Plus size={18} /> הוספת תוכן</button>
          </div>

          {error && <div className="form-message error-message" role="alert">{error}</div>}

          <div className="library-toolbar">
            <div className="results-count">התכנים שלך <span>{items.length.toString().padStart(2, '0')}</span></div>
            <div className="sort-label">ממוינים מהחדש לישן</div>
          </div>

          {loading ? (
            <div className="loading-state"><LoaderCircle className="spin" size={22} /> טוענים את הספרייה...</div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-symbol"><BookOpen size={25} /></div>
              <div className="section-kicker">התחלה טובה</div>
              <h2>הספרייה עוד ריקה.</h2>
              <p>הוסיפו קישור או טקסט, והפריט הראשון יופיע כאן.</p>
              <button type="button" className="button button-outline" onClick={() => setShowAdd(true)}><Plus size={17} /> הוספת פריט ראשון</button>
            </div>
          ) : (
            <div className="content-list">
              {items.map((item, index) => (
                <article className="content-row" key={item.id}>
                  <button type="button" className="content-open" onClick={() => onOpen(item)} aria-label={`פתיחת ${item.title}`}>
                    <span className={`content-kind ${item.type === 'text' ? 'kind-text' : 'kind-link'}`}>
                      {item.type === 'text' ? <FileText size={18} /> : <Link2 size={18} />}
                    </span>
                    <span className="content-copy">
                      <span className="content-index">{String(index + 1).padStart(2, '0')} / {item.type === 'text' ? 'טקסט' : 'קישור'}</span>
                      <strong>{item.title}</strong>
                      <small>{item.source.length > 96 ? `${item.source.slice(0, 96)}…` : item.source}</small>
                    </span>
                    <span className="content-date">{new Date(item.created_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}</span>
                    <span className="open-arrow"><ArrowLeft size={17} /></span>
                  </button>

                  <button
                    type="button"
                    className="icon-button delete-button"
                    title="מחיקת פריט"
                    aria-label={`מחיקת ${item.title}`}
                    disabled={deleting === item.id}
                    onClick={(event) => removeContent(event, item.id)}
                  >
                    {deleting === item.id ? <LoaderCircle className="spin" size={17} /> : <Trash2 size={17} />}
                  </button>
                </article>
              ))}
            </div>
          )}

          <footer className="workspace-footer"><span>FOCUSFLOW / LIBRARY</span><span>התוכן שלך נשאר שלך</span></footer>
        </div>
      </section>

      {showAdd && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAdd(false); }}>
          <section className="add-modal" role="dialog" aria-modal="true" aria-labelledby="add-title">
            <div className="modal-heading">
              <div>
                <div className="section-kicker">פריט חדש</div>
                <h2 id="add-title">מוסיפים לספרייה.</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setShowAdd(false)} aria-label="סגירה"><X size={20} /></button>
            </div>

            <form className="add-form" onSubmit={addContent}>
              <fieldset className="type-choice">
                <legend>סוג התוכן</legend>
                <button type="button" className={type === 'link' ? 'type-option chosen' : 'type-option'} onClick={() => setType('link')}><Link2 size={17} /> קישור</button>
                <button type="button" className={type === 'text' ? 'type-option chosen' : 'type-option'} onClick={() => setType('text')}><FileText size={17} /> טקסט</button>
              </fieldset>

              <label>
                כותרת
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="למשל: מבוא לקשב" maxLength={200} required />
              </label>

              <label>
                {type === 'link' ? 'כתובת הקישור' : 'גוף הטקסט'}
                {type === 'link' ? (
                  <input type="url" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="https://" required />
                ) : (
                  <textarea value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="הדביקו כאן את הטקסט לקריאה..." rows={6} required />
                )}
              </label>

              {error && <div className="form-message error-message" role="alert">{error}</div>}

              <div className="modal-actions">
                <button type="button" className="button button-quiet" onClick={() => setShowAdd(false)}>ביטול</button>
                <button className="button button-dark" disabled={saving}>
                  {saving ? <LoaderCircle className="spin" size={16} /> : <Plus size={17} />}
                  הוספת פריט
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
