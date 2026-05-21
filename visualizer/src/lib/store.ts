import { create } from "zustand";
import { type ParsedEvent, parseEvents } from "./parser";
import type { ChallengeId } from "./types";

interface MaelstromState {
    challengeId: ChallengeId;
    events: ParsedEvent[];
    totalMessages: number;
    networkHealthy: boolean;
    convergence: number;
    totalOps: number;
    rawLogs: string[];
    isPlaying: boolean;
    speed: number;

    setChallengeId: (id: ChallengeId) => void;
    setPlayback: (isPlaying: boolean) => void;
    setSpeed: (speed: number) => void;
    addLog: (log: string) => void;
    updateMetrics: (metrics: Partial<MaelstromState>) => void;
    reset: () => void;
}

export const useMaelstromStore = create<MaelstromState>((set) => ({
    challengeId: "g-counter",
    events: [],
    convergence: 100,
    networkHealthy: true,
    totalMessages: 0,
    totalOps: 0,
    rawLogs: [],
    isPlaying: false,
    speed: 1,

    setChallengeId: async (id) => {
        const response = await fetch(
            `${import.meta.env.BASE_URL || "/"}logs/${id}.edn`,
        );
        if (!response.ok) throw new Error(`Failed to fetch logs for ${id}.`);

        const rawText = await response.text();

        set({
            challengeId: id,
            events: parseEvents(rawText),
            rawLogs: [],
            totalMessages: 0,
            totalOps: 0,
            convergence: 100,
        });
    },
    setPlayback: (isPlaying) => set({ isPlaying }),
    setSpeed: (speed) => set({ speed }),
    addLog: (log) =>
        set((state) => ({ rawLogs: [log, ...state.rawLogs].slice(0, 80) })),
    updateMetrics: (metrics) => set((state) => ({ ...state, ...metrics })),
    reset: () =>
        set({
            totalMessages: 0,
            networkHealthy: true,
            convergence: 100,
            totalOps: 0,
            rawLogs: [],
        }),
}));
