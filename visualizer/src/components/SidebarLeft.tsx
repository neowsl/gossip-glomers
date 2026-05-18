import {
    GitCompareArrows,
    GitFork,
    Send,
    Wifi,
    WifiLow,
    WifiOff,
} from "lucide-react";
import type { FC } from "react";
import { statusColor } from "../utils/colors";

const SidebarLeft: FC = () => {
    const totalMessages = 100;
    const networkHealth = 10;
    const convergence = 100;

    return (
        <div className="drawer-side">
            <label
                htmlFor="sidebar-left"
                aria-label="close sidebar"
                className="drawer-overlay"
            ></label>

            <div className="h-full w-80 border-base-300 border-r p-4">
                <div className="flex gap-2">
                    <GitFork className="text-primary" height={32} />
                    <a
                        className="text-center font-bold text-2xl text-primary"
                        href="/"
                    >
                        MAELSTROM MATRIX
                    </a>
                </div>

                <div className="divider"></div>

                <div className="mb-4 text-center text-lg text-secondary">
                    -- CHALLENGE --
                </div>

                <ul className="menu w-full gap-2">
                    <li>
                        <button className="outline" type="button">
                            1. Echo
                        </button>
                    </li>
                    <li>
                        <button className="outline" type="button">
                            2. Unique ID Generation
                        </button>
                    </li>
                    <li>
                        <button className="outline" type="button">
                            3. Fault Tolerant Broadcast
                        </button>
                    </li>
                    <li>
                        <button className="outline" type="button">
                            4. Grow-Only Counter
                        </button>
                    </li>
                </ul>

                <div className="divider"></div>

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

                <div className="divider"></div>

                <div className="mb-4 text-center text-lg text-secondary">
                    -- SYSTEM MONITOR --
                </div>

                <div className="stats stats-vertical shadow">
                    <div className="stat">
                        <div className="stat-title flex items-center gap-2 text-lg">
                            <span className="text-secondary">
                                <Send height={24} />
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
                                className={`text-${statusColor(networkHealth)}`}
                            >
                                {networkHealth === 100 ? (
                                    <Wifi height={24} />
                                ) : networkHealth >= 50 ? (
                                    <WifiLow height={24} />
                                ) : (
                                    <WifiOff height={24} />
                                )}
                            </span>{" "}
                            NET HEALTH
                        </div>
                        <div
                            className={`stat-value text-${statusColor(networkHealth)}`}
                            style={{
                                filter: `drop-shadow(0 0 4px var(--color-${statusColor(networkHealth)}))`,
                            }}
                        >
                            <span className="countdown">
                                <span
                                    style={{
                                        "--value": networkHealth,
                                    }}
                                    aria-live="polite"
                                >
                                    {networkHealth}
                                </span>
                                %
                            </span>
                        </div>
                    </div>

                    <div className="stat">
                        <div className="stat-title flex items-center gap-2 text-lg">
                            <span
                                className={`text-${statusColor(convergence)}`}
                            >
                                <GitCompareArrows height={24} />
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
