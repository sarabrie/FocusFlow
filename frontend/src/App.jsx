import React from 'react';
import { useMemo, useState } from 'react';
import { AuthPage } from './pages/AuthPage';
import { HistoryPage } from './pages/HistoryPage';
import { LibraryPage } from './pages/LibraryPage';
import { ReaderPage } from './pages/ReaderPage';

function readSavedSession() {
  try {
    return JSON.parse(localStorage.getItem('focusflow_session') || 'null');
  } catch {
    return null;
  }
}

function AppNav({ currentScreen, onLibrary, onHistory, onSignOut }) {
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
      <button type="button" className="nav-logout" onClick={onSignOut}>התנתק</button>
    </nav>
  );
}

export default function App() {
  const [session, setSession] = useState(readSavedSession);
  const [screen, setScreen] = useState('library');
  const [activeContent, setActiveContent] = useState(null);

  const authToken = useMemo(() => session?.access_token || '', [session]);

  function signOut() {
    localStorage.removeItem('focusflow_session');
    setSession(null);
    setActiveContent(null);
    setScreen('library');
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
        onSignOut={signOut}
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
        onSignOut={signOut}
      />
      {renderScreen()}
    </>
  );
}
