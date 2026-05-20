// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParsedEvent {
    id: number;
    src: string;
    dest: string;
    type: string;
    value?: number;
    delta?: number;
    nemesis?: string;
    partitionGroups?: string[][];
    echo?: string;
    message?: number;
    generateId?: string;
    tsBits?: string;
    nodeBits?: string;
    seqBits?: string;
    time: number;
    raw: string;
}

export interface Metrics {
    totalOps: number;
    networkHealth: number;
    consensusDelta: number;
    eventCount: number;
}

export type NodeId = "n0" | "n1" | "n2" | "n3" | "n4" | "seq-kv";

// Helper to generate node lists on the fly if needed
export function generateWorkerNodes(numNodes: number): string[] {
    return Array.from({ length: numNodes }, (_, i) => `n${i}`);
}

// const MAX_EVENTS = 400;

// ── Public entry point ────────────────────────────────────────────────────────

export function parseEvents(rawText: string): ParsedEvent[] {
    const lines = rawText.split("\n").filter((l) => l.trim());
    if (isJepsenFormat(lines)) return parseJepsenEvents(lines);
    return parseJsonLines(lines);
}

// ── Format detection ──────────────────────────────────────────────────────────

function isJepsenFormat(lines: string[]): boolean {
    const first = lines.find(
        (l) => l.trim() && !l.startsWith("#") && !l.startsWith("//"),
    );
    return first ? /^(\d+|:nemesis)\t/.test(first) : false;
}

// ── JSON / EDN fallback ───────────────────────────────────────────────────────

function parseJsonLines(lines: string[]): ParsedEvent[] {
    const events: ParsedEvent[] = [];
    let id = 0;
    for (const line of lines) {
        const t = line.trim();
        if (!t || t.startsWith("//") || t.startsWith("#")) continue;
        try {
            const obj = JSON.parse(t);
            events.push({ id: id++, time: id * 100, raw: t, ...obj });
        } catch {
            const converted = convertEdnLine(t, id++);
            if (converted) events.push(converted);
        }
        // if (events.length >= MAX_EVENTS) break;
    }
    return events;
}

export function convertEdnLine(line: string, id: number): ParsedEvent | null {
    const src =
        line.match(/:src\s+"([^"]+)"/)?.[1] ?? line.match(/:src\s+(\S+)/)?.[1];
    const dest =
        line.match(/:dest\s+"([^"]+)"/)?.[1] ??
        line.match(/:dest\s+(\S+)/)?.[1];
    const type =
        line.match(/:type\s+:(\S+)/)?.[1] ??
        line.match(/:type\s+"([^"]+)"/)?.[1];
    const value = line.match(/:value\s+(\d+)/)?.[1];
    const delta = line.match(/:delta\s+(\d+)/)?.[1];
    const echo = line.match(/:echo\s+"([^"]+)"/)?.[1];
    const message = line.match(/:message\s+(\d+)/)?.[1];
    const genId = line.match(/:id\s+(\d+)/)?.[1];
    if (!src || !dest || !type) return null;
    return {
        id,
        src,
        dest,
        type,
        value: value !== undefined ? parseInt(value, 10) : undefined,
        delta: delta !== undefined ? parseInt(delta, 10) : undefined,
        message: message !== undefined ? parseInt(message, 10) : undefined,
        generateId: genId,
        echo,
        time: id * 100,
        raw: line,
    };
}

// ── Jepsen history parser ─────────────────────────────────────────────────────

function parseJepsenEvents(lines: string[]): ParsedEvent[] {
    const processIds = new Set<number>();
    const nemesisNodeNames = new Set<string>();

    for (const line of lines) {
        const tab = line.indexOf("\t");
        if (tab < 0) continue;
        const first = line.slice(0, tab).trim();
        if (/^\d+$/.test(first)) {
            processIds.add(parseInt(first, 10));
        } else if (first === ":nemesis") {
            for (const m of line.matchAll(/"(n\d+)"/g))
                nemesisNodeNames.add(m[1]);
        }
    }

    const numNodes = Math.max(processIds.size, 1);

    const sortedNemesisNodes = [...nemesisNodeNames].sort(
        (a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)),
    );

    const events: ParsedEvent[] = [];
    let id = 0;
    for (const line of lines) {
        const evt = parseJepsenLine(line, id, numNodes, sortedNemesisNodes);
        if (evt) {
            events.push(evt);
            id++;
        }
    }
    return events;
}

