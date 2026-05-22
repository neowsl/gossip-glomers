import { COLORS } from "../colors";
import type { ParsedEvent } from "../parser";
import type { SimulationEngine } from "../simulationEngine";
import { useMaelstromStore } from "../store";
import type { ChallengeStrategy } from ".";

export class BroadcastStrategy implements ChallengeStrategy {
    id = "broadcast";
    workers = ["n0", "n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8", "n9"];
    hasSeqKv = false;

    private totalBroadcastsReceived = 0;

    processEvent(evt: ParsedEvent, engine: SimulationEngine) {
        const store = useMaelstromStore.getState();

        if (engine.nodeValues.size === 0) {
            this.totalBroadcastsReceived = 0;
            for (const w of this.workers) {
                engine.nodeValues.set(w, 0);
            }
        }

        if (evt.type === "broadcast" && evt.message !== undefined) {
            this.totalBroadcastsReceived++;
            if (evt.dest.startsWith("n")) {
                const current = engine.nodeValues.get(evt.dest) || 0;
                engine.nodeValues.set(
                    evt.dest,
                    Math.max(current, this.totalBroadcastsReceived),
                );
            }
        }

        if (
            evt.type === "read_ok" &&
            evt.src.startsWith("n") &&
            evt.value !== undefined
        ) {
            const currentKnown = engine.nodeValues.get(evt.src) || 0;
            engine.nodeValues.set(evt.src, Math.max(currentKnown, evt.value));
        }

        const counts = this.workers.map((n) => engine.nodeValues.get(n) || 0);
        const maxCount = Math.max(...counts, 1);
        const minCount = Math.min(...counts);

        store.updateMetrics({
            convergence: Math.round((minCount / maxCount) * 100),
            totalOps: store.totalOps + 1,
            totalMessages: this.totalBroadcastsReceived,
        });
    }

    getNodeValue(nodeId: string, engine: SimulationEngine) {
        return engine.nodeValues.get(nodeId) || 0;
    }

    getDisplayString(nodeId: string, engine: SimulationEngine) {
        return String(this.getNodeValue(nodeId, engine));
    }

    getNodeColor(nodeId: string, engine: SimulationEngine) {
        const val = this.getNodeValue(nodeId, engine);
        if (this.totalBroadcastsReceived === 0) return COLORS.INFO;
        if (val >= this.totalBroadcastsReceived) return COLORS.SUCCESS;
        if (val >= this.totalBroadcastsReceived * 0.8) return COLORS.WARNING;
        return COLORS.ERROR;
    }
}
