import { COLORS } from "../colors";
import type { ParsedEvent } from "../parser";
import type { SimulationEngine } from "../simulationEngine";
import { useMaelstromStore } from "../store";
import type { ChallengeStrategy } from ".";

export class EchoStrategy implements ChallengeStrategy {
    public id = "echo";
    public workers = ["n0"];
    public hasSeqKv = false;

    private totalMessages = 0;

    public processEvent(evt: ParsedEvent, engine: SimulationEngine) {
        const store = useMaelstromStore.getState();

        if (evt.type === "echo_ok") {
            engine.nodeValues.set("n0", this.totalMessages);
            this.totalMessages++;
        }

        store.updateMetrics({
            totalMessages: this.totalMessages,
            convergence: 100,
            totalOps: store.totalOps + 1,
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
