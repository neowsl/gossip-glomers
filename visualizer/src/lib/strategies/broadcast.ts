import { COLORS } from "../colors";
import type { ParsedEvent } from "../parser";
import type { SimulationEngine } from "../simulationEngine";
import { useMaelstromStore } from "../store";
import type { ChallengeStrategy } from ".";

export class BroadcastStrategy implements ChallengeStrategy {
    public id = "broadcast";
    public workers = [
        "n0",
        "n1",
        "n2",
        "n3",
        "n4",
        "n5",
        "n6",
        "n7",
        "n8",
        "n9",
    ];
    public hasSeqKv = false;

    private totalBroadcasts = 0;

    public processEvent(evt: ParsedEvent, engine: SimulationEngine) {
        const store = useMaelstromStore.getState();

        if (evt.type === "broadcast" && evt.message !== undefined) {
            this.totalBroadcasts++;
            if (evt.dest.startsWith("n")) {
                const current = engine.nodeValues.get(evt.dest) || 0;
                engine.nodeValues.set(
                    evt.dest,
                    Math.max(current, this.totalBroadcasts),
                );
            }
        }

        if (
            evt.type === "read_ok" &&
            evt.src.startsWith("n") &&
            evt.value !== undefined
        ) {
            engine.nodeValues.set(evt.src, evt.value);
        }

        const counts = this.workers.map((n) => engine.nodeValues.get(n) || 0);
        const maxCount = Math.max(...counts, 1);
        const minCount = Math.min(...counts);

        store.updateMetrics({
            convergence: Math.round((minCount / maxCount) * 100),
            totalOps: store.totalOps + 1,
            totalMessages: this.totalBroadcasts,
        });
    }

    public getNodeValue(nodeId: string, engine: SimulationEngine) {
        return engine.nodeValues.get(nodeId) || 0;
    }

    public getDisplayString(nodeId: string, engine: SimulationEngine) {
        return String(this.getNodeValue(nodeId, engine));
    }

    public getNodeColor(nodeId: string, engine: SimulationEngine) {
        const val = this.getNodeValue(nodeId, engine);
        if (this.totalBroadcasts === 0) return COLORS.INFO;
        if (val >= this.totalBroadcasts) return COLORS.SUCCESS;
        if (val >= this.totalBroadcasts - 5) return COLORS.WARNING;
        return COLORS.ERROR;
    }
}
