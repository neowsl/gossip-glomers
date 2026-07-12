export interface BaseEvent {
    id: number;
    src: string;
    dest: string;
    time: number;
    raw: string;
}

export interface NemesisEvent extends BaseEvent {
    type: "nemesis";
    nemesis: "start-partition" | "stop-partition";
    partitionGroups: string[][];
}

export interface EchoEvent extends BaseEvent {
    type: "echo" | "echo_ok";
    echo: string;
}

export interface UniqueIdEvent extends BaseEvent {
    type: "generate" | "generate_ok";
    generateId?: string;
    tsBits?: string;
    nodeBits?: string;
    seqBits?: string;
}

export interface BroadcastEvent extends BaseEvent {
    type: "broadcast" | "broadcast_ok" | "read" | "read_ok" | "gossip";
    message?: number;
    value?: number;
    messages?: number[];
}

export interface GCounterEvent extends BaseEvent {
    type: "add" | "add_ok" | "read" | "read_ok" | "write" | "gossip";
    delta?: number;
    value?: number;
}

export interface KafkaLogEvent extends BaseEvent {
    type:
        | "send"
        | "send_ok"
        | "poll"
        | "poll_ok"
        | "assign"
        | "assign_ok"
        | "crash";
}

export type ParsedEvent =
    | NemesisEvent
    | EchoEvent
    | UniqueIdEvent
    | BroadcastEvent
    | GCounterEvent
    | KafkaLogEvent;

export const parseEvents = (rawText: string) => {
    const lines = rawText.split("\n");

    const { numNodes, nemesisNodes } = analyzeJepsenTopology(lines);
    const events: ParsedEvent[] = [];
    let id = 0;

    for (const line of lines) {
        if (!line.includes("\t")) continue;

        const evt = parseJepsenLine(line, id, numNodes, nemesisNodes);
        if (evt) {
            events.push(evt);
            id++;
        }
    }
    return events;
};

const analyzeJepsenTopology = (lines: string[]) => {
    const processIds = new Set<number>();
    const nemesisNodes = new Set<string>();

    for (const line of lines) {
        const firstToken = line.slice(0, line.indexOf("\t")).trim();
        if (/^\d+$/.test(firstToken)) {
            processIds.add(parseInt(firstToken, 10));
            continue;
        }
        if (firstToken === ":nemesis") {
            for (const m of line.matchAll(/"(n\d+)"/g)) {
                nemesisNodes.add(m[1]);
            }
        }
    }

    return {
        numNodes: Math.max(processIds.size, 1),
        nemesisNodes: [...nemesisNodes].sort(
            (a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10),
        ),
    };
};

const parseJepsenLine = (
    line: string,
    id: number,
    numNodes: number,
    nemesisNodes: string[],
): ParsedEvent | null => {
    const parts = line.split("\t").map((p) => p.trim());
    if (parts.length < 3) return null;

    const [processStr, opType, rawFn, ...valueParts] = parts;
    const fn = rawFn.replace(/^:/, "");
    const value = valueParts.join("\t").trim();
    const time = id * 80;

    // handle nemesis events
    if (processStr === ":nemesis") {
        if (opType !== ":info") return null;
        return parseNemesisAction(
            fn,
            value,
            numNodes,
            nemesisNodes,
            id,
            time,
            line,
        );
    }

    // handle standard node events
    const processId = parseInt(processStr, 10);
    if (Number.isNaN(processId)) return null;

    const isInvoke = opType === ":invoke";
    const isOk = opType === ":ok";
    const isInfo = opType === ":info";

    if (!isInvoke && !isOk && !isInfo) return null;

    const nodeId = `n${processId % numNodes}`;
    const clientId = `c${processId}`;

    const src = isInvoke ? clientId : nodeId;
    const dest = isInvoke ? nodeId : clientId;

    return mapJepsenFunctionToEvent(fn, isInvoke, value, {
        id,
        src,
        dest,
        time,
        raw: line,
    });
};

