export interface ParsedTopology {
    workers: string[];
    services: string[];
    links?: Record<string, string[]>;
    dynamic?: boolean;
}

export interface ParsedEvent {
    id: number;
    kind: "message" | "control";
    src: string;
    dest: string;
    time: number;
    receivedAt?: number;
    delivered?: boolean;
    type: string;
    raw: string;
    body?: Record<string, unknown>;
    nemesis?: "start-partition" | "stop-partition";
    partitionGroups?: string[][];
    message?: number;
    messages?: number[];
    value?: number;
    delta?: number;
    echo?: string;
    generateId?: string;
    tsBits?: string;
    nodeBits?: string;
    seqBits?: string;
}

export interface ParsedLog {
    events: ParsedEvent[];
    topology: ParsedTopology;
    duration: number;
}

interface ExportedMessage {
    kind: "message";
    messageId: number;
    sentAt: number;
    receivedAt: number | null;
    delivered: boolean;
    src: string;
    dest: string;
    originalSrc: string;
    originalDest: string;
    type: string;
    body: Record<string, unknown>;
}

interface ExportedControl {
    kind: "control";
    time: number;
    type: "nemesis" | "crash";
    action: "start-partition" | "stop-partition" | "crash";
    partitionGroups?: string[][];
    node?: string;
}

interface ExportedLog {
    version: 1;
    duration: number;
    topology: ParsedTopology;
    events: (ExportedMessage | ExportedControl)[];
}

export const parseEvents = (rawText: string): ParsedLog => {
    if (rawText.trimStart().startsWith("{")) {
        return parseExportedLog(JSON.parse(rawText) as ExportedLog);
    }

    return parseJepsenHistory(rawText);
};

const parseExportedLog = (log: ExportedLog): ParsedLog => ({
    topology: { ...log.topology, dynamic: true },
    duration: log.duration,
    events: log.events.map((event, id) => {
        if (event.kind === "control") {
            const node = event.node ?? "nemesis";
            return {
                id,
                kind: "control",
                src: node,
                dest: node,
                time: event.time,
                type: event.type,
                raw: formatControlEvent(event),
                nemesis:
                    event.action === "start-partition" ||
                    event.action === "stop-partition"
                        ? event.action
                        : undefined,
                partitionGroups: event.partitionGroups,
            };
        }

        return mapBodyToEvent(event.type, event.body, {
            id,
            kind: "message",
            src: event.src,
            dest: event.dest,
            time: event.sentAt,
            receivedAt: event.receivedAt ?? undefined,
            delivered: event.delivered,
            type: event.type,
            body: event.body,
            raw: `${event.src} -> ${event.dest}\t${event.type}\t${JSON.stringify(event.body)}`,
        });
    }),
});

const formatControlEvent = (event: ExportedControl) => {
    if (event.type === "crash") return `${event.node}\t:info\t:crash`;
    return `:nemesis\t:info\t:${event.action}\t${JSON.stringify(event.partitionGroups ?? [])}`;
};

