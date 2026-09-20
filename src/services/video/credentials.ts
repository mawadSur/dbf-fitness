import { supabase } from '../supabase/client';

export type RtcErrorCode =
  | 'subscription_required'
  | 'not_entitled'
  | 'class_not_found'
  | 'class_not_joinable'
  | 'unauthorized'
  | 'unknown';

export type RtcSubscriptionInfo = {
  state: 'active' | 'grace' | 'staff';
  days_overdue: number;
  grace_days_left: number;
};

export type RtcCredentials = {
  mode: 'live' | 'mock';
  app_id: string | null;
  channel: string;
  uid: number;
  token: string | null;
  expires_at: string | null;
  subscription: RtcSubscriptionInfo;
};

export class RtcCredentialsError extends Error {
  readonly code: RtcErrorCode;
  readonly subscription?: RtcSubscriptionInfo;

  constructor(code: RtcErrorCode, message?: string, subscription?: RtcSubscriptionInfo) {
    super(message ?? code);
    this.name = 'RtcCredentialsError';
    this.code = code;
    this.subscription = subscription;
  }
}

const KNOWN_CODES: readonly RtcErrorCode[] = [
  'subscription_required',
  'not_entitled',
  'class_not_found',
  'class_not_joinable',
  'unauthorized',
];

function codeFromStatus(status: number | undefined, bodyError: unknown): RtcErrorCode {
  if (typeof bodyError === 'string' && (KNOWN_CODES as readonly string[]).includes(bodyError)) {
    return bodyError as RtcErrorCode;
  }
  switch (status) {
    case 401:
      return 'unauthorized';
    case 403:
      return 'not_entitled';
    case 404:
      return 'class_not_found';
    case 409:
      return 'class_not_joinable';
    default:
      return 'unknown';
  }
}

/** supabase-js wraps non-2xx in FunctionsHttpError whose `context` is the fetch Response. */
async function toTypedError(error: unknown): Promise<RtcCredentialsError> {
  const context = (error as { context?: unknown } | null)?.context as
    | { status?: number; json?: () => Promise<unknown> }
    | undefined;
  type ErrorBody = { error?: unknown; subscription?: RtcSubscriptionInfo };
  const readBody = async (): Promise<ErrorBody | null> => {
    try {
      return context?.json ? ((await context.json()) as ErrorBody) : null;
    } catch {
      return null;
    }
  };
  const body = await readBody();
  const code = codeFromStatus(context?.status, body?.error);
  return new RtcCredentialsError(code, (error as Error | null)?.message, body?.subscription);
}

/** Fetches Agora join credentials for a class. The Edge Function is the real access enforcement. */
export async function fetchRtcCredentials(classId: string): Promise<RtcCredentials> {
  const { data, error } = await supabase.functions.invoke('agora-rtc-token', {
    body: { class_id: classId },
  });
  if (error) throw await toTypedError(error);
  if (!data || typeof data !== 'object' || typeof (data as RtcCredentials).channel !== 'string') {
    throw new RtcCredentialsError('unknown', 'Malformed agora-rtc-token response');
  }
  return data as RtcCredentials;
}
