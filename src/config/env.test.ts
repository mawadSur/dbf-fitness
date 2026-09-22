import {
  checkSupabaseConfig,
  isLocalUrl,
  isPlaceholder,
  pushMode,
  shouldWarnPushDisabled,
  videoAvailability,
} from './env';

describe('isPlaceholder', () => {
  it.each(['REPLACE_WITH_PROD_ANON_KEY', 'https://REPLACE_PROD_REF.supabase.co', 'TODO_OWNER: fill in'])(
    'flags %s',
    (value) => {
      expect(isPlaceholder(value)).toBe(true);
    }
  );

  it.each([undefined, '', '   ', 'https://abcdefg.supabase.co', 'sb_publishable_realkey'])(
    'does not flag %s',
    (value) => {
      expect(isPlaceholder(value)).toBe(false);
    }
  );
});

describe('isLocalUrl', () => {
  it.each(['http://127.0.0.1:54321', 'http://localhost:54321', 'http://10.0.2.2:54321', 'http://0.0.0.0:54321'])(
    'flags %s',
    (value) => {
      expect(isLocalUrl(value)).toBe(true);
    }
  );

  it('does not flag a hosted project URL', () => {
    expect(isLocalUrl('https://abcdefg.supabase.co')).toBe(false);
  });
});

describe('checkSupabaseConfig', () => {
  const good = { url: 'https://abcdefg.supabase.co', anonKey: 'sb_publishable_realkey' };

  it('passes a real hosted configuration in a release build', () => {
    expect(checkSupabaseConfig({ ...good, isDev: false })).toEqual({ blocked: false, problems: [] });
  });

  it('blocks a release build with no URL', () => {
    const verdict = checkSupabaseConfig({ url: undefined, anonKey: good.anonKey, isDev: false });
    expect(verdict.blocked).toBe(true);
    expect(verdict.problems).toEqual(['missing_url']);
  });

  it('blocks a release build pointed at localhost', () => {
    const verdict = checkSupabaseConfig({ url: 'http://127.0.0.1:54321', anonKey: good.anonKey, isDev: false });
    expect(verdict.blocked).toBe(true);
    expect(verdict.problems).toEqual(['local_url']);
  });

  it('blocks a release build still carrying eas.json placeholders', () => {
    const verdict = checkSupabaseConfig({
      url: 'https://REPLACE_PROD_REF.supabase.co',
      anonKey: 'REPLACE_WITH_PROD_ANON_KEY',
      isDev: false,
    });
    expect(verdict.blocked).toBe(true);
    expect(verdict.problems).toEqual(['placeholder_url', 'placeholder_key']);
  });

  it('blocks a release build missing only the key', () => {
    const verdict = checkSupabaseConfig({ url: good.url, anonKey: '  ', isDev: false });
    expect(verdict.blocked).toBe(true);
    expect(verdict.problems).toEqual(['missing_key']);
  });

  it('never blocks in dev, even against the local stack', () => {
    const verdict = checkSupabaseConfig({ url: 'http://127.0.0.1:54321', anonKey: '', isDev: true });
    expect(verdict.blocked).toBe(false);
    expect(verdict.problems).toEqual(['local_url', 'missing_key']);
  });
});

describe('videoAvailability', () => {
  it('is live with a real app id on a phone', () => {
    expect(videoAvailability({ appId: 'agora123', isDev: false, os: 'ios' })).toBe('live');
    expect(videoAvailability({ appId: 'agora123', isDev: false, os: 'android' })).toBe('live');
  });

  it('is mock on web even with an app id (Agora native is unavailable there)', () => {
    expect(videoAvailability({ appId: 'agora123', isDev: false, os: 'web' })).toBe('mock');
  });

  it('is mock in dev without an app id', () => {
    expect(videoAvailability({ appId: undefined, isDev: true, os: 'ios' })).toBe('mock');
  });

  it('is unavailable in a release native build with no app id', () => {
    expect(videoAvailability({ appId: undefined, isDev: false, os: 'ios' })).toBe('unavailable');
    expect(videoAvailability({ appId: '', isDev: false, os: 'android' })).toBe('unavailable');
  });

  it('treats a placeholder app id as missing in a release build', () => {
    expect(videoAvailability({ appId: 'REPLACE_WITH_AGORA_APP_ID', isDev: false, os: 'ios' })).toBe('unavailable');
  });
});

describe('pushMode / shouldWarnPushDisabled', () => {
  it('is real when the flag is on for a native build', () => {
    expect(pushMode({ realPushFlag: 'true', isDev: false, os: 'android' })).toBe('real');
    expect(shouldWarnPushDisabled({ realPushFlag: 'true', isDev: false, os: 'android' })).toBe(false);
  });

  it('warns in a release native build with push off', () => {
    expect(pushMode({ realPushFlag: 'false', isDev: false, os: 'ios' })).toBe('disabled');
    expect(shouldWarnPushDisabled({ realPushFlag: 'false', isDev: false, os: 'ios' })).toBe(true);
    expect(shouldWarnPushDisabled({ realPushFlag: undefined, isDev: false, os: 'ios' })).toBe(true);
  });

  it('stays silent in dev and on web', () => {
    expect(shouldWarnPushDisabled({ realPushFlag: 'false', isDev: true, os: 'ios' })).toBe(false);
    expect(shouldWarnPushDisabled({ realPushFlag: 'false', isDev: false, os: 'web' })).toBe(false);
  });
});
