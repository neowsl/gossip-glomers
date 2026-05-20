import { Play } from "lucide-react";
import type { FC } from "react";

const SidebarRight: FC = () => {
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

                <button className="btn btn-outline btn-success" type="button">
                    <Play size={18} /> Play
                </button>

                <div className="divider"></div>

                <div className="mb-4 text-center text-lg text-secondary">
                    -- LOG STREAM --
                </div>
                <div className="mockup-code w-full bg-base-200"></div>
            </div>
        </div>
    );
};

export default SidebarRight;
