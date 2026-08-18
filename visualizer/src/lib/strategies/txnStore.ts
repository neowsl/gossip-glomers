import { COLORS } from "../colors";
import type { ParsedEvent } from "../parser";
import type { SimulationEngine } from "../simulationEngine";
import { useMaelstromStore } from "../store";
import type { ChallengeStrategy } from ".";

interface VersionedValue {
    value: number;
    snowflake: number;
}

type StoreState = Map<number, VersionedValue>;

const isWrite = (op: unknown): op is [string, number, number] =>
    Array.isArray(op) &&
    op.length === 3 &&
    op[0] === "w" &&
    typeof op[1] === "number" &&
    typeof op[2] === "number";

interface Envelope {
    snowflake?: unknown;
    content?: unknown;
}

export class TxnStoreStrategy implements ChallengeStrategy {
    public id = "txn-store";
    public workers = ["n0", "n1", "n2", "n3"];

    private nodeStores = new Map<string, StoreState>();
    private totalTxns = 0;

    private getStore(nodeId: string): StoreState {
        let store = this.nodeStores.get(nodeId);
        if (store === undefined) {
            store = new Map<number, VersionedValue>();
            this.nodeStores.set(nodeId, store);
        }
        return store;
    }

    private apply(
        store: StoreState,
        key: number,
        value: number,
        snowflake: number,
    ) {
        const current = store.get(key);
        if (current === undefined || snowflake > current.snowflake) {
            store.set(key, { value, snowflake });
        }
    }

    public processEvent(evt: ParsedEvent, engine: SimulationEngine) {
        const store = useMaelstromStore.getState();

        if (
            evt.type === "txn" &&
            evt.src.startsWith("c") &&
            evt.dest.startsWith("n")
        ) {
            this.totalTxns++;
        }

        if (
            evt.type === "txn_ok" &&
            evt.src.startsWith("n") &&
            evt.dest.startsWith("c")
        ) {
            const ops = Array.isArray(evt.body?.txn) ? evt.body.txn : [];
            let wrote = false;
            for (const op of ops) {
                if (!isWrite(op)) continue;
                this.apply(
                    this.getStore(evt.src),
                    op[1],
                    op[2],
                    evt.id + 1,
                );
                wrote = true;
            }
            if (wrote) {
                engine.spawnBurst(evt.src, COLORS.SUCCESS, 32);
            }
        }

        if (
            evt.type === "mailbox_batch_gossip" &&
            evt.delivered !== false &&
            evt.dest.startsWith("n")
        ) {
            const envelopes = Array.isArray(evt.body?.envelopes)
                ? (evt.body.envelopes as Envelope[])
                : [];
            const storeState = this.getStore(evt.dest);
            for (const envelope of envelopes) {
                const snowflake = Number(envelope.snowflake);
                if (!Number.isFinite(snowflake)) continue;
                const content = Array.isArray(envelope.content)
                    ? envelope.content
                    : [];
                for (const op of content) {
                    if (!isWrite(op)) continue;
                    this.apply(storeState, op[1], op[2], snowflake);
                }
            }
        }

        const convergence = this.computeConvergence();
        for (const node of this.workers) {
            engine.nodeValues.set(node, this.getStore(node).size);
        }
        store.updateMetrics({ convergence, totalMessages: this.totalTxns });
    }

    private computeConvergence() {
        const keys = new Set<number>();
        for (const store of this.nodeStores.values()) {
            for (const key of store.keys()) keys.add(key);
        }
        if (keys.size === 0) return 100;

        let agreement = 0;
        for (const key of keys) {
            let highest = -Infinity;
            let latestValue: number | undefined;
            for (const node of this.workers) {
                const entry = this.getStore(node).get(key);
                if (entry !== undefined && entry.snowflake > highest) {
                    highest = entry.snowflake;
                    latestValue = entry.value;
                }
            }
            for (const node of this.workers) {
                const entry = this.getStore(node).get(key);
                if (entry !== undefined && entry.value === latestValue) {
                    agreement++;
                }
            }
        }
        return Math.round(
            (agreement / (keys.size * this.workers.length)) * 100,
        );
    }

    public getNodeValue(nodeId: string, engine: SimulationEngine) {
        return engine.nodeValues.get(nodeId) || 0;
    }

    public getDisplayString(nodeId: string, engine: SimulationEngine) {
        return this.getNodeValue(nodeId, engine).toString();
    }

    public getNodeColor(nodeId: string, engine: SimulationEngine) {
        if (this.getNodeValue(nodeId, engine) === 0) return COLORS.INFO;
        if (!this.holdsLatest(nodeId)) return COLORS.WARNING;
        return COLORS.SUCCESS;
    }

    private holdsLatest(nodeId: string) {
        const store = this.getStore(nodeId);
        if (store.size === 0) return false;
        for (const key of store.keys()) {
            let highest = -Infinity;
            let latestValue: number | undefined;
            for (const other of this.nodeStores.values()) {
                const entry = other.get(key);
                if (entry !== undefined && entry.snowflake > highest) {
                    highest = entry.snowflake;
                    latestValue = entry.value;
                }
            }
            if (store.get(key)!.value !== latestValue) return false;
        }
        return true;
    }
}