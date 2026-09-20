import { fireEvent, screen } from '@testing-library/react-native';

import { Badge } from './Badge';
import { ListRow, LIST_ROW_MIN_HEIGHT } from './ListRow';
import {
  colorsFor,
  flattenStyle,
  INCLUDING_HIDDEN,
  mockReducedMotion,
  pressableStyle,
  pressIn,
  renderInTheme,
} from './testing';

describe('ListRow', () => {
  it('is a plain row with no button role when it does not navigate', async () => {
    await renderInTheme(<ListRow title="Static row" testID="row" />);
    expect(screen.getByTestId('row').props.accessibilityRole).toBeUndefined();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('becomes a button named after its title', async () => {
    const onPress = jest.fn();
    await renderInTheme(<ListRow title="Calendar" onPress={onPress} testID="row" />);
    const row = screen.getByTestId('row');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('Calendar');
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('prefers an explicit accessible name and hint', async () => {
    await renderInTheme(
      <ListRow
        title="Calendar"
        onPress={() => undefined}
        accessibilityLabel="Open the calendar"
        accessibilityHint="Shows your booked classes"
        testID="row"
      />,
    );
    const row = screen.getByTestId('row');
    expect(row.props.accessibilityLabel).toBe('Open the calendar');
    expect(row.props.accessibilityHint).toBe('Shows your booked classes');
  });

  it('is at least 56pt tall', async () => {
    await renderInTheme(<ListRow title="Calendar" testID="row" />);
    expect(flattenStyle(screen.getByTestId('row').props.style).minHeight).toBe(LIST_ROW_MIN_HEIGHT);
    expect(LIST_ROW_MIN_HEIGHT).toBeGreaterThanOrEqual(56);
  });

  it('shows a chevron on a navigating row', async () => {
    await renderInTheme(<ListRow title="Calendar" onPress={() => undefined} />);
    expect(screen.getByTestId('icon-chevron-right', INCLUDING_HIDDEN)).toBeTruthy();
  });

  it('hides the chevron when asked, and on a static row', async () => {
    await renderInTheme(<ListRow title="Calendar" onPress={() => undefined} showChevron={false} />);
    expect(screen.queryByTestId('icon-chevron-right', INCLUDING_HIDDEN)).toBeNull();
  });

  it('never shows a chevron without a press handler', async () => {
    await renderInTheme(<ListRow title="Calendar" />);
    expect(screen.queryByTestId('icon-chevron-right', INCLUDING_HIDDEN)).toBeNull();
  });

  it('renders the leading icon and the subtitle', async () => {
    await renderInTheme(<ListRow title="Calendar" subtitle="Next: Monday" icon="calendar" />);
    expect(screen.getByTestId('icon-calendar', INCLUDING_HIDDEN)).toBeTruthy();
    expect(screen.getByText('Next: Monday')).toBeTruthy();
  });

  it('lets a richer leading node replace the icon', async () => {
    await renderInTheme(
      <ListRow title="Dana" icon="calendar" leading={<Badge label="Coach" testID="lead" />} />,
    );
    expect(screen.getByTestId('lead')).toBeTruthy();
    expect(screen.queryByTestId('icon-calendar', INCLUDING_HIDDEN)).toBeNull();
  });

  it('renders trailing content', async () => {
    await renderInTheme(<ListRow title="Plan" trailing={<Badge label="Active" testID="trail" />} />);
    expect(screen.getByTestId('trail')).toBeTruthy();
  });

  it('does not fire, and dims, when disabled', async () => {
    const onPress = jest.fn();
    await renderInTheme(<ListRow title="Locked" onPress={onPress} disabled testID="row" />);
    const row = screen.getByTestId('row');
    await fireEvent.press(row);
    expect(onPress).not.toHaveBeenCalled();
    expect(row.props.accessibilityState).toMatchObject({ disabled: true });
    expect(pressableStyle(row).opacity).toBe(0.45);
  });

  it('shrinks on press and holds still under reduced motion', async () => {
    await renderInTheme(<ListRow title="Calendar" onPress={() => undefined} testID="row" />);
    await pressIn(screen.getByTestId('row'));
    expect(pressableStyle(screen.getByTestId('row')).transform).toEqual([{ scale: 0.98 }]);
  });

  it('does not scale when the member asked for reduced motion', async () => {
    mockReducedMotion(true);
    await renderInTheme(<ListRow title="Calendar" onPress={() => undefined} testID="row" />);
    await pressIn(screen.getByTestId('row'));
    expect(pressableStyle(screen.getByTestId('row')).transform).toEqual([{ scale: 1 }]);
  });

  it('sits on the dark surface in dark mode', async () => {
    await renderInTheme(<ListRow title="Calendar" testID="row" />, 'dark');
    expect(flattenStyle(screen.getByTestId('row').props.style).backgroundColor).toBe(
      colorsFor('dark').surface,
    );
  });

  it('wraps a long title instead of clipping it', async () => {
    await renderInTheme(<ListRow title="A very long destination title that wraps" />);
    expect(screen.getByText('A very long destination title that wraps').props.numberOfLines).toBe(2);
  });
});
