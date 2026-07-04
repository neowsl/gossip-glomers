# Maelstrom Matrix: Distributed Systems Challenge (Maelstrom/Jepsen)

A self-directed exploration into distributed systems engineering, fault tolerance, and network consistency models using the Fly.io distributed systems test suite. Implemented a custom node architecture in Go capable of handling network partitions, arbitrary latencies, and state reconciliation.

👉 **[Read More About the Gossip Glomers Challenges](https://fly.io/blog/gossip-glomers)**

## Key Architecture & Core Challenges

### 1. Unique ID Generation (Snowflake Architecture)
- **Implementation:** Developed a high-throughput, bit-packed unique ID generator mimicking Twitter's Snowflake layout (41-bit timestamp, 10-bit node ID, 12-bit sequential counter).
- **Concurrency & Correctness:** Utilized thread-safe mutex structures to protect the sequence counter. Implemented a temporal guard to completely prevent duplicate ID emission during system clock-skews or backwards NTP time jumps.

### 2. Fault-Tolerant, High-Performance Broadcast
- **Idempotence Engine:** Engineered an idempotent networking layer using a message deduplication map, allowing the system to safely handle duplicate message delivery without state corruption.
- **Network Resilience:** Faced with the *Two Generals' Problem* during network partitions, implemented a robust messaging topology utilizing buffered Go channels as concurrency-safe, per-neighbor outgoing queues.
- **Performance Optimization:** Refactored the gossip protocol from single-message dispatches to multi-message batching. Implemented an **Exponential Backoff with Jitter** scheme, mitigating the *thundering herd problem* upon network partition healing.
- **Metrics Achieved:** 
  - **Messages-Per-Operation:** 8.63
  - **Median Latency:** 890ms
  - **Maximum Latency:** 1503ms

### 3. State-Based CRDT Grow-Only Counter (G-Counter)
- **Consistency Challenge:** Navigated the loose boundaries of a **Sequentially Consistent** storage tier (`seq-kv`), where standard read-modify-write loops suffer from extreme write-contention and stale-read overwrites.
- **Architectural Shifts Explored:**
  - **Causal Barrier Exploitation:** Leveraged sequential consistency properties by executing a unique-write token barrier to force the storage engine's replication pipeline forward before evaluation reads.
  - **Sharded Vector Counter:** Eliminated runtime network contention and `CompareAndSwap` retry overhead entirely by decoupling the global key into per-node shards. Shifted the authoritative state to localized in-memory tracking, allowing nodes to write deterministically to exclusive namespaces while aggregating global state asynchronously.

### Distributed, Replicated Kafka-Style Log

- **Decoupled Architecture:** Utilized Go's structural typing to implement a pluggable `LogStore` interface. Leveraged dependency injection to cleanly switch backends between single-node memory and multi-node distributed storage via command-line flags.
- **Immutable Log Semantics:** Modeled storage around the distributed log ledger paradigm instead of transient message queues. Treated offset commits as non-destructive consumer bookmarks rather than deletion triggers, ensuring independent consumers can safely poll historic data sequences.
- **Linearizable Optimistic Concurrency:** Orchestrated multi-node appends using a **Linearizable** storage engine (`lin-kv`) to completely prevent split-brain offset collisions.

---

## Architectural Deep Dive & Engineering Log

If you want to see the unedited, step-by-step engineering journey behind this project—including the raw implementation bottlenecks, concurrency failures, and how I broke down complex consistency models, check out the complete development log:

👉 **[Read the Deep-Dive Engineering Journal (JOURNAL.md)](./JOURNAL.md)**
