import { User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { COLORS } from "@/lib/colors";
import { SimulationEngine } from "@/lib/simulationEngine";
import { useMaelstromStore } from "@/lib/store";
import { BroadcastStrategy } from "@/lib/strategies/broadcast";
import { EchoStrategy } from "@/lib/strategies/echo";
import { GCounterStrategy } from "@/lib/strategies/gCounter";
import { UniqueIdsStrategy } from "@/lib/strategies/uniqueIds";
import { statusColor } from "@/lib/utils";

export function MaelstromCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<SimulationEngine | null>(null);

    const isPlaying = useMaelstromStore((state) => state.isPlaying);
    const speed = useMaelstromStore((state) => state.speed);
    const challengeId = useMaelstromStore((state) => state.challengeId);

    const events = useMaelstromStore((state) => state.events);
    const convergence = useMaelstromStore((state) => state.convergence);
    const rawLogsLength = useMaelstromStore((state) => state.rawLogs.length);
    const resetTicket = useMaelstromStore((state) => state.resetTicket);

    const addLog = useMaelstromStore((state) => state.addLog);
    const setPlayback = useMaelstromStore((state) => state.setPlayback);

    const [clients, setClients] = useState<string[]>([]);

    const timelinePct =
        events.length > 0
            ? Math.min(100, Math.round((rawLogsLength / events.length) * 100))
            : 0;

    useEffect(() => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        const engine = new SimulationEngine(canvasRef.current);
        engineRef.current = engine;

        const resizeCanvasBuffer = () => {
            if (!canvas) return;

            const displayWidth = canvas.clientWidth;
            const displayHeight = canvas.clientHeight;

            const dpr = window.devicePixelRatio || 1;

            if (
                canvas.width !== displayWidth * dpr ||
                canvas.height !== displayHeight * dpr
            ) {
                canvas.width = displayWidth * dpr;
                canvas.height = displayHeight * dpr;

                const ctx = canvas.getContext("2d");
                if (ctx) {
                    ctx.scale(dpr, dpr);
                }
            }
        };

        resizeCanvasBuffer();

        const resizeObserver = new ResizeObserver(() => resizeCanvasBuffer());
        if (canvas.parentElement) {
            resizeObserver.observe(canvas.parentElement);
        }

        switch (challengeId) {
            case "echo":
                engine.loadChallenge(new EchoStrategy());
                break;
            case "unique-ids":
                engine.loadChallenge(new UniqueIdsStrategy());
                break;
            case "broadcast":
                engine.loadChallenge(new BroadcastStrategy());
                break;
            case "g-counter":
                engine.loadChallenge(new GCounterStrategy());
                break;
        }

        setClients(
            engine.strategy
                ? engine.strategy.workers.map((w) => w.replace("n", "c"))
                : [],
        );

        if (resetTicket > 0) {
            engine.resetState();
        }

        return () => engine.destroy();
    }, [challengeId, resetTicket]);

    useEffect(() => {
        if (!isPlaying || !engineRef.current) return;

        const eventsList = useMaelstromStore.getState().events;

        let currentIdx = useMaelstromStore.getState().rawLogs.length;

        const ms = Math.round(50 / speed);
        const timer = setInterval(() => {
            if (currentIdx >= eventsList.length) {
                setPlayback(false);
                return;
            }
            const evt = eventsList[currentIdx++];
            addLog(evt.raw);
            engineRef.current?.processEvent(evt);
        }, ms);

        return () => clearInterval(timer);
    }, [isPlaying, speed, addLog, setPlayback]);

    return (
        <div className="flex h-full w-full flex-col overflow-hidden">
            <div className="flex w-full justify-around px-16 pt-16">
                {clients.map((c) => (
                    <div key={c} className="flex flex-col items-center gap-1">
                        <User className="text-secondary" size={32} />
                        <p className="font-semibold text-content">{c}</p>
                    </div>
                ))}
            </div>

            <div className="relative min-h-0 w-full flex-1">
                <canvas
                    ref={canvasRef}
                    className="absolute inset-0 block h-full w-full"
                />
            </div>

            <div className="flex w-full flex-col gap-3 p-6">
                {(() => {
                    let gradientStyle = `linear-gradient(to right, ${COLORS.PRIMARY}, ${COLORS.ACCENT})`;
                    if (convergence === 100) {
                        gradientStyle = `linear-gradient(to right, ${COLORS.INFO}, ${COLORS.SUCCESS})`;
                    } else if (convergence > 80) {
                        gradientStyle = `linear-gradient(to right, ${COLORS.ACCENT}, ${COLORS.INFO})`;
                    }

                    return (
                        <div className="flex items-center gap-4 font-bold font-mono text-xs tracking-wider">
                            <span className="w-24 text-right text-base-content/50">
                                CONVERGENCE
                            </span>
                            <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-base-300/50">
                                <div
                                    className="absolute top-0 left-0 h-full transition-all duration-300 ease-out"
                                    style={{
                                        width: `${convergence}%`,
                                        background: gradientStyle,
                                    }}
                                />
                            </div>
                            <span
                                className={`w-12 transition-colors duration-300 text-${statusColor(convergence)}`}
                            >
                                {convergence}%
                            </span>
                        </div>
                    );
                })()}

                <div className="flex items-center gap-4 font-bold font-mono text-xs tracking-wider">
                    <span className="w-24 text-right text-base-content/50">
                        TIMELINE
                    </span>
                    <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-base-300/50">
                        <div
                            className="absolute top-0 left-0 h-full bg-secondary transition-all duration-100 ease-linear"
                            style={{
                                width: `${timelinePct}%`,
                            }}
                        />
                    </div>
                    <span className="w-12 text-secondary">{timelinePct}%</span>
                </div>
            </div>
        </div>
    );
}
