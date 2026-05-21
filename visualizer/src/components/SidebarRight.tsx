import { Pause, Play } from "lucide-react";
import type { FC } from "react";
import { useMaelstromStore } from "@/lib/store";

const SidebarRight: FC = () => {
    const { isPlaying, rawLogs, setPlayback } = useMaelstromStore();

    return (
        <div className="drawer-side">
            <label
                htmlFor="sidebar-right"
                aria-label="close sidebar"
                className="drawer-overlay"
            ></label>

            <div className="h-full w-80 border-base-300 border-l p-4">
                <div className="mb-4 text-center text-lg text-secondary">
                    -- PLAYBACK --
                </div>

                <button
                    className={`btn btn-outline ${!isPlaying ? "btn-success" : "btn-error"}`}
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

                <div className="divider"></div>

                <div className="mb-4 text-center text-lg text-secondary">
                    -- LOG STREAM --
                </div>
                <div className="mockup-code w-full bg-base-200">
                    {rawLogs.map((line, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: code line
                        <code key={i}>{line}</code>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SidebarRight;
