import type { FC } from "react";
import SidebarLeft from "./components/SidebarLeft";

const App: FC = () => {
    return (
        <div className="drawer lg:drawer-open">
            <input
                id="sidebar-left"
                type="checkbox"
                className="drawer-toggle"
            />

            <div className="drawer-content">hi</div>

            <SidebarLeft />
        </div>
    );
};

export default App;
