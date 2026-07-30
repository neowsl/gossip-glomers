import { create } from "zustand";
import { type ParsedEvent, type ParsedTopology, parseEvents } from "./parser";
import type { ChallengeId } from "./types";

const INITIAL_CHALLENGE: ChallengeId = "kafka-log";

interface MaelstromState {
    challengeId: ChallengeId;
    events: ParsedEvent[];
    topology: ParsedTopology;
    duration: number;
    totalMessages: number;
    networkHealthy: boolean;
    convergence: number;
    rawLogs: string[];
    isPlaying: boolean;
    speed: number;
    resetTicket: number;
    playbackIndex: number;
    playbackProgress: number;

    setChallengeId: (id: ChallengeId) => void;
    setPlayback: (isPlaying: boolean) => void;
    setSpeed: (speed: number) => void;
    setPlaybackProgress: (
        index: number,
        progress: number,
        logs: string[],
    ) => void;
    completePlayback: (index: number, logs: string[]) => void;
    updateMetrics: (metrics: Partial<MaelstromState>) => void;
    reset: () => void;
}

const EMPTY_TOPOLOGY: ParsedTopology = { workers: [], services: [] };

export const useMaelstromStore = create<MaelstromState>((set) => {
    let pendingMetrics: Partial<MaelstromState> = {};
    let metricsTimer: number | undefined;

    const clearPendingMetrics = () => {
        if (metricsTimer !== undefined) window.clearTimeout(metricsTimer);
        metricsTimer = undefined;
        pendingMetrics = {};
    };

    return {
        challengeId: INITIAL_CHALLENGE,
        events: [],
        topology: EMPTY_TOPOLOGY,
        duration: 0,
        convergence: 100,
        networkHealthy: true,
        totalMessages: 0,
        rawLogs: [],
        isPlaying: false,
        speed: 1,
        resetTicket: 0,
        playbackIndex: 0,
        playbackProgress: 0,

        setChallengeId: async (id) => {
            const baseUrl = window.location.origin + import.meta.env.BASE_URL;
            let response = await fetch(
                new URL(`logs/${id}.json`, baseUrl).href,
            );
            if (!response.ok) {
                response = await fetch(new URL(`logs/${id}.edn`, baseUrl).href);
            }
            if (!response.ok)
                throw new Error(`Failed to fetch logs for ${id}.`);

            const rawText = await response.text();
            const parsedLog = parseEvents(rawText);
            clearPendingMetrics();

            set({
                challengeId: id,
                events: parsedLog.events,
                topology: parsedLog.topology,
                duration: parsedLog.duration,
                convergence: 100,
                networkHealthy: true,
                totalMessages: 0,
                rawLogs: [],
                isPlaying: false,
                playbackIndex: 0,
                playbackProgress: 0,
            });
        },
        setPlayback: (isPlaying) => set({ isPlaying }),
        setSpeed: (speed) => set({ speed }),
        setPlaybackProgress: (playbackIndex, playbackProgress, logs) =>
            set((state) => ({
                playbackIndex,
                playbackProgress,
                rawLogs: [...logs.toReversed(), ...state.rawLogs].slice(0, 100),
            })),
        completePlayback: (playbackIndex, logs) => {
            if (metricsTimer !== undefined) window.clearTimeout(metricsTimer);
            metricsTimer = undefined;
            set((state) => ({
                ...pendingMetrics,
                isPlaying: false,
                playbackIndex,
                playbackProgress: 1,
                rawLogs: [...logs.toReversed(), ...state.rawLogs].slice(0, 100),
            }));
            pendingMetrics = {};
        },
        updateMetrics: (metrics) => {
            pendingMetrics = { ...pendingMetrics, ...metrics };
            if (metricsTimer !== undefined) return;
            metricsTimer = window.setTimeout(() => {
                set(pendingMetrics);
                pendingMetrics = {};
                metricsTimer = undefined;
            }, 100);
        },
        reset: () => {
            clearPendingMetrics();
            set((state) => ({
                convergence: 100,
                networkHealthy: true,
                totalMessages: 0,
                rawLogs: [],
                isPlaying: false,
                resetTicket: state.resetTicket + 1,
                playbackIndex: 0,
                playbackProgress: 0,
            }));
        },
    };
});

useMaelstromStore.getState().setChallengeId(INITIAL_CHALLENGE);
