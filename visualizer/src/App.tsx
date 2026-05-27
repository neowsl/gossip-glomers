import type { FC } from "react";
import { MaelstromCanvas } from "./components/MaelstromCanvas";
import ResponsiveGuard from "./components/ResponsiveGuard";
import SidebarLeft from "./components/SidebarLeft";
import SidebarRight from "./components/SidebarRight";

const App: FC = () => {
    return (
        <>
            <div className="drawer lg:drawer-open">
                <input
                    id="sidebar-left"
                    type="checkbox"
                    className="drawer-toggle"
                />

                <div className="drawer-content">
                    <div className="drawer drawer-end lg:drawer-open">
                        <input
                            id="sidebar-right"
                            type="checkbox"
                            className="drawer-toggle"
                        />

                        <div className="drawer-content">
                            <MaelstromCanvas />
                        </div>

                        <SidebarRight />
                    </div>
                </div>

                <SidebarLeft />
            </div>

            <ResponsiveGuard />
        </>
    );
};

export default App;
