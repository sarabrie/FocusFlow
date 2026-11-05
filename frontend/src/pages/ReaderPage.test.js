import { describe, expect, it } from 'vitest';
import { toEmbedUrl } from './ReaderPage';

describe('toEmbedUrl', () => {
  it('handles youtu.be links', () => {
    expect(toEmbedUrl('https://youtu.be/byLFiFawEuY?si=abc')).toBe('https://www.youtube.com/embed/byLFiFawEuY');
  });

  it('handles watch links with params', () => {
    expect(toEmbedUrl('https://www.youtube.com/watch?v=abc123XYZ99&feature=share')).toBe('https://www.youtube.com/embed/abc123XYZ99');
  });

  it('handles mobile youtube links', () => {
    expect(toEmbedUrl('https://m.youtube.com/watch?v=abc123XYZ99')).toBe('https://www.youtube.com/embed/abc123XYZ99');
  });

  it('handles shorts links', () => {
    expect(toEmbedUrl('https://www.youtube.com/shorts/abc123XYZ99')).toBe('https://www.youtube.com/embed/abc123XYZ99');
  });

  it('handles embed links', () => {
    expect(toEmbedUrl('https://www.youtube.com/embed/abc123XYZ99')).toBe('https://www.youtube.com/embed/abc123XYZ99');
  });

  it('handles live links', () => {
    expect(toEmbedUrl('https://www.youtube.com/live/abc123XYZ99')).toBe('https://www.youtube.com/embed/abc123XYZ99');
  });

  it('returns null for non-youtube URLs', () => {
    expect(toEmbedUrl('https://example.com/video?id=abc123XYZ99')).toBeNull();
  });

  it('returns null for malformed youtube URLs', () => {
    expect(toEmbedUrl('https://www.youtube.com/watch')).toBeNull();
  });
});
