import { Pressable, Text, View } from 'react-native';

export type Notice = {
  tone: 'success' | 'error';
  text: string;
};

type NoticeBannerProps = {
  notice: Notice;
  onDismiss: () => void;
};

export function NoticeBanner({ notice, onDismiss }: NoticeBannerProps) {
  const isError = notice.tone === 'error';

  return (
    <View
      accessibilityRole="alert"
      className={`flex-row items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
        isError ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'
      }`}
    >
      <Text className={`flex-1 text-sm font-medium ${isError ? 'text-red-700' : 'text-emerald-700'}`}>
        {notice.text}
      </Text>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss message"
        android_ripple={{ color: 'rgba(15,23,42,0.12)' }}
        className="min-h-[44px] min-w-[44px] items-center justify-center px-2 active:opacity-80"
      >
        <Text className={`text-sm font-semibold ${isError ? 'text-red-700' : 'text-emerald-700'}`}>Dismiss</Text>
      </Pressable>
    </View>
  );
}
