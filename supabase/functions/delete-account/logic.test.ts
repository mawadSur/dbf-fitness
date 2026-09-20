import {
  CONFIRM_WORD,
  MAX_BODY_BYTES,
  MAX_STORAGE_DEPTH,
  STORAGE_PAGE_SIZE,
  buildSuccessBody,
  collectUserObjectPaths,
  isBodyTooLarge,
  parseDeleteRequest,
  passwordProofMatches,
  rejectRequest,
  roleRejection,
  safeErrorMessage,
  storagePrefix,
  type StorageEntry,
} from './logic';

const UID = '11111111-1111-4111-8111-111111111111';

describe('rejectRequest', () => {
  it('allows a POST with a bearer token', () => {
    expect(rejectRequest('POST', 'Bearer abc.def.ghi')).toBeNull();
    expect(rejectRequest('POST', 'bearer abc')).toBeNull();
  });

  it.each(['GET', 'DELETE', 'PUT', 'PATCH', 'OPTIONS', 'HEAD'])('405s %s', (method) => {
    expect(rejectRequest(method, 'Bearer abc')).toEqual({ status: 405, error: 'method_not_allowed' });
  });

  it('405 takes precedence over a missing token, so a GET never reveals auth state', () => {
    expect(rejectRequest('GET', null)).toEqual({ status: 405, error: 'method_not_allowed' });
  });

  it.each([null, '', 'abc', 'Basic abc', 'Bearer', 'Bearer '])('401s %p', (header) => {
    expect(rejectRequest('POST', header)).toEqual({ status: 401, error: 'unauthorized' });
  });
});

describe('isBodyTooLarge', () => {
  it('passes a normal body', () => {
    expect(isBodyTooLarge('64', 64)).toBe(false);
    expect(isBodyTooLarge(String(MAX_BODY_BYTES), MAX_BODY_BYTES)).toBe(false);
  });

  it('refuses an oversized declared length', () => {
    expect(isBodyTooLarge(String(MAX_BODY_BYTES + 1))).toBe(true);
  });

  it('refuses an oversized observed length when Content-Length is absent (chunked)', () => {
    expect(isBodyTooLarge(null, MAX_BODY_BYTES + 1)).toBe(true);
  });

  it('treats an unparseable or negative Content-Length as unknown, not as zero', () => {
    expect(isBodyTooLarge('banana')).toBe(false);
    expect(isBodyTooLarge('-5')).toBe(false);
    expect(isBodyTooLarge(null)).toBe(false);
  });
});

describe('parseDeleteRequest', () => {
  it('accepts the exact confirm word with a password', () => {
    expect(parseDeleteRequest({ confirm: CONFIRM_WORD, password: 'pw' })).toEqual({ password: 'pw' });
  });

  it('tolerates surrounding whitespace on the confirm word', () => {
    expect(parseDeleteRequest({ confirm: '  DELETE  ', password: 'pw' })).toEqual({ password: 'pw' });
  });

  it.each([
    ['missing', {}],
    ['lowercase', { confirm: 'delete' }],
    ['mixed case', { confirm: 'Delete' }],
    ['a different word', { confirm: 'REMOVE' }],
    ['empty', { confirm: '' }],
    ['a non-string', { confirm: 1 }],
    ['a truthy object', { confirm: {} }],
  ])('400s confirm_required when confirm is %s', (_label, extra) => {
    expect(parseDeleteRequest({ ...extra, password: 'pw' })).toEqual({
      status: 400,
      error: 'confirm_required',
    });
  });

  it.each([null, undefined, 'a string body', 42, []])('400s a body that is %p', (body) => {
    expect(parseDeleteRequest(body)).toEqual({ status: 400, error: 'confirm_required' });
  });

  it('checks confirm BEFORE the password, so a wrong confirm never probes credentials', () => {
    expect(parseDeleteRequest({ confirm: 'nope' })).toEqual({ status: 400, error: 'confirm_required' });
  });

  it.each([
    ['missing', {}],
    ['empty', { password: '' }],
    ['a non-string', { password: 12345 }],
    ['null', { password: null }],
  ])('403s invalid_password when the password is %s', (_label, extra) => {
    expect(parseDeleteRequest({ confirm: CONFIRM_WORD, ...extra })).toEqual({
      status: 403,
      error: 'invalid_password',
    });
  });

  it('keeps a password that is only whitespace (the provider decides, not us)', () => {
    expect(parseDeleteRequest({ confirm: CONFIRM_WORD, password: '   ' })).toEqual({ password: '   ' });
  });

  it('returns NO user identifier, so a forged body cannot retarget the delete', () => {
    const parsed = parseDeleteRequest({
      confirm: CONFIRM_WORD,
      password: 'pw',
      user_id: '22222222-2222-4222-8222-222222222222',
      id: '33333333-3333-4333-8333-333333333333',
      email: 'victim@example.com',
      sub: 'victim',
    });
    expect(parsed).toEqual({ password: 'pw' });
    expect(Object.keys(parsed)).toEqual(['password']);
  });
});

