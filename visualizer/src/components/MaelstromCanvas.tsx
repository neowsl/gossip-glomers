import { User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { COLORS } from "@/lib/colors";
import { startPlayback } from "@/lib/playbackScheduler";
import { SimulationEngine } from "@/lib/simulationEngine";
import { useMaelstromStore } from "@/lib/store";
import { BroadcastStrategy } from "@/lib/strategies/broadcast";
import { EchoStrategy } from "@/lib/strategies/echo";
import { GCounterStrategy } from "@/lib/strategies/gCounter";
import { KafkaLogStrategy } from "@/lib/strategies/kafkaLog";
import { UniqueIdsStrategy } from "@/lib/strategies/uniqueIds";
import { TxnStoreStrategy } from "@/lib/strategies/txnStore";
import { statusColor } from "@/lib/utils";

const PLAYBACK_DURATION_MS = 30_000;

export function MaelstromCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<SimulationEngine | null>(null);
    const playbackIndexRef = useRef(0);

    const isPlaying = useMaelstromStore((state) => state.isPlaying);
    const speed = useMaelstromStore((state) => state.speed);
    const challengeId = useMaelstromStore((state) => state.challengeId);

    const topology = useMaelstromStore((state) => state.topology);
    const convergence = useMaelstromStore((state) => state.convergence);
    const playbackProgress = useMaelstromStore(
        (state) => state.playbackProgress,
    );
    const resetTicket = useMaelstromStore((state) => state.resetTicket);

    const setPlaybackProgress = useMaelstromStore(
        (state) => state.setPlaybackProgress,
    );
    const completePlayback = useMaelstromStore(
        (state) => state.completePlayback,
    );

    const [clients, setClients] = useState<string[]>([]);

    const timelinePct = Math.round(playbackProgress * 100);

    useEffect(() => {
        if (!canvasRef.current) return;

        playbackIndexRef.current = 0;

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
                engine.loadChallenge(new EchoStrategy(), topology);
                break;
            case "unique-ids":
                engine.loadChallenge(new UniqueIdsStrategy(), topology);
                break;
            case "broadcast":
                engine.loadChallenge(new BroadcastStrategy(), topology);
                break;
            case "g-counter":
                engine.loadChallenge(new GCounterStrategy(), topology);
                break;
            case "kafka-log":
                engine.loadChallenge(new KafkaLogStrategy(), topology);
                break;
            case "txn-store":
                engine.loadChallenge(new TxnStoreStrategy(), topology);
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
    }, [challengeId, resetTicket, topology]);

    useEffect(() => {
        if (!isPlaying || !engineRef.current) return;

        const state = useMaelstromStore.getState();
        return startPlayback({
            events: state.events,
            fromIndex: playbackIndexRef.current,
            fromProgress: state.playbackProgress,
            playbackDuration: PLAYBACK_DURATION_MS,
            speed,
            onEvent: (event) => {
                playbackIndexRef.current++;
                engineRef.current?.processEvent(event);
            },
            onProgress: setPlaybackProgress,
            onComplete: completePlayback,
        });
    }, [completePlayback, isPlaying, speed, setPlaybackProgress]);

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
