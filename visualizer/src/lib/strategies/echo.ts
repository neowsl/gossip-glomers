import { COLORS } from "../colors";
import type { ParsedEvent } from "../parser";
import type { SimulationEngine } from "../simulationEngine";
import { useMaelstromStore } from "../store";
import type { ChallengeStrategy } from ".";

export class EchoStrategy implements ChallengeStrategy {
    id = "echo";
    workers = ["n0"];
    hasSeqKv = false;

    private totalMessages = 0;

    processEvent(evt: ParsedEvent, engine: SimulationEngine) {
        const store = useMaelstromStore.getState();

        if (engine.nodeValues.size === 0) {
            this.totalMessages = 0;
        }

        if (evt.type === "echo_ok") {
            this.totalMessages++;
            engine.nodeValues.set("n0", this.totalMessages);
        }

        store.updateMetrics({
            totalMessages: this.totalMessages,
            convergence: 100,
            totalOps: store.totalOps + 1,
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
        return val > 0 ? COLORS.SUCCESS : COLORS.INFO;
    }
}
