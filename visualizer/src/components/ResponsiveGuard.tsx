import { MonitorX } from "lucide-react";
import type { FC } from "react";

const ResponsiveGuard: FC = () => {
    return (
        <dialog open className="modal z-100 backdrop-blur-sm xl:hidden">
            <div className="modal-box">
                <h3 className="flex items-center gap-4 font-bold text-error text-lg">
                    <MonitorX size={24} />
                    Wider Display Required
                </h3>

                <p className="pt-4">
                    Maelstrom Matrix requires a wider viewport to render the
                    full interface.
                </p>
                <p className="py-4">
                    Please maximize/expand your browser window, or view on a
                    larger device! 🙂
                </p>
            </div>
        </dialog>
    );
};

export default ResponsiveGuard;