describe('roleRejection', () => {
  it('refuses an admin', () => {
    expect(roleRejection('admin')).toEqual({ status: 403, error: 'admin_managed_by_operator' });
  });

  it.each(['member', 'coach', '', null, undefined, 'Admin'])('allows %p', (role) => {
    expect(roleRejection(role)).toBeNull();
  });
});

describe('passwordProofMatches', () => {
  it('accepts a sign-in that returned the same user', () => {
    expect(passwordProofMatches(UID, UID)).toBe(true);
  });

  it.each([null, undefined, '', '22222222-2222-4222-8222-222222222222'])(
    'rejects a sign-in that returned %p',
    (other) => {
      expect(passwordProofMatches(UID, other)).toBe(false);
    }
  );
});

describe('storagePrefix', () => {
  it('is the uid folder used by the recordings uploader', () => {
    expect(storagePrefix(UID)).toBe(`${UID}/`);
  });
});

/** A fake Storage tree keyed by prefix, paging exactly like Storage list(prefix,{limit,offset}). */
function fakeLister(tree: Record<string, StorageEntry[]>, calls: string[] = []) {
  return async (prefix: string, offset: number, limit: number) => {
    calls.push(`${prefix}@${offset}`);
    return (tree[prefix] ?? []).slice(offset, offset + limit);
  };
}

