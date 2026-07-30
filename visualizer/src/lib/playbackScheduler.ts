import type { ParsedEvent } from "./parser";

const PROGRESS_INTERVAL_MS = 100;

interface PlaybackOptions {
    events: ParsedEvent[];
    fromIndex: number;
    sourceDuration: number;
    playbackDuration: number;
    speed: number;
    onEvent: (event: ParsedEvent) => void;
    onProgress: (index: number, logs: string[]) => void;
    onComplete: (index: number, logs: string[]) => void;
}

export const startPlayback = ({
    events,
    fromIndex,
    sourceDuration,
    playbackDuration,
    speed,
    onEvent,
    onProgress,
    onComplete,
}: PlaybackOptions) => {
    if (fromIndex >= events.length) {
        onComplete(events.length, []);
        return () => undefined;
    }

    let frameId = 0;
    let index = fromIndex;
    let lastProgressAt = 0;
    let pendingLogs: string[] = [];
    const scale = sourceDuration > 0 ? playbackDuration / sourceDuration : 0;
    const startingOffset = events[fromIndex].time * scale;
    const startedAt = performance.now() - startingOffset / speed;

    const publishProgress = (now: number, force = false) => {
        if (!force && now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
        onProgress(index, pendingLogs);
        pendingLogs = [];
        lastProgressAt = now;
    };

    const tick = (now: number) => {
        const sourceTime =
            scale > 0 ? ((now - startedAt) * speed) / scale : Infinity;

        while (index < events.length && events[index].time <= sourceTime) {
            const event = events[index++];
            onEvent(event);
            pendingLogs.push(event.raw);
        }

        if (index >= events.length) {
            onComplete(index, pendingLogs);
            return;
        }

        publishProgress(now);
        frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
};
