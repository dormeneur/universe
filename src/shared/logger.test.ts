import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from './logger';

function captureStdout() {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((line: string) => {
    lines.push(line);
  });
  return { lines, spy };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createLogger', () => {
  it('writes structured JSON', () => {
    const { lines } = captureStdout();
    createLogger('info').info('sync finished', { projects: 12 });

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed['level']).toBe('info');
    expect(parsed['message']).toBe('sync finished');
    expect(parsed['projects']).toBe(12);
    expect(typeof parsed['time']).toBe('string');
  });

  it('suppresses lines below the minimum level', () => {
    const { lines } = captureStdout();
    createLogger('warn').info('should not appear');
    expect(lines).toHaveLength(0);
  });

  it('carries child fields onto every line', () => {
    const { lines } = captureStdout();
    createLogger('info').child({ correlationId: 'run-1' }).info('step done');

    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed['correlationId']).toBe('run-1');
  });

  it('lets a call-site field override a child field', () => {
    const { lines } = captureStdout();
    createLogger('info').child({ stage: 'import' }).info('done', { stage: 'sync' });

    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed['stage']).toBe('sync');
  });

  it('sends warnings and errors to stderr so platforms classify them correctly', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    createLogger('debug').error('boom');
    expect(errSpy).toHaveBeenCalledTimes(1);
  });
});
