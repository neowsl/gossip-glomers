import { SimulationEngine } from "@lib/simulationEngine.ts";
import { useMaelstromStore } from "@lib/store";
import { BroadcastStrategy } from "@lib/strategies";
import { useEffect, useRef } from "react";

export function MaelstromCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<SimulationEngine | null>(null);

    const isPlaying = useMaelstromStore((state) => state.isPlaying);
    const speed = useMaelstromStore((state) => state.speed);
    const challengeId = useMaelstromStore((state) => state.challengeId);

    const addLog = useMaelstromStore((state) => state.addLog);
    const setPlayback = useMaelstromStore((state) => state.setPlayback);

    useEffect(() => {
        if (!canvasRef.current) return;

        const engine = new SimulationEngine(canvasRef.current);
        engineRef.current = engine;

        switch (challengeId) {
            case "broadcast":
                engine.loadChallenge(new BroadcastStrategy());
                break;
        }

        return () => engine.destroy();
    }, [challengeId]);

    useEffect(() => {
        if (!isPlaying || !engineRef.current) return;

        const events = useMaelstromStore.getState().events;
        let currentIdx = 0;

        const ms = Math.round(50 / speed);
        const timer = setInterval(() => {
            if (currentIdx >= events.length) {
                setPlayback(false);
                return;
            }
            const evt = events[currentIdx++];
            addLog(evt.raw);
            engineRef.current?.processEvent(evt);
        }, ms);

        return () => clearInterval(timer);
    }, [isPlaying, speed, addLog, setPlayback]);

    return (
        <div
            className="relative h-full w-full overflow-hidden"
            style={{ background: "#020a16" }}
        >
            <canvas ref={canvasRef} className="block h-full w-full" />
        </div>
    );
}