// Sample `budget` lines from `lines`, always including nemesis rows, rest evenly
function sampleLines(lines: string[], budget: number): string[] {
    if (lines.length <= budget) return lines;

    const nemesisIdx = new Set<number>();
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith(":nemesis")) nemesisIdx.add(i);
    }

    const included = new Set<number>(nemesisIdx);
    const remaining = budget - included.size;

    if (remaining > 0) {
        const step = (lines.length - 1) / Math.max(remaining, 1);
        for (let j = 0; j < remaining; j++) {
            const idx = Math.min(Math.round(j * step), lines.length - 1);
            included.add(idx);
        }
    }

    return [...included].sort((a, b) => a - b).map((i) => lines[i]);
}

function parseJepsenLine(
    line: string,
    id: number,
    numNodes: number,
    sortedNemesisNodes: string[],
): ParsedEvent | null {
    const parts = line.split("\t");
    if (parts.length < 3) return null;

    const processStr = parts[0].trim();
    const opType = parts[1].trim();
    const fn = parts[2].trim().replace(/^:/, "");
    const value = parts.slice(3).join("\t").trim();
    const time = id * 80;

    // ── Nemesis ──────────────────────────────────────────────────────────────────
    if (processStr === ":nemesis") {
        if (opType !== ":info") return null;
        if (fn === "start-partition") {
            const groups = parsePartitionGroups(
                value,
                numNodes,
                sortedNemesisNodes,
            );
            return {
                id,
                src: "nemesis",
                dest: "nemesis",
                type: "nemesis",
                nemesis: "start-partition",
                partitionGroups: groups,
                time,
                raw: line,
            };
        }
        if (fn === "stop-partition") {
            return {
                id,
                src: "nemesis",
                dest: "nemesis",
                type: "nemesis",
                nemesis: "stop-partition",
                partitionGroups: [],
                time,
                raw: line,
            };
        }
        return null;
    }

    // ── Regular operation ─────────────────────────────────────────────────────────
    const processId = parseInt(processStr, 10);
    if (isNaN(processId)) return null;

    const nodeIdx = processId % numNodes;
    const nodeId = `n${nodeIdx}`;
    const clientId = `c${processId}`;

    const isInvoke = opType === ":invoke";
    const isOk = opType === ":ok";
    if (!isInvoke && !isOk) return null;

    const src = isInvoke ? clientId : nodeId;
    const dest = isInvoke ? nodeId : clientId;

    switch (fn) {
        case "echo": {
            if (isInvoke) {
                const echo = value.replace(/^"|"$/g, "");
                return { id, src, dest, type: "echo", echo, time, raw: line };
            } else {
                const m = value.match(/:echo\s+"([^"]+)"/);
                const echo = m?.[1] ?? value.replace(/^"|"$/g, "");
                return {
                    id,
                    src,
                    dest,
                    type: "echo_ok",
                    echo,
                    time,
                    raw: line,
                };
            }
        }

        case "generate": {
            if (isInvoke) {
                return { id, src, dest, type: "generate", time, raw: line };
            } else {
                const numId = parseFloat(value.trim());
                const tsBits = isNaN(numId)
                    ? "?"
                    : String(Math.floor(numId / 4194304));
                const seqBits = isNaN(numId)
                    ? "?"
                    : String(Math.floor(numId) % 4096);
                const nodeBits = String(nodeIdx).padStart(3, "0");
                return {
                    id,
                    src,
                    dest,
                    type: "generate_ok",
                    generateId: value.trim(),
                    tsBits,
                    nodeBits,
                    seqBits,
                    time,
                    raw: line,
                };
            }
        }

        case "broadcast": {
            if (isInvoke) {
                const msg = parseInt(value, 10);
                return {
                    id,
                    src,
                    dest,
                    type: "broadcast",
                    message: isNaN(msg) ? undefined : msg,
                    time,
                    raw: line,
                };
            } else {
                return { id, src, dest, type: "broadcast_ok", time, raw: line };
            }
        }

        case "read": {
            if (isInvoke) {
                return { id, src, dest, type: "read", time, raw: line };
            } else {
                // broadcast: value is EDN vector  [0 3 1]
                if (value.startsWith("[")) {
                    const msgs = value
                        .slice(1, -1)
                        .trim()
                        .split(/\s+/)
                        .filter(Boolean)
                        .map(Number)
                        .filter((n) => !isNaN(n));
                    return {
                        id,
                        src,
                        dest,
                        type: "read_ok",
                        value: msgs.length,
                        time,
                        raw: line,
                    };
                }
                // g-counter: value is an integer
                const numVal = parseFloat(value);
                return {
                    id,
                    src,
                    dest,
                    type: "read_ok",
                    value: isNaN(numVal) ? 0 : numVal,
                    time,
                    raw: line,
                };
            }
        }

        case "add": {
            if (isInvoke) {
                const delta = parseInt(value, 10);
                return {
                    id,
                    src,
                    dest,
                    type: "add",
                    delta: isNaN(delta) ? 0 : delta,
                    time,
                    raw: line,
                };
            } else {
                return { id, src, dest, type: "add_ok", time, raw: line };
            }
        }

        default:
            return null;
    }
}

