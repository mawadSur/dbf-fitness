import { fireEvent, screen } from '@testing-library/react-native';

import { EmptyState } from './EmptyState';
import { INCLUDING_HIDDEN, renderInTheme } from './testing';

describe('EmptyState', () => {
  it('announces the title as a heading', async () => {
    await renderInTheme(<EmptyState title="No notes yet" />);
    expect(screen.getByRole('header', { name: 'No notes yet' })).toBeTruthy();
  });

  it('shows the explanatory message', async () => {
    await renderInTheme(<EmptyState title="No notes yet" message="Upload a recording first." />);
    expect(screen.getByText('Upload a recording first.')).toBeTruthy();
  });

  it('falls back to the info icon', async () => {
    await renderInTheme(<EmptyState title="Nothing here" />);
    expect(screen.getByTestId('icon-info', INCLUDING_HIDDEN)).toBeTruthy();
  });

  it('uses the icon it is given', async () => {
    await renderInTheme(<EmptyState title="No notes yet" icon="file-text" />);
    expect(screen.getByTestId('icon-file-text', INCLUDING_HIDDEN)).toBeTruthy();
  });

  it('offers exactly one primary action', async () => {
    const onAction = jest.fn();
    await renderInTheme(
      <EmptyState title="No notes yet" actionLabel="Upload a recording" onAction={onAction} />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Upload a recording' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders no action when only a label or only a handler is given', async () => {
    await renderInTheme(<EmptyState title="No notes yet" actionLabel="Upload" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders in dark mode without a provider-level crash', async () => {
    await renderInTheme(<EmptyState title="No notes yet" message="Nothing to do." />, 'dark');
    expect(screen.getByText('Nothing to do.')).toBeTruthy();
  });
});
