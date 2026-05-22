import { COLORS } from "../colors";
import type { ParsedEvent } from "../parser";
import type { SimulationEngine } from "../simulationEngine";
import { useMaelstromStore } from "../store";
import type { ChallengeStrategy } from ".";

export class UniqueIdsStrategy implements ChallengeStrategy {
    public id = "unique-id";
    public workers = ["n0", "n1", "n2"];
    public hasSeqKv = false;

    private totalIds = 0;

    public processEvent(evt: ParsedEvent, engine: SimulationEngine) {
        const store = useMaelstromStore.getState();

        if (evt.type === "generate_ok" && evt.src.startsWith("n")) {
            const current = engine.nodeValues.get(evt.src) || 0;
            engine.nodeValues.set(evt.src, current + 1);
            this.totalIds++;
        }

        const counts = this.workers.map((n) => engine.nodeValues.get(n) || 0);
        const totalMinted = counts.reduce((sum, val) => sum + val, 0);

        store.updateMetrics({
            convergence: 100,
            totalOps: totalMinted,
            totalMessages: this.totalIds,
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
        return val > 0 ? COLORS.SUCCESS : COLORS.INFO;
    }
}
