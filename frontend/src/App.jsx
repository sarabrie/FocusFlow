import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { AuthPage } from './pages/AuthPage';
import { HistoryPage } from './pages/HistoryPage';
import { LibraryPage } from './pages/LibraryPage';
import { ReaderPage } from './pages/ReaderPage';
import { AccountDialog } from './components/AccountDialog';
import { api } from './api';
import { useRoute } from './router';

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
      <button type="button" className="nav-logout" onClick={onSignOut}>התנתקות</button>
    </nav>
  );
}

export default function App() {
  const [session, setSession] = useState(readSavedSession);
  // The current screen lives in the URL (#/...), so back/forward and refresh work.
  const { route, navigate, replace } = useRoute();
  const { screen } = route;
  // Content opened from the library is kept here; after a refresh or back/forward it is fetched by id.
  const [activeContent, setActiveContent] = useState(null);
  const [contentError, setContentError] = useState('');
  const [showAccount, setShowAccount] = useState(false);

  const authToken = useMemo(() => session?.access_token || '', [session]);

  function openContent(content) {
    setActiveContent(content);
    navigate({ screen: 'reader', contentId: content.id });
  }

  useEffect(() => {
    if (!authToken || screen !== 'reader' || activeContent?.id === route.contentId) return;
    let cancelled = false;
    setContentError('');
    api.getContent(authToken, route.contentId)
      .then((content) => { if (!cancelled) setActiveContent(content); })
      .catch((requestError) => {
        if (cancelled) return;
        if (requestError.status === 401) signOut();
        // Deleted or someone else's content: drop this entry instead of leaving a dead page in history.
        else if (requestError.status === 404) replace({ screen: 'library' });
        else setContentError(requestError.message);
      });
    return () => { cancelled = true; };
  }, [authToken, screen, route.contentId]);

  // Local sign-out only: used when the server already rejected the token (401) or the account is gone.
  function signOut() {
    localStorage.removeItem('focusflow_session');
    setSession(null);
    setActiveContent(null);
    setShowAccount(false);
    replace({ screen: 'library' });
  }

  // "התנתקות": also revokes the token on the server, so a copied token stops working too.
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
    if (screen === 'reader') {
      if (activeContent?.id !== route.contentId) {
        return (
          <main className="history-shell">
            {contentError
              ? <div className="form-message error-message" role="alert">{contentError}</div>
              : <div className="loading-state"><LoaderCircle className="spin" size={22} /> טוענים את התוכן...</div>}
          </main>
        );
      }
      return (
        <ReaderPage
          key={activeContent.id}
          content={activeContent}
          token={authToken}
          onBack={() => navigate({ screen: 'library' })}
          onUnauthorized={signOut}
          onViewHistory={() => navigate({ screen: 'history' })}
        />
      );
    }

    if (screen === 'history') {
      return (
        <HistoryPage
          token={authToken}
          sessionId={route.sessionId || null}
          onOpenSession={(sessionId) => navigate({ screen: 'history', sessionId })}
          onCloseSession={() => navigate({ screen: 'history' })}
          onBack={() => navigate({ screen: 'library' })}
          onUnauthorized={signOut}
        />
      );
    }

    return (
      <LibraryPage
        token={authToken}
        user={session}
        onOpen={openContent}
        onSignOut={logout}
        onUnauthorized={signOut}
      />
    );
  };

  return (
    <>
      <AppNav
        currentScreen={screen}
        onLibrary={() => navigate({ screen: 'library' })}
        onHistory={() => navigate({ screen: 'history' })}
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
