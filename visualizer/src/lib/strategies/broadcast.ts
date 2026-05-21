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
            this.workers.forEach((w) => engine.nodeValues.set(w, 0));
        }

        // 1. Track Total Global Messages (The Ceiling)
        // If a client broadcasts a new message to any node, increment the global ceiling
        if (evt.type === "broadcast" && evt.message !== undefined) {
            this.totalBroadcastsReceived++;
            // The receiving node instantly knows about this message
            if (evt.dest.startsWith("n")) {
                const current = engine.nodeValues.get(evt.dest) || 0;
                engine.nodeValues.set(
                    evt.dest,
                    Math.max(current, this.totalBroadcastsReceived),
                );
            }
        }

        // 2. The Illusion of Gossip (The Catch-up)
        // Since we can't see the gossip wire, we wait for a node to respond to a client read.
        // The parser passes the array length as `evt.value`. We forcefully update the node's state to match.
        if (
            evt.type === "read_ok" &&
            evt.src.startsWith("n") &&
            evt.value !== undefined
        ) {
            const currentKnown = engine.nodeValues.get(evt.src) || 0;
            // Never let the count go backwards
            engine.nodeValues.set(evt.src, Math.max(currentKnown, evt.value));
        }

        // 3. Compute Metrics
        const counts = this.workers.map((n) => engine.nodeValues.get(n) || 0);
        const maxCount = Math.max(...counts, 1);
        const minCount = Math.min(...counts);

        store.updateMetrics({
            convergence: engine.isPartitioned
                ? 0
                : Math.round((minCount / maxCount) * 100),
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
        if (this.totalBroadcastsReceived === 0) return "#00f3ff";
        if (val >= this.totalBroadcastsReceived) return "#00ff9d";
        return "#ffb800";
    }
}
