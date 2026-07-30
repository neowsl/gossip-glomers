import type { ParsedEvent } from "./parser";

const PROGRESS_INTERVAL_MS = 100;
const MAX_IDLE_GAP_MS = 250;

interface PlaybackOptions {
    events: ParsedEvent[];
    fromIndex: number;
    fromProgress: number;
    playbackDuration: number;
    speed: number;
    onEvent: (event: ParsedEvent) => void;
    onProgress: (index: number, progress: number, logs: string[]) => void;
    onComplete: (index: number, logs: string[]) => void;
}

export const startPlayback = ({
    events,
    fromIndex,
    fromProgress,
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
    const eventTimes = events.reduce<number[]>((times, event, eventIndex) => {
        if (eventIndex === 0) return [0];

        const sourceGap = Math.max(0, event.time - events[eventIndex - 1].time);
        times.push(
            times[eventIndex - 1] + Math.min(sourceGap, MAX_IDLE_GAP_MS),
        );
        return times;
    }, []);
    const replayDuration = eventTimes.at(-1) ?? 0;
    const scale = replayDuration > 0 ? playbackDuration / replayDuration : 0;
    const startingOffset = replayDuration * fromProgress * scale;
    const startedAt = performance.now() - startingOffset / speed;

    const publishProgress = (now: number, replayTime: number) => {
        if (now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
        onProgress(
            index,
            replayDuration > 0 ? Math.min(replayTime / replayDuration, 1) : 1,
            pendingLogs,
        );
        pendingLogs = [];
        lastProgressAt = now;
    };

    const tick = (now: number) => {
        const replayTime =
            scale > 0 ? ((now - startedAt) * speed) / scale : Infinity;

        while (index < events.length && eventTimes[index] <= replayTime) {
            const event = events[index++];
            onEvent(event);
            pendingLogs.push(event.raw);
        }

        if (index >= events.length) {
            onComplete(index, pendingLogs);
            return;
        }

        publishProgress(now, replayTime);
        frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
};
