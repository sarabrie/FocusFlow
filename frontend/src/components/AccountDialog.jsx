import React, { useState } from 'react';
import { KeyRound, LoaderCircle, Trash2, X } from 'lucide-react';
import { api } from '../api';

// Same rules the server enforces (schemas/auth.py), checked here only to give feedback before submitting.
export function passwordProblem(password) {
  if (password.length < 8) return 'הסיסמה חייבת להכיל לפחות 8 תווים';
  if (new TextEncoder().encode(password).length > 72) return 'הסיסמה ארוכה מדי';
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return 'הסיסמה חייבת להכיל לפחות אות אחת וספרה אחת';
  return '';
}

export function AccountDialog({ token, onClose, onTokenChanged, onAccountDeleted, onUnauthorized }) {
  const [passwords, setPasswords] = useState({ current: '', next: '' });
  const [deletePassword, setDeletePassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);

  function handleError(requestError) {
    if (requestError.status === 401) onUnauthorized();
    else setMessage({ type: 'error', text: requestError.message });
  }

  async function changePassword(event) {
    event.preventDefault();
    const problem = passwordProblem(passwords.next);
    if (problem) {
      setMessage({ type: 'error', text: problem });
      return;
    }
    setBusy('password');
    setMessage(null);
    try {
      const result = await api.changePassword(token, { current_password: passwords.current, new_password: passwords.next });
      onTokenChanged(result.access_token);
      setPasswords({ current: '', next: '' });
      setMessage({ type: 'success', text: 'הסיסמה הוחלפה. מכשירים אחרים נותקו.' });
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setBusy('');
    }
  }

  async function deleteAccount(event) {
    event.preventDefault();
    setBusy('delete');
    setMessage(null);
    try {
      await api.deleteAccount(token, deletePassword);
      onAccountDeleted();
    } catch (requestError) {
      handleError(requestError);
      setBusy('');
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="add-modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <div className="modal-heading">
          <div>
            <div className="section-kicker">הגדרות</div>
            <h2 id="account-title">החשבון שלי.</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="סגירה"><X size={20} /></button>
        </div>

        <form className="add-form" onSubmit={changePassword}>
          <h3 className="account-section-title"><KeyRound size={16} /> החלפת סיסמה</h3>
          <label>
            סיסמה נוכחית
            <input type="password" autoComplete="current-password" value={passwords.current} onChange={(event) => setPasswords({ ...passwords, current: event.target.value })} required />
          </label>
          <label>
            סיסמה חדשה
            <input type="password" autoComplete="new-password" value={passwords.next} onChange={(event) => setPasswords({ ...passwords, next: event.target.value })} required minLength={8} />
            <small className="field-hint">לפחות 8 תווים, עם אות וספרה.</small>
          </label>
          <div className="modal-actions">
            <button className="button button-dark" disabled={busy !== ''}>
              {busy === 'password' && <LoaderCircle className="spin" size={16} />} החלפת סיסמה
            </button>
          </div>
        </form>

        {message && <div className={`form-message ${message.type === 'error' ? 'error-message' : 'success-message'}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</div>}

        <form className="add-form account-danger" onSubmit={deleteAccount}>
          <h3 className="account-section-title"><Trash2 size={16} /> מחיקת חשבון</h3>
          <p>מוחק לצמיתות את החשבון, את כל התכנים, הסשנים והמדידות. אי אפשר לבטל.</p>
          {!confirmDelete ? (
            <div className="modal-actions">
              <button type="button" className="button button-outline danger-button" onClick={() => setConfirmDelete(true)}>מחיקת החשבון</button>
            </div>
          ) : (
            <>
              <label>
                הקלידי סיסמה לאישור
                <input type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} required />
              </label>
              <div className="modal-actions">
                <button type="button" className="button button-quiet" onClick={() => { setConfirmDelete(false); setDeletePassword(''); }}>ביטול</button>
                <button className="button danger-solid" disabled={busy !== ''}>
                  {busy === 'delete' && <LoaderCircle className="spin" size={16} />} מחיקה לצמיתות
                </button>
              </div>
            </>
          )}
        </form>
      </section>
    </div>
  );
}
