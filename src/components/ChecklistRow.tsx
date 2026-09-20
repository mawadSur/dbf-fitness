import { ChecklistRow as UiChecklistRow } from './ui/ChecklistRow';

type ChecklistRowProps = {
  label: string;
  sublabel?: string;
  checked: boolean;
  onToggle: () => void;
  onPress?: () => void;
};

/**
 * @deprecated Import `ChecklistRow` from `src/components/ui` instead.
 *
 * Kept so the screens that already use it (`app/(tabs)/food.tsx`,
 * `app/(tabs)/workout/[dayId].tsx`) keep the exact same props while they wait
 * to be restyled. It now renders the design-system row, so those screens get
 * the themed, dark-mode-aware version for free.
 */
export function ChecklistRow(props: ChecklistRowProps) {
  return <UiChecklistRow {...props} />;
}
