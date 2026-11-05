import { describe, expect, it } from 'vitest';
import { passwordProblem } from './AccountDialog';

describe('passwordProblem (mirrors backend/schemas/auth.py)', () => {
  it('accepts 8+ characters with a letter and a digit', () => {
    expect(passwordProblem('probe-pass-123')).toBe('');
    expect(passwordProblem('סיסמה12')).not.toBe('');
    expect(passwordProblem('סיסמה123')).toBe('');
  });

  it('rejects short, letter-only, digit-only and over-72-byte passwords', () => {
    expect(passwordProblem('ab12')).toMatch('8');
    expect(passwordProblem('abcdefgh')).toMatch('ספרה');
    expect(passwordProblem('12345678')).toMatch('אות');
    expect(passwordProblem(`a1${'x'.repeat(80)}`)).toMatch('ארוכה');
  });
});