const parseJepsenHistory = (rawText: string): ParsedLog => {
    const lines = rawText.split("\n");
    const { numNodes, nemesisNodes } = analyzeJepsenTopology(lines);
    const events: ParsedEvent[] = [];

    for (const line of lines) {
        if (!line.includes("\t")) continue;
        const event = parseJepsenLine(
            line,
            events.length,
            numNodes,
            nemesisNodes,
        );
        if (event) events.push(event);
    }

    return {
        events,
        topology: {
            workers: Array.from({ length: numNodes }, (_, i) => `n${i}`),
            services: [],
        },
        duration: events.at(-1)?.time ?? 0,
    };
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
            for (const match of line.matchAll(/"(n\d+)"/g)) {
                nemesisNodes.add(match[1]);
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
    const parts = line.split("\t").map((part) => part.trim());
    if (parts.length < 3) return null;

    const [processStr, opType, rawFn, ...valueParts] = parts;
    const fn = rawFn.replace(/^:/, "");
    const value = valueParts.join("\t").trim();
    const time = id * 80;

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

    const processId = parseInt(processStr, 10);
    if (Number.isNaN(processId)) return null;

    const isInvoke = opType === ":invoke";
    if (!isInvoke && opType !== ":ok" && opType !== ":info") return null;

    const nodeId = `n${processId % numNodes}`;
    const clientId = `c${processId}`;
    const src = isInvoke ? clientId : nodeId;
    const dest = isInvoke ? nodeId : clientId;
    const type = isInvoke ? fn : `${fn}_ok`;

    return mapJepsenFunctionToEvent(fn, isInvoke, value, {
        id,
        kind: "message",
        src,
        dest,
        time,
        type,
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
    if (fn !== "start-partition" && fn !== "stop-partition") return null;

    return {
        id,
        kind: "control",
        src: "nemesis",
        dest: "nemesis",
        type: "nemesis",
        nemesis: fn,
        partitionGroups:
            fn === "start-partition"
                ? parsePartitionGroups(value, numNodes, nemesisNodes)
                : [],
        time,
        raw,
    };
};

const mapJepsenFunctionToEvent = (
    fn: string,
    isInvoke: boolean,
    value: string,
    base: ParsedEvent,
): ParsedEvent => {
    switch (fn) {
        case "echo": {
            const echo =
                value.match(/:echo\s+"([^"]+)"/)?.[1] ??
                value.replace(/^"|"$/g, "");
            return { ...base, type: isInvoke ? "echo" : "echo_ok", echo };
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
        case "broadcast": {
            const message = parseInt(value, 10);
            return {
                ...base,
                type: isInvoke ? "broadcast" : "broadcast_ok",
                message: Number.isNaN(message) ? undefined : message,
            };
        }
        case "read": {
            if (isInvoke) return { ...base, type: "read" };
            if (value.startsWith("[")) {
                const messages = value
                    .slice(1, -1)
                    .trim()
                    .split(/\s+/)
                    .filter(Boolean)
                    .map(Number)
                    .filter((number) => !Number.isNaN(number));
                return {
                    ...base,
                    type: "read_ok",
                    messages,
                    value: messages.length,
                };
            }
            const number = parseFloat(value);
            return {
                ...base,
                type: "read_ok",
                value: Number.isNaN(number) ? 0 : number,
            };
        }
        case "add": {
            const delta = parseInt(value, 10);
            return {
                ...base,
                type: isInvoke ? "add" : "add_ok",
                delta: Number.isNaN(delta) ? 0 : delta,
            };
        }
        default:
            return {
                ...base,
                type: fn === "crash" || isInvoke ? fn : `${fn}_ok`,
            };
    }
};

const mapBodyToEvent = (
    type: string,
    body: Record<string, unknown>,
    base: ParsedEvent,
): ParsedEvent => {
    const messages = Array.isArray(body.messages)
        ? body.messages.filter(
              (value): value is number => typeof value === "number",
          )
        : undefined;
    const value =
        typeof body.value === "number"
            ? body.value
            : messages
              ? messages.length
              : undefined;
    const generateId = body.id == null ? undefined : String(body.id);
    const numericId = generateId == null ? Number.NaN : Number(generateId);

    return {
        ...base,
        type,
        message: typeof body.message === "number" ? body.message : undefined,
        messages,
        value,
        delta: typeof body.delta === "number" ? body.delta : undefined,
        echo: typeof body.echo === "string" ? body.echo : undefined,
        generateId,
        tsBits:
            generateId == null || Number.isNaN(numericId)
                ? undefined
                : String(Math.floor(numericId / 4194304)),
        seqBits:
            generateId == null || Number.isNaN(numericId)
                ? undefined
                : String(Math.floor(numericId) % 4096),
        nodeBits:
            generateId == null
                ? undefined
                : base.src.replace(/\D/g, "").padStart(3, "0"),
    };
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
        ...new Set([...value.matchAll(/"(n\d+)"/g)].map((match) => match[1])),
    ];
    const isolatedSet = new Set(
        [...isolatedMatch[2].matchAll(/"(n\d+)"/g)].map((match) => match[1]),
    );
    const indexMap =
        nemesisNodes.length > 0
            ? nemesisNodes
            : allMentioned.sort(
                  (a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10),
              );
    const remap = (node: string) =>
        `n${indexMap.indexOf(node) >= 0 ? indexMap.indexOf(node) : parseInt(node.slice(1), 10)}`;
    const groupA = allMentioned.filter((node) => !isolatedSet.has(node));
    const groupB = allMentioned.filter((node) => isolatedSet.has(node));

    if (groupA.length === 0 || groupB.length === 0) return defaultSplit;
    return [groupA.map(remap), groupB.map(remap)];
};
