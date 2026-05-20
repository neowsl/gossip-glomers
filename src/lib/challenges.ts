import echoRaw from "../logs/echo.txt?raw";
import uniqueIdRaw from "../logs/unique-id.txt?raw";
import broadcastRaw from "../logs/broadcast.txt?raw";
import gcounterRaw from "../logs/g-counter.txt?raw";
import { parseEvents } from "./parser";
import type { ParsedEvent } from "./parser";

export type ChallengeId = "echo" | "unique-id" | "broadcast" | "g-counter";

export interface ChallengeConfig {
    id: ChallengeId;
    number: number;
    label: string;
    consistencyModel: string;
    missionObjective: string;
    showSeqKv: boolean;
    topology: "none" | "mesh" | "kv-hub";
    nodeMetricLabel: string;
    accentColor: string;
    topologyLinks: [string, string][];
    getSimulatedEvents(): ParsedEvent[];
}

const generateFullMesh = (num: number): [string, string][] => {
    const links: [string, string][] = [];
    for (let i = 0; i < num; i++) {
        for (let j = i + 1; j < num; j++) {
            links.push([`n${i}`, `n${j}`]);
        }
    }
    return links;
};

export const CHALLENGES: ChallengeConfig[] = [
    {
        id: "echo",
        number: 1,
        label: "Echo",
        consistencyModel: "N/A (Stateless)",
        missionObjective:
            "Reflect all messages back to clients. Implement reliable request-response handling and validate the Maelstrom RPC protocol.",
        showSeqKv: false,
        topology: "none",
        nodeMetricLabel: "OPS",
        accentColor: "#00f3ff",
        topologyLinks: [],
        getSimulatedEvents: () => parseEvents(echoRaw),
    },
    {
        id: "unique-id",
        number: 2,
        label: "Unique ID",
        consistencyModel: "Monotonic (Node-local)",
        missionObjective:
            "Mint globally unique IDs using Snowflake bit-packing: 41-bit timestamp | 10-bit node | 12-bit sequence counter. No coordination needed.",
        showSeqKv: false,
        topology: "none",
        nodeMetricLabel: "IDs MINTED",
        accentColor: "#b44dff",
        topologyLinks: [],
        getSimulatedEvents: () => parseEvents(uniqueIdRaw),
    },
    {
        id: "broadcast",
        number: 3,
        label: "Broadcast",
        consistencyModel: "Eventual Consistency",
        missionObjective:
            "Gossip all received messages to every peer. Survive network partitions using per-neighbor buffered queues with exponential backoff and jitter.",
        showSeqKv: false,
        topology: "mesh",
        nodeMetricLabel: "MSG COUNT",
        accentColor: "#00ff9d",
        topologyLinks: generateFullMesh(10),
        getSimulatedEvents: () => parseEvents(broadcastRaw),
    },
    {
        id: "g-counter",
        number: 4,
        label: "G-Counter",
        consistencyModel: "Sequential Consistency",
        missionObjective:
            "CRDT Grow-Only Counter with sharded seq-kv keys. Nodes own exclusive namespaces, aggregate asynchronously — eliminating CompareAndSwap contention.",
        showSeqKv: true,
        topology: "kv-hub",
        nodeMetricLabel: "COUNTER",
        accentColor: "#00f3ff",
        topologyLinks: generateFullMesh(5),
        getSimulatedEvents: () => parseEvents(gcounterRaw),
    },
];

export function getChallengeById(id: ChallengeId): ChallengeConfig {
    return CHALLENGES.find((c) => c.id === id)!;
}
