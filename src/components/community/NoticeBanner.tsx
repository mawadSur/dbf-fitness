import { Banner } from '../ui';

export type Notice = {
  tone: 'success' | 'error';
  text: string;
};

type NoticeBannerProps = {
  notice: Notice;
  onDismiss: () => void;
};

/**
 * One-line result of a join/leave/block action. It is the design system `Banner`
 * with the community's own dismiss label, so the tone always carries an icon as
 * well as a tint and the message is announced as an alert.
 */
export function NoticeBanner({ notice, onDismiss }: NoticeBannerProps) {
  return (
    <Banner
      testID="community-notice"
      tone={notice.tone === 'error' ? 'danger' : 'success'}
      title={notice.text}
      onDismiss={onDismiss}
      dismissAccessibilityLabel="Dismiss message"
    />
  );
}
