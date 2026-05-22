import { COLORS } from "../colors";
import type { ParsedEvent } from "../parser";
import type { SimulationEngine } from "../simulationEngine";
import { useMaelstromStore } from "../store";
import type { ChallengeStrategy } from ".";

export class GCounterStrategy implements ChallengeStrategy {
    public id = "g-counter";
    public workers = ["n0", "n1", "n2", "n3", "n4"];
    public hasSeqKv = true;

    private totalQueries = 0;
    private maxValue = 0;

    public processEvent(evt: ParsedEvent, engine: SimulationEngine) {
        const store = useMaelstromStore.getState();

        if (
            evt.type === "read_ok" &&
            evt.src.startsWith("n") &&
            evt.value !== undefined
        ) {
            engine.nodeValues.set(evt.src, evt.value);
            this.maxValue = Math.max(this.maxValue, evt.value);
            this.totalQueries++;
        }

        const counts = this.workers.map((n) => engine.nodeValues.get(n) || 0);
        const maxCount = Math.max(...counts, 1);
        const minCount = Math.min(...counts);

        store.updateMetrics({
            convergence: Math.round((minCount / maxCount) * 100),
            totalOps: store.totalOps + 1,
            totalMessages: this.totalQueries,
        });
    }

    public getNodeValue(nodeId: string, engine: SimulationEngine) {
        return engine.nodeValues.get(nodeId) || 0;
    }

    public getDisplayString(nodeId: string, engine: SimulationEngine) {
        if (nodeId === "seq-kv") return null;
        return String(this.getNodeValue(nodeId, engine));
    }

    public getNodeColor(nodeId: string, engine: SimulationEngine) {
        const val = this.getNodeValue(nodeId, engine);
        if (val === 0) return COLORS.INFO;
        if (val >= this.maxValue) return COLORS.SUCCESS;
        if (val >= this.maxValue - 5) return COLORS.WARNING;
        return COLORS.ERROR;
    }
}
