import React from 'react';
import { useMemo, useState } from 'react';
import { AuthPage } from './pages/AuthPage';
import { HistoryPage } from './pages/HistoryPage';
import { LibraryPage } from './pages/LibraryPage';
import { ReaderPage } from './pages/ReaderPage';
import { AccountDialog } from './components/AccountDialog';
import { api } from './api';

function readSavedSession() {
  try {
    return JSON.parse(localStorage.getItem('focusflow_session') || 'null');
  } catch {
    return null;
  }
}

function AppNav({ currentScreen, onLibrary, onHistory, onAccount, onSignOut }) {
  const titleMap = {
    library: 'הספרייה שלי',
    history: 'היסטוריה',
    reader: 'קורא',
  };

  return (
    <nav className="app-nav" aria-label="ניווט ראשי">
      <div className="app-nav-main">
        <button type="button" className={currentScreen === 'library' ? 'nav-tab active' : 'nav-tab'} onClick={onLibrary}>
          הספרייה שלי
        </button>
        <button type="button" className={currentScreen === 'history' ? 'nav-tab active' : 'nav-tab'} onClick={onHistory}>
          היסטוריה
        </button>
      </div>
      <div className="app-nav-view">{titleMap[currentScreen] || 'FocusFlow'}</div>
      <button type="button" className="nav-tab nav-account" onClick={onAccount}>החשבון שלי</button>
      <button type="button" className="nav-logout" onClick={onSignOut}>התנתק</button>
    </nav>
  );
}

export default function App() {
  const [session, setSession] = useState(readSavedSession);
  const [screen, setScreen] = useState('library');
  const [activeContent, setActiveContent] = useState(null);
  const [showAccount, setShowAccount] = useState(false);

  const authToken = useMemo(() => session?.access_token || '', [session]);

  // Local sign-out only: used when the server already rejected the token (401) or the account is gone.
  function signOut() {
    localStorage.removeItem('focusflow_session');
    setSession(null);
    setActiveContent(null);
    setShowAccount(false);
    setScreen('library');
  }

  // "התנתק": also revokes the token on the server, so a copied token stops working too.
  function logout() {
    void api.logout(authToken).catch(() => {});
    signOut();
  }

  function replaceToken(accessToken) {
    const nextSession = { ...session, access_token: accessToken };
    localStorage.setItem('focusflow_session', JSON.stringify(nextSession));
    setSession(nextSession);
  }

  if (!session?.access_token) {
    return (
      <AuthPage
        onAuthenticated={(nextSession) => {
          localStorage.setItem('focusflow_session', JSON.stringify(nextSession));
          setSession(nextSession);
        }}
      />
    );
  }

  const renderScreen = () => {
    if (screen === 'reader' && activeContent) {
      return (
        <ReaderPage
          content={activeContent}
          token={authToken}
          onBack={() => { setScreen('library'); setActiveContent(null); }}
          onUnauthorized={signOut}
          onViewHistory={() => setScreen('history')}
        />
      );
    }

    if (screen === 'history') {
      return (
        <HistoryPage
          token={authToken}
          onBack={() => setScreen('library')}
          onUnauthorized={signOut}
          onOpenContent={(content) => { setActiveContent(content); setScreen('reader'); }}
        />
      );
    }

    return (
      <LibraryPage
        token={authToken}
        user={session}
        onOpen={(content) => { setActiveContent(content); setScreen('reader'); }}
        onSignOut={logout}
        onUnauthorized={signOut}
        onViewHistory={() => setScreen('history')}
      />
    );
  };

  return (
    <>
      <AppNav
        currentScreen={screen}
        onLibrary={() => { setScreen('library'); setActiveContent(null); }}
        onHistory={() => setScreen('history')}
        onAccount={() => setShowAccount(true)}
        onSignOut={logout}
      />
      {renderScreen()}
      {showAccount && (
        <AccountDialog
          token={authToken}
          onClose={() => setShowAccount(false)}
          onTokenChanged={replaceToken}
          onAccountDeleted={signOut}
          onUnauthorized={signOut}
        />
      )}
    </>
  );
}
