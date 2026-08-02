// biome-ignore-all lint/suspicious/noArrayIndexKey: code line numbers
import { ExternalLink, Pause, Play, TimerReset } from "lucide-react";
import type { FC } from "react";
import { useMaelstromStore } from "@/lib/store";

const SidebarRight: FC = () => {
    const { isPlaying, rawLogs, setPlayback, reset } = useMaelstromStore();

    const getTokenColorClass = (token: string) => {
        switch (token) {
            case ":ok":
                return "text-success";
            case ":invoke":
                return "text-base-content/50";
            case ":broadcast":
                return "text-primary font-bold";
            case ":add":
                return "text-primary font-bold";
            case ":send":
                return "text-primary font-bold";
            case ":nemesis":
                return "text-error font-bold";
            case ":info":
                return "text-info";
            default:
                return "text-base-content";
        }
    };

    const renderHighlightedTokens = (line: string) => {
        if (!line.trim()) return line;

        const tokens = line.split(/(\bn\d+\b|:\w+)/g);

        return tokens.map((token, index) => {
            if (!token.startsWith(":")) return token;
            return (
                <span key={index} className={getTokenColorClass(token)}>
                    {token}
                </span>
            );
        });
    };

    const getRowColorClass = (line: string) => {
        if (line.includes("nemesis")) return "text-error font-semibold";
        return "text-success";
    };

    return (
        <div className="drawer-side">
            <label
                htmlFor="sidebar-right"
                aria-label="close sidebar"
                className="drawer-overlay"
            ></label>

            <div className="flex h-full w-80 flex-col border-base-300 border-l p-4">
                <div className="mb-4 text-center text-lg text-secondary">
                    -- PLAYBACK --
                </div>

                <div className="flex gap-2">
                    <button
                        className={`btn btn-outline ${!isPlaying ? "btn-success" : "btn-error"} flex-1`}
                        type="button"
                        onClick={() => setPlayback(!isPlaying)}
                    >
                        {!isPlaying ? (
                            <>
                                <Play size={18} /> Play
                            </>
                        ) : (
                            <>
                                <Pause size={18} /> Pause
                            </>
                        )}
                    </button>
                    <button
                        className={`btn btn-outline flex-1`}
                        type="button"
                        onClick={() => reset()}
                    >
                        <TimerReset size={18} /> Reset
                    </button>
                </div>

                <div className="divider" />

                <div className="mb-4 text-center text-lg text-secondary">
                    -- LOG STREAM --
                </div>
                <div className="mockup-code mb-4 min-h-0 w-full flex-1 overflow-y-auto bg-base-200 px-2 font-mono text-xs">
                    {rawLogs
                        .filter((_, i) => i <= 80)
                        .map((line, i) => (
                            <pre
                                data-prefix={rawLogs.length - i}
                                key={i}
                                className={`w-full overflow-x-hidden ${getRowColorClass(line)}`}
                            >
                                <code className="inline-block whitespace-pre-wrap break-all pr-8 text-left">
                                    {renderHighlightedTokens(line)}
                                </code>
                            </pre>
                        ))}
                </div>

                <footer className="footer px-2 text-base-content">
                    <aside>
                        <p>© {new Date().getFullYear()} Neal Wang.</p>
                        <p>Code licensed under GPLv3.</p>
                        <a
                            className="link flex items-center gap-1"
                            href="https://git.nealwang.dev/neo/maelstrom-matrix"
                            target="_blank"
                            rel="noopener"
                        >
                            <ExternalLink size={16} />
                            Git repo
                        </a>
                    </aside>
                </footer>
            </div>
        </div>
    );
};

export default SidebarRight;
