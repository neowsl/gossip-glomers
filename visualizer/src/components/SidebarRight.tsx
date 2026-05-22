// biome-ignore-all lint/suspicious/noArrayIndexKey: code line numbers
import { Pause, Play, TimerReset } from "lucide-react";
import type { FC } from "react";
import { useMaelstromStore } from "@/lib/store";

const SidebarRight: FC = () => {
    const { isPlaying, rawLogs, setPlayback, reset } = useMaelstromStore();

    const renderHighlightedTokens = (line: string) => {
        if (!line.trim()) return line;

        const parts = line.split(/(\bn\d+\b|:\w+)/g);

        return parts.map((part, index) => {
            if (/^n\d+$/.test(part)) {
                return (
                    <span key={index} className="font-bold text-primary">
                        {part}
                    </span>
                );
            }
            if (part.startsWith(":")) {
                return (
                    <span key={index} className="text-base-content">
                        {part}
                    </span>
                );
            }
            return part;
        });
    };

    const getRowColorClass = (line: string) => {
        if (line.includes("ok")) return "text-success";
        if (line.includes("partition") || line.includes("nemesis"))
            return "text-primary font-semibold";
        if (line.includes("fail") || line.includes("info"))
            return "text-primary";
        if (line.includes("invoke")) return "text-info";
        return "text-content";
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
                <div className="mockup-code min-h-0 w-full flex-1 overflow-y-auto bg-base-200 px-2 font-mono text-xs">
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
            </div>
        </div>
    );
};

export default SidebarRight;
