import type { FC } from "react";

const SidebarLeft: FC = () => {
    return (
        <div className="drawer-side">
            <label
                htmlFor="sidebar-left"
                aria-label="close sidebar"
                className="drawer-overlay"
            ></label>

            <div className="h-full w-80 border-base-300 border-r p-4">
                <div className="text-center font-bold text-2xl text-primary">
                    MAELSTROM MATRIX
                </div>

                <div className="divider"></div>

                <div className="mb-2 text-center text-lg text-secondary">
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
                            2. Unique ID
                        </button>
                    </li>
                    <li>
                        <button className="outline" type="button">
                            3. Broadcast
                        </button>
                    </li>
                    <li>
                        <button className="outline" type="button">
                            4. G-Counter
                        </button>
                    </li>
                </ul>

                <div className="divider"></div>
            </div>
        </div>
    );
};

export default SidebarLeft;
