# Network Log Migration

## Goal

The visualizer previously replayed Jepsen's `history.txt`/EDN representation. That history describes client operations and nemesis actions, but it does not contain the physical messages exchanged by workers or Maelstrom services.

The visualizer now replays an exported form of Maelstrom's network journal. This adds client-to-node, node-to-node, and node-to-service traffic while preserving the existing React, Zustand, D3, and canvas architecture.

## Source Format

Maelstrom writes the authoritative network trace to `store/<run>/net-journal/*.fressian`. The journal is striped across files and each record contains:

- A globally ordered event ID
- A nanosecond timestamp
- A `send` or `recv` operation
- Maelstrom's internal message ID
- Source and destination IDs
- The complete message body

The browser does not decode Fressian. `scripts/export-maelstrom.clj` runs with the Clojure and Fressian implementation already bundled in `maelstrom.jar`, reads every stripe, sorts records by event ID, and emits JSON under `visualizer/public/logs/`.

No `--log-net-send` or `--log-net-recv` flags are required. Those flags only duplicate journal events into `jepsen.log`.

## Exported Schema

The JSON document has a version, source duration, discovered topology, and events. Physical messages use this shape:

```json
{
    "kind": "message",
    "messageId": 42,
    "sentAt": 120.5,
    "receivedAt": 221.1,
    "delivered": true,
    "src": "n0",
    "dest": "n1",
    "originalSrc": "n0",
    "originalDest": "n1",
    "type": "mailbox_batch_gossip",
    "body": {}
}
```

Times are milliseconds relative to the first exported event. A message is represented once: the exporter pairs its `send` and `recv` records using Maelstrom's internal message ID. A send with no receive is retained with `delivered: false`, allowing the canvas to show traffic dropped by a partition without drawing delivered traffic twice.

Initialization and topology RPCs are removed from playback and retained as topology metadata. Maelstrom's many internal client processes are normalized to one visual client per destination worker; `originalSrc` and `originalDest` preserve the actual endpoints.

Partition and crash events come from `history.edn`, because they are control operations rather than network messages. The exporter aligns Jepsen's relative clock with the journal clock and merges these controls into the event stream.

## Frontend Decisions

`parser.ts` supports the new JSON format and keeps an EDN fallback for existing or user-supplied fixtures. Existing challenge strategies still receive `ParsedEvent`; message body fields are projected onto the fields they already use.

Topology is data-driven for JSON logs. Worker nodes, services such as `lin-kv` and `seq-kv`, and broadcast links are discovered by the exporter. Legacy EDN logs continue to use each strategy's existing topology.

Packet colors only use roles from `visualizer/src/lib/colors.ts`, which carries the project's Catppuccin Mocha palette:

- Client/default requests: secondary
- Peer gossip: primary
- Service requests: accent
- Successful responses: success
- CAS operations: warning
- Undelivered messages and failures: error

Broadcast convergence now consumes delivered `mailbox_batch_gossip` envelopes, rather than inferring propagation solely from later client reads. Kafka's bundled fixture runs challenge 5c with nine workers. It demonstrates hash-based ownership and scatter-gather traffic directly between nodes and intentionally contains no `lin-kv` service.

## Playback And Performance

Playback uses one `requestAnimationFrame` scheduler instead of one `setInterval` callback per event. Each frame drains every event whose source timestamp is due. This avoids browser timer clamping and supports bursts of hundreds of messages per second.

The default replay duration is 45 seconds at speed 1. Changing playback speed rescales it, so speed 2 completes in roughly 22.5 seconds. Before scaling, inter-event gaps are capped at 250 ms; this compresses Maelstrom's 8-10 second recovery and analysis pauses to roughly 2-3 seconds while preserving timing within active message bursts. The displayed timeline uses this compressed replay clock rather than event count. Pausing resumes from the exact processed event index and displayed time. Completion atomically publishes the final cursor, pending logs, and throttled metrics so the timeline and convergence state cannot stop one batch short.

Canvas simulation state remains outside React. Zustand receives playback progress, log rows, and metrics at most every 100 ms. The visible log is capped at 100 rows. Packet shadows are disabled automatically when at least 200 packets are active, reducing expensive canvas blur work during bursts.

Broadcast workers use weak topology-link forces plus positional forces toward evenly spaced points on a ring. This keeps the real topology visible without allowing an irregular grid to collapse or bunch the node layout.

The bundled fixtures contain roughly 100-1,600 events each and are below 500 KB individually. The same frame-batched path also supports substantially larger stress-test journals; display density, rather than event dispatch, becomes the practical limit.

## Regenerating Logs

Export the most recent Maelstrom run for one visualizer challenge:

```bash
just export-log broadcast
```

Export another run directory explicitly:

```bash
just export-log broadcast store/broadcast/<timestamp>
```

Generate and export all bundled fixtures:

```bash
just gen-logs
```

The challenge argument determines the output filename. The run itself must use the matching workload and binary challenge.

## Files

New source files:

- `scripts/export-maelstrom.clj`
- `visualizer/src/lib/playbackScheduler.ts`
- `MIGRATION.md`

Modified runtime files:

- `visualizer/src/lib/parser.ts`
- `visualizer/src/lib/store.ts`
- `visualizer/src/lib/simulationEngine.ts`
- `visualizer/src/components/MaelstromCanvas.tsx`
- `visualizer/src/components/SidebarLeft.tsx`
- `visualizer/src/lib/strategies/broadcast.ts`
- `visualizer/src/lib/strategies/kafkaLog.ts`
- `justfile`

Generated JSON fixtures coexist with the old EDN files. The store requests JSON first and falls back to EDN, so custom legacy logs continue to work during the migration.
