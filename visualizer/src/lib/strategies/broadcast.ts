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

    private totalBroadcasts = 0;

    public processEvent(evt: ParsedEvent, engine: SimulationEngine) {
        const store = useMaelstromStore.getState();

        if (evt.type === "broadcast" && evt.message !== undefined) {
            this.totalBroadcasts++;
            if (evt.dest.startsWith("n")) {
                const messages =
                    engine.nodeMessageSets.get(evt.dest) ?? new Set();
                messages.add(evt.message);
                engine.nodeMessageSets.set(evt.dest, messages);
                engine.nodeValues.set(evt.dest, messages.size);
            }
        }

        if (
            evt.type === "mailbox_batch_gossip" &&
            evt.delivered !== false &&
            evt.dest.startsWith("n")
        ) {
            const envelopes = Array.isArray(evt.body?.envelopes)
                ? evt.body.envelopes
                : [];
            const messages = engine.nodeMessageSets.get(evt.dest) ?? new Set();
            for (const envelope of envelopes) {
                if (
                    typeof envelope === "object" &&
                    envelope !== null &&
                    "content" in envelope &&
                    typeof envelope.content === "number"
                ) {
                    messages.add(envelope.content);
                }
            }
            engine.nodeMessageSets.set(evt.dest, messages);
            engine.nodeValues.set(evt.dest, messages.size);
        }

        if (
            evt.type === "read_ok" &&
            evt.src.startsWith("n") &&
            evt.value !== undefined
        ) {
            engine.nodeValues.set(evt.src, evt.value);
        }

        const counts = this.workers.map((n) => engine.nodeValues.get(n) || 0);
        const minCount = Math.min(...counts);

        store.updateMetrics({
            convergence:
                this.totalBroadcasts === 0
                    ? 100
                    : Math.round((minCount / this.totalBroadcasts) * 100),
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
