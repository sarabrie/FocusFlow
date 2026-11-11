// Hash-based routing, so the browser's back/forward buttons move between the screens the user visited.
// The hash (#/...) never reaches the server, so nginx and the load balancer need no extra rules,
// and a refresh reopens the same screen.
import { useEffect, useState } from 'react';

//   #/library               → library (also the default)
//   #/history               → history list
//   #/history/<sessionId>   → one session's details
//   #/content/<contentId>   → reader / video for one content item
export function parseRoute(hash) {
  const parts = (hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [screen, id] = parts;
  if (screen === 'history') return id ? { screen: 'history', sessionId: id } : { screen: 'history' };
  if (screen === 'content' && id) return { screen: 'reader', contentId: id };
  return { screen: 'library' };
}

export function routeToHash(route) {
  if (route.screen === 'history') {
    return route.sessionId ? `#/history/${encodeURIComponent(route.sessionId)}` : '#/history';
  }
  if (route.screen === 'reader' && route.contentId) return `#/content/${encodeURIComponent(route.contentId)}`;
  return '#/library';
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));

  useEffect(() => {
    // Fires for links, navigate() and the browser's back/forward buttons alike.
    const onHashChange = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Adds a history entry, so "back" returns to the current screen.
  function navigate(next) {
    const hash = routeToHash(next);
    if (hash !== window.location.hash) window.location.hash = hash;
  }

  // Swaps the current entry without adding one (e.g. a link to content that no longer exists).
  function replace(next) {
    const hash = routeToHash(next);
    window.history.replaceState(null, '', hash);
    setRoute(parseRoute(hash));
  }

  return { route, navigate, replace };
}
