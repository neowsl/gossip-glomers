import { create } from "zustand";
import { type ParsedEvent, parseEvents } from "./parser";
import type { ChallengeId } from "./types";

interface MaelstromState {
    challengeId: ChallengeId;
    events: ParsedEvent[];
    totalMessages: number;
    networkHealthy: boolean;
    convergence: number;
    rawLogs: string[];
    isPlaying: boolean;
    speed: number;
    resetTicket: number;

    setChallengeId: (id: ChallengeId) => void;
    setPlayback: (isPlaying: boolean) => void;
    setSpeed: (speed: number) => void;
    addLog: (log: string) => void;
    updateMetrics: (metrics: Partial<MaelstromState>) => void;
    reset: () => void;
}

export const useMaelstromStore = create<MaelstromState>((set) => ({
    challengeId: "kafka-log",
    events: [],
    convergence: 100,
    networkHealthy: true,
    totalMessages: 0,
    rawLogs: [],
    isPlaying: false,
    speed: 1,
    resetTicket: 0,

    setChallengeId: async (id) => {
        const logFileUrl = new URL(
            `logs/${id}.edn`,
            window.location.origin + import.meta.env.BASE_URL,
        ).href;

        const response = await fetch(logFileUrl);
        if (!response.ok) throw new Error(`Failed to fetch logs for ${id}.`);

        const rawText = await response.text();

        set({
            challengeId: id,
            events: parseEvents(rawText),
            convergence: 100,
            networkHealthy: true,
            totalMessages: 0,
            rawLogs: [],
            isPlaying: false,
        });
    },
    setPlayback: (isPlaying) => set({ isPlaying }),
    setSpeed: (speed) => set({ speed }),
    addLog: (log) => set((state) => ({ rawLogs: [log, ...state.rawLogs] })),
    updateMetrics: (metrics) => set((state) => ({ ...state, ...metrics })),
    reset: () =>
        set((state) => ({
            convergence: 100,
            networkHealthy: true,
            totalMessages: 0,
            rawLogs: [],
            isPlaying: false,
            resetTicket: state.resetTicket + 1,
        })),
}));
