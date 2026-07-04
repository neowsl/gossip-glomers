import { COLORS } from "../colors";
import type { ParsedEvent } from "../parser";
import type { SimulationEngine } from "../simulationEngine";
import { useMaelstromStore } from "../store";
import type { ChallengeStrategy } from ".";

export class KafkaLogStrategy implements ChallengeStrategy {
    public id = "kafka-log";
    public workers = ["n0", "n1", "n2", "n3", "n4", "n5"];
    public service = "lin-kv";

    private totalSends = 0;
    private totalPolls = 0;

    public processEvent(evt: ParsedEvent, engine: SimulationEngine) {
        const store = useMaelstromStore.getState();

        if (evt.type === "send" && evt.src.startsWith("n")) {
            const current = engine.nodeValues.get(evt.src) || 0;
            engine.nodeValues.set(evt.src, current + 1);
            this.totalSends++;
        }

        if (evt.type === "poll" && evt.src.startsWith("n")) {
            const current = engine.nodeValues.get(evt.src) || 0;
            engine.nodeValues.set(evt.src, current + 1);
            this.totalPolls++;
        }

        store.updateMetrics({
            convergence: 100,
            totalMessages: this.totalSends + this.totalPolls,
        });
    }

    public getNodeValue(nodeId: string, engine: SimulationEngine) {
        return engine.nodeValues.get(nodeId) || 0;
    }

    public getDisplayString(nodeId: string, engine: SimulationEngine) {
        if (nodeId === "lin-kv") return null;
        return this.getNodeValue(nodeId, engine).toString();
    }

    public getNodeColor(nodeId: string, engine: SimulationEngine) {
        const val = this.getNodeValue(nodeId, engine);
        return val > 0 ? COLORS.SUCCESS : COLORS.INFO;
    }
}
