import { statusColor } from "@lib/utils";
import {
    ExternalLink,
    GitCompareArrows,
    GitFork,
    Send,
    Wifi,
    WifiOff,
} from "lucide-react";
import type { FC } from "react";
import { useMaelstromStore } from "@/lib/store";
import type { ChallengeId } from "@/lib/types";

interface ChallengeDetails {
    displayName: string;
    objective: string;
}

const CHALLENGES: Record<ChallengeId, ChallengeDetails> = {
    echo: {
        displayName: "Echo",
        objective:
            "Reflect all messages back to clients. Implement reliable request-response handling and validate the Maelstrom RPC protocol.",
    },
    "unique-ids": {
        displayName: "Unique ID Generation",
        objective:
            "Mint globally unique IDs using Snowflake bit-packing: 41-bit timestamp | 10-bit node | 12-bit sequence counter. No coordination needed.",
    },
    broadcast: {
        displayName: "Fault Tolerant Broadcast",
        objective:
            "Gossip all received messages to every peer. Survive network partitions using per-neighbor buffered queues with exponential backoff and jitter.",
    },
    "g-counter": {
        displayName: "Grow-Only Counter",
        objective:
            "CRDT Grow-Only Counter with sequential consistency (seq-kv). Nodes own exclusive namespaces, aggregate asynchronously — eliminating service contention.",
    },
    "kafka-log": {
        displayName: "Kafka-Style Log",
        objective:
            "Replicate distributed log across multiple nodes with linearizability (lin-kv). Leverage optimistic concurrency to maintain immutable message sequences.",
    },
};

const SidebarLeft: FC = () => {
    const {
        challengeId,
        totalMessages,
        networkHealthy,
        convergence,
        setChallengeId,
    } = useMaelstromStore();

    return (
        <div className="drawer-side">
            <label
                htmlFor="sidebar-left"
                aria-label="close sidebar"
                className="drawer-overlay"
            ></label>

            <div className="flex h-full w-80 flex-col border-base-300 border-r p-4">
                <div className="flex gap-2">
                    <GitFork className="text-primary" size={32} />
                    <a
                        className="text-center font-bold text-2xl text-primary"
                        href="/"
                    >
                        MAELSTROM MATRIX
                    </a>
                </div>

                <div className="divider" />

                <div className="mb-4 text-center text-lg text-secondary">
                    -- CHALLENGE --
                </div>

                <ul className="menu w-full gap-2">
                    {Object.keys(CHALLENGES).map((id, i) => (
                        <li key={id}>
                            <button
                                className={`outline ${challengeId === id ? "menu-active" : ""}`}
                                type="button"
                                onClick={() =>
                                    setChallengeId(id as ChallengeId)
                                }
                            >
                                {i}. {CHALLENGES[id as ChallengeId].displayName}
                            </button>
                        </li>
                    ))}
                </ul>

                <div className="divider" />

                <div className="mb-4 text-center text-lg text-secondary">
                    -- MISSION OBJECTIVE --
                </div>

                <div className="flex-col">
                    <div className="card card-border w-full bg-base-300">
                        <div className="card-body p-4">
                            <p>{CHALLENGES[challengeId].objective}</p>
                        </div>
                    </div>
                </div>

                <div className="divider" />

                <div className="mb-4 text-center text-lg text-secondary">
                    -- SYSTEM MONITOR --
                </div>

                <div className="stats stats-vertical shadow">
                    <div className="stat">
                        <div className="stat-title flex items-center gap-2 text-lg">
                            <span className="text-secondary">
                                <Send size={24} />
                            </span>{" "}
                            TOTAL MSG
                        </div>
                        <div className="stat-value text-secondary drop-shadow-[0_0_5px_var(--color-secondary)]">
                            {totalMessages}
                        </div>
                    </div>

                    <div className="stat">
                        <div className="stat-title flex items-center gap-2 text-lg">
                            <span
                                className={`${networkHealthy ? "text-success" : "text-error"}`}
                            >
                                {networkHealthy ? (
                                    <Wifi size={24} />
                                ) : (
                                    <WifiOff size={24} />
                                )}
                            </span>{" "}
                            NETWORK
                        </div>
                        <div
                            className={`stat-value ${networkHealthy ? "text-success" : "animate-pulse text-error"}`}
                            style={{
                                filter: `drop-shadow(0 0 4px var(--color-${networkHealthy ? "success" : "error"}))`,
                            }}
                        >
                            {networkHealthy ? "Healthy" : "Partitioned"}
                        </div>
                    </div>

                    <div className="stat">
                        <div className="stat-title flex items-center gap-2 text-lg">
                            <span
                                className={`text-${statusColor(convergence)}`}
                            >
                                <GitCompareArrows size={24} />
                            </span>{" "}
                            CONVERGENCE
                        </div>
                        <div
                            className={`stat-value text-${statusColor(convergence)}`}
                            style={{
                                filter: `drop-shadow(0 0 4px var(--color-${statusColor(convergence)}))`,
                            }}
                        >
                            <span className="countdown">
                                <span
                                    style={
                                        {
                                            "--value": convergence,
                                        } as React.CSSProperties
                                    }
                                    aria-live="polite"
                                >
                                    {convergence}
                                </span>
                                %
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex-1" />

                <footer className="footer px-2 text-base-content">
                    <aside>
                        <p>© {new Date().getFullYear()} Neal Wang.</p>
                        <p>Code licensed under GPLv3.</p>
                        <a
                            className="link flex items-center gap-1"
                            href="https://github.com/neowsl/maelstrom-matrix"
                            target="_blank"
                            rel="noopener"
                        >
                            <ExternalLink size={16} />
                            GitHub
                        </a>
                    </aside>
                </footer>
            </div>
        </div>
    );
};

export default SidebarLeft;