const parseNemesisAction = (
    fn: string,
    value: string,
    numNodes: number,
    nemesisNodes: string[],
    id: number,
    time: number,
    raw: string,
): ParsedEvent | null => {
    if (fn === "stop-partition")
        return {
            id,
            src: "nemesis",
            dest: "nemesis",
            type: "nemesis",
            nemesis: "stop-partition",
            partitionGroups: [],
            time,
            raw,
        };

    if (fn === "start-partition")
        return {
            id,
            src: "nemesis",
            dest: "nemesis",
            type: "nemesis",
            nemesis: "start-partition",
            partitionGroups: parsePartitionGroups(
                value,
                numNodes,
                nemesisNodes,
            ),
            time,
            raw,
        };

    return null;
};

const mapJepsenFunctionToEvent = (
    fn: string,
    isInvoke: boolean,
    value: string,
    base: BaseEvent,
): ParsedEvent | null => {
    switch (fn) {
        case "echo": {
            const echoStr =
                value.match(/:echo\s+"([^"]+)"/)?.[1] ??
                value.replace(/^"|"$/g, "");
            return {
                ...base,
                type: isInvoke ? "echo" : "echo_ok",
                echo: echoStr,
            };
        }

        case "generate": {
            if (isInvoke) return { ...base, type: "generate" };

            const numId = parseFloat(value);
            return {
                ...base,
                type: "generate_ok",
                generateId: value,
                tsBits: Number.isNaN(numId)
                    ? "?"
                    : String(Math.floor(numId / 4194304)),
                seqBits: Number.isNaN(numId)
                    ? "?"
                    : String(Math.floor(numId) % 4096),
                nodeBits: base.src.replace(/\D/g, "").padStart(3, "0"),
            };
        }

        case "broadcast":
            if (isInvoke) {
                const msg = parseInt(value, 10);
                return {
                    ...base,
                    type: "broadcast",
                    message: Number.isNaN(msg) ? undefined : msg,
                };
            }
            return { ...base, type: "broadcast_ok" };

        case "read": {
            if (isInvoke) {
                return { ...base, type: "read" };
            } else {
                if (value.startsWith("[")) {
                    const msgs = value
                        .slice(1, -1)
                        .trim()
                        .split(/\s+/)
                        .filter(Boolean)
                        .map(Number)
                        .filter((n) => !Number.isNaN(n));
                    return {
                        ...base,
                        type: "read_ok",
                        value: msgs.length,
                    };
                }
                const numVal = parseFloat(value);
                return {
                    ...base,
                    type: "read_ok",
                    value: Number.isNaN(numVal) ? 0 : numVal,
                };
            }
        }

        case "add":
            if (isInvoke) {
                const delta = parseInt(value, 10);
                return {
                    ...base,
                    type: "add",
                    delta: Number.isNaN(delta) ? 0 : delta,
                };
            }
            return { ...base, type: "add_ok" };

        default:
            // biome-ignore lint/suspicious/noExplicitAny: too difficult to aggregate types
            return { ...base, type: fn as any };
    }
};

const parsePartitionGroups = (
    value: string,
    numNodes: number,
    nemesisNodes: string[],
) => {
    const half = Math.ceil(numNodes / 2);
    const defaultSplit = [
        Array.from({ length: half }, (_, i) => `n${i}`),
        Array.from({ length: numNodes - half }, (_, i) => `n${half + i}`),
    ];

    if (!value || value === "nil" || !value.includes('"n')) return defaultSplit;

    const isolatedMatch = value.match(/"(n\d+)"\s+#\{([^}]+)\}/);
    if (!isolatedMatch) return defaultSplit;

    const allMentioned = [
        ...new Set([...value.matchAll(/"(n\d+)"/g)].map((m) => m[1])),
    ];
    const isolatedSet = new Set(
        [...isolatedMatch[2].matchAll(/"(n\d+)"/g)].map((m) => m[1]),
    );

    const indexMap =
        nemesisNodes.length > 0
            ? nemesisNodes
            : allMentioned.sort(
                  (a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10),
              );
    const remap = (n: string) =>
        `n${indexMap.indexOf(n) >= 0 ? indexMap.indexOf(n) : parseInt(n.slice(1), 10)}`;

    const groupA = allMentioned.filter((n) => !isolatedSet.has(n));
    const groupB = allMentioned.filter((n) => isolatedSet.has(n));

    if (groupA.length === 0 || groupB.length === 0) return defaultSplit;

    return [groupA.map(remap), groupB.map(remap)];
};
