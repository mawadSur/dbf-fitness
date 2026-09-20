import { resolveMimeType } from './pickRecordingFile';

describe('resolveMimeType', () => {
  it('keeps a real reported type', () => {
    expect(resolveMimeType('video/mp4', 'x.mov')).toBe('video/mp4');
  });

  it('falls back to the extension when the provider reports nothing useful', () => {
    expect(resolveMimeType(undefined, 'Class.MOV')).toBe('video/quicktime');
    expect(resolveMimeType('', 'a.m4a')).toBe('audio/mp4');
    expect(resolveMimeType('application/octet-stream', 'a.mp4')).toBe('video/mp4');
  });

  it('returns what it was given when it cannot tell', () => {
    expect(resolveMimeType('', 'notes.txt')).toBe('');
    expect(resolveMimeType(null, 'noextension')).toBe('');
  });
});
