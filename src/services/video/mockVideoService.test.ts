import { createMockVideoService } from './mockVideoService';
import type { VideoParticipant } from './types';

describe('mock video service', () => {
  it('joins with a single labelled local placeholder tile and never touches camera APIs', async () => {
    const getUserMedia = jest.fn();
    Object.defineProperty(globalThis, 'navigator', {
      value: { mediaDevices: { getUserMedia } },
      configurable: true,
    });

    const service = createMockVideoService();
    const seen: VideoParticipant[][] = [];
    service.onParticipantsChanged((participants) => seen.push(participants));

    const session = await service.join('dbf-demo-saturday-conditioning', 'Jordan Lee');

    expect(session.channelName).toBe('dbf-demo-saturday-conditioning');
    expect(session.participants).toHaveLength(1);
    expect(session.participants[0]).toMatchObject({
      displayName: 'Jordan Lee',
      isLocal: true,
      placeholderLabel: 'Camera preview (mock)',
    });
    expect(seen).toHaveLength(1);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('clears participants on leave and stops notifying an unsubscribed listener', async () => {
    const service = createMockVideoService();
    const listener = jest.fn();
    const unsubscribe = service.onParticipantsChanged(listener);

    await service.join('channel', 'Sam Rivera');
    await service.leave();
    expect(listener).toHaveBeenLastCalledWith([]);

    unsubscribe();
    listener.mockClear();
    await service.join('channel', 'Sam Rivera');
    expect(listener).not.toHaveBeenCalled();
  });

  it('toggles mute and camera on the local tile and reports the new state to listeners', async () => {
    const service = createMockVideoService();
    const snapshots: VideoParticipant[][] = [];
    service.onParticipantsChanged((p) => snapshots.push(p.map((x) => ({ ...x }))));
    await service.join('channel', 'Jo');

    await expect(service.toggleMute()).resolves.toBe(true);
    expect(snapshots[snapshots.length - 1][0]).toMatchObject({ isMuted: true, isCameraOff: false });
    await expect(service.toggleMute()).resolves.toBe(false);
    await expect(service.toggleCamera()).resolves.toBe(true);
    expect(snapshots[snapshots.length - 1][0]).toMatchObject({ isMuted: false, isCameraOff: true });
    await expect(service.toggleCamera()).resolves.toBe(false);
  });

  it('returns false and does not notify when toggling with no active session', async () => {
    const service = createMockVideoService();
    const listener = jest.fn();
    service.onParticipantsChanged(listener);
    await expect(service.toggleMute()).resolves.toBe(false);
    await expect(service.toggleCamera()).resolves.toBe(false);
    expect(listener).not.toHaveBeenCalled();
    await service.join('c', 'Jo');
    await service.leave();
    listener.mockClear();
    await expect(service.toggleMute()).resolves.toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('rejoining resets the tile to unmuted with the camera on', async () => {
    const service = createMockVideoService();
    await service.join('c', 'Jo');
    await service.toggleMute();
    await service.toggleCamera();
    const session = await service.join('c', 'Jo');
    expect(session.participants[0]).toMatchObject({ isMuted: false, isCameraOff: false });
  });
});