// ── Partition group parsing ───────────────────────────────────────────────────

function parsePartitionGroups(
    value: string,
    numNodes: number,
    sortedNemesisNodes: string[],
): string[][] {
    const defaultSplit = (): string[][] => {
        const half = Math.ceil(numNodes / 2);
        return [
            Array.from({ length: half }, (_, i) => `n${i}`),
            Array.from({ length: numNodes - half }, (_, i) => `n${half + i}`),
        ];
    };

    if (!value || value === "nil") return defaultSplit();
    // Simple qualitative labels → default split
    if (!value.includes('"n')) return defaultSplit();

    const allMentioned = [
        ...new Set([...value.matchAll(/"(n\d+)"/g)].map((m) => m[1])),
    ].sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));

    if (allMentioned.length === 0) return defaultSplit();

    // Stable visual index map built from all nemesis nodes seen in the file
    const indexMap =
        sortedNemesisNodes.length > 0 ? sortedNemesisNodes : allMentioned;
    const remap = (n: string) => {
        const i = indexMap.indexOf(n);
        return i >= 0 ? `n${i}` : n;
    };

    // Parse first isolation entry: "n<X>" #{node…}
    const isoMatch = value.match(/"(n\d+)"\s+#\{([^}]+)\}/);
    if (!isoMatch) return defaultSplit();

    const isolatedSet = new Set(
        [...isoMatch[2].matchAll(/"(n\d+)"/g)].map((m) => m[1]),
    );

    const groupA = allMentioned.filter((n) => !isolatedSet.has(n));
    const groupB = allMentioned.filter((n) => isolatedSet.has(n));

    if (groupA.length === 0 || groupB.length === 0) return defaultSplit();

    return [groupA.map(remap), groupB.map(remap)];
}

// ── G-Counter metrics ─────────────────────────────────────────────────────────

export function computeGCounterMetrics(
    upTo: number,
    events: ParsedEvent[],
    nodeValues: Record<string, number>,
    isPartitioned: boolean,
    numNodes: number, // Pass the cluster size discovered during parsing
): Metrics {
    const ops = events
        .slice(0, upTo + 1)
        .filter((e) =>
            ["add", "add_ok", "read", "read_ok"].includes(e.type),
        ).length;

    // Dynamically generate the worker node keys to check against state map
    const activeWorkerNodes = Array.from(
        { length: numNodes },
        (_, i) => `n${i}`,
    );

    const vals = activeWorkerNodes.map((n) => nodeValues[n] ?? 0);
    const maxV = vals.length > 0 ? Math.max(...vals) : 0;
    const minV = vals.length > 0 ? Math.min(...vals) : 0;
    const delta = maxV - minV;

    // Scale health metrics relative to the current divergence profile
    const health = isPartitioned ? 0 : Math.max(0, 100 - delta * 3);

    return {
        totalOps: ops,
        networkHealth: Math.round(health),
        consensusDelta: delta,
        eventCount: upTo + 1,
    };
}