describe('collectUserObjectPaths', () => {
  it('walks folders and returns only real object paths', async () => {
    const tree: Record<string, StorageEntry[]> = {
      [`${UID}/`]: [{ name: 'rec-a', id: null }, { name: 'rec-b', id: null }],
      [`${UID}/rec-a/`]: [{ name: 'clip.mp4', id: 'o1' }, { name: 'clip.srt', id: 'o2' }],
      [`${UID}/rec-b/`]: [{ name: 'clip.mp4', id: 'o3' }],
    };
    await expect(collectUserObjectPaths(fakeLister(tree), UID)).resolves.toEqual([
      `${UID}/rec-a/clip.mp4`,
      `${UID}/rec-a/clip.srt`,
      `${UID}/rec-b/clip.mp4`,
    ]);
  });

  it('returns an empty list for a user with nothing stored', async () => {
    await expect(collectUserObjectPaths(fakeLister({}), UID)).resolves.toEqual([]);
  });

  it('finds an object sitting directly under the uid prefix', async () => {
    const tree = { [`${UID}/`]: [{ name: 'loose.mp4', id: 'o1' }] };
    await expect(collectUserObjectPaths(fakeLister(tree), UID)).resolves.toEqual([`${UID}/loose.mp4`]);
  });

  it('pages until a short page comes back', async () => {
    const page = (n: number, from: number): StorageEntry[] =>
      Array.from({ length: n }, (_, i) => ({ name: `f${from + i}.mp4`, id: `o${from + i}` }));
    const tree = { [`${UID}/`]: [...page(STORAGE_PAGE_SIZE, 0), ...page(3, STORAGE_PAGE_SIZE)] };
    const calls: string[] = [];
    const paths = await collectUserObjectPaths(fakeLister(tree, calls), UID);
    expect(paths).toHaveLength(STORAGE_PAGE_SIZE + 3);
    expect(calls).toEqual([`${UID}/@0`, `${UID}/@${STORAGE_PAGE_SIZE}`]);
  });

  it('stops at MAX_STORAGE_DEPTH instead of following a cyclic listing forever', async () => {
    // Every level reports one more folder; without the cap this never terminates.
    const lister = async (prefix: string, offset: number): Promise<StorageEntry[]> =>
      offset > 0 ? [] : [{ name: 'deeper', id: null }, { name: 'file.mp4', id: 'o' }];
    const paths = await collectUserObjectPaths(lister, UID);
    // One file per level, depth-first, and the walk stops at MAX_STORAGE_DEPTH levels.
    expect(paths).toHaveLength(MAX_STORAGE_DEPTH);
    expect(paths[paths.length - 1]).toBe(`${UID}/file.mp4`);
    expect(paths[0]).toBe(`${UID}/${'deeper/'.repeat(MAX_STORAGE_DEPTH - 1)}file.mp4`);
  });

  it('skips entries that would escape the prefix or produce a trailing slash', async () => {
    const tree = {
      [`${UID}/`]: [
        { name: '', id: 'o0' },
        { name: '.', id: null },
        { name: '..', id: null },
        { name: 'a/b.mp4', id: 'o1' },
        { name: 'ok.mp4', id: 'o2' },
      ],
    };
    await expect(collectUserObjectPaths(fakeLister(tree), UID)).resolves.toEqual([`${UID}/ok.mp4`]);
  });

  it('never returns the same path twice', async () => {
    const tree = { [`${UID}/`]: [{ name: 'dup.mp4', id: 'o1' }, { name: 'dup.mp4', id: 'o1' }] };
    await expect(collectUserObjectPaths(fakeLister(tree), UID)).resolves.toEqual([`${UID}/dup.mp4`]);
  });

  it('propagates a listing failure so the caller refuses to delete the account', async () => {
    const lister = async () => {
      throw new Error('storage down');
    };
    await expect(collectUserObjectPaths(lister, UID)).rejects.toThrow('storage down');
  });
});

describe('safeErrorMessage', () => {
  it('masks an email address', () => {
    expect(safeErrorMessage(new Error('user someone@example.com not found'))).toBe(
      'user [email] not found'
    );
  });

  it('masks a uuid', () => {
    expect(safeErrorMessage(new Error(`no object for ${UID}/rec.mp4`))).toBe('no object for [uid]/rec.mp4');
  });

  it('reads a bare string and a PostgrestError-shaped object', () => {
    expect(safeErrorMessage('plain')).toBe('plain');
    expect(safeErrorMessage({ message: 'from postgrest' })).toBe('from postgrest');
  });

  it('falls back for a value with no message', () => {
    expect(safeErrorMessage(null)).toBe('unknown error');
    expect(safeErrorMessage(42)).toBe('unknown error');
  });

  it('truncates so a huge provider message cannot flood the log', () => {
    expect(safeErrorMessage(new Error('x'.repeat(5000)))).toHaveLength(200);
  });
});

describe('buildSuccessBody', () => {
  it('leaks nothing about the deleted account', () => {
    expect(buildSuccessBody()).toEqual({ ok: true });
    expect(buildSuccessBody(false)).toEqual({ ok: true });
  });

  // Storage removal now runs AFTER the account delete (index.ts step 4), so a failure there
  // cannot be an error status: the account is already gone and the client must not be told the
  // deletion failed. It is flagged instead, and `ok` stays true so the client still signs out.
  it('flags an account that was deleted but whose files still need sweeping', () => {
    expect(buildSuccessBody(true)).toEqual({ ok: true, storage_cleanup_pending: true });
    expect(buildSuccessBody(true).ok).toBe(true);
  });
});
