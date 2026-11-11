import { describe, expect, it } from 'vitest';
import { parseRoute, routeToHash } from './router';

describe('parseRoute', () => {
  it('defaults to the library', () => {
    expect(parseRoute('')).toEqual({ screen: 'library' });
    expect(parseRoute('#/')).toEqual({ screen: 'library' });
    expect(parseRoute('#/library')).toEqual({ screen: 'library' });
    expect(parseRoute('#/something-unknown')).toEqual({ screen: 'library' });
  });

  it('reads the history list and a single session', () => {
    expect(parseRoute('#/history')).toEqual({ screen: 'history' });
    expect(parseRoute('#/history/abc123')).toEqual({ screen: 'history', sessionId: 'abc123' });
  });

  it('reads a content item, and ignores /content without an id', () => {
    expect(parseRoute('#/content/66f0a1')).toEqual({ screen: 'reader', contentId: '66f0a1' });
    expect(parseRoute('#/content')).toEqual({ screen: 'library' });
  });
});

describe('routeToHash', () => {
  it('round-trips every route', () => {
    const routes = [
      { screen: 'library' },
      { screen: 'history' },
      { screen: 'history', sessionId: 'abc123' },
      { screen: 'reader', contentId: '66f0a1' },
    ];
    routes.forEach((route) => expect(parseRoute(routeToHash(route))).toEqual(route));
  });

  it('encodes ids safely', () => {
    expect(routeToHash({ screen: 'reader', contentId: 'a/b' })).toBe('#/content/a%2Fb');
    expect(parseRoute('#/content/a%2Fb')).toEqual({ screen: 'reader', contentId: 'a/b' });
  });
});
