import { statusColor } from "@lib/utils";
import { GitCompareArrows, GitFork, Send, Wifi, WifiOff } from "lucide-react";
import type { FC } from "react";
import { useMaelstromStore } from "@/lib/store";
import type { ChallengeId } from "@/lib/types";

const CHALLENGES: Record<ChallengeId, string> = {
    echo: "Echo",
    "unique-ids": "Unique ID Generation",
    broadcast: "Fault Tolerant Broadcast",
    "g-counter": "Grow-Only Counter",
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

            <div className="h-full w-80 border-base-300 border-r p-4">
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
                                {i}. {CHALLENGES[id as ChallengeId]}
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
                            <p>
                                Gossip all received messages to every peer.
                                Survive network partitions using per-neighbor
                                buffered queues with exponential backoff and
                                jitter.
                            </p>
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
                                    style={{
                                        "--value": convergence,
                                    }}
                                    aria-live="polite"
                                >
                                    {convergence}
                                </span>
                                %
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SidebarLeft;
