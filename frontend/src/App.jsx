import React from 'react';
import { useState } from 'react';
import { AuthPage } from './pages/AuthPage';
import { LibraryPage } from './pages/LibraryPage';
import { ReaderPage } from './pages/ReaderPage';

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

  if (screen === 'reader' && activeContent) {
    return (
      <ReaderPage
        content={activeContent}
        token={session.access_token}
        onBack={() => { setScreen('library'); setActiveContent(null); }}
        onUnauthorized={signOut}
      />
    );
  }

  return (
    <LibraryPage
      token={session.access_token}
      user={session}
      onOpen={(content) => { setActiveContent(content); setScreen('reader'); }}
      onSignOut={signOut}
      onUnauthorized={signOut}
    />
  );
}
