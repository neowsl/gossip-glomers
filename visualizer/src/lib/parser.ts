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
    const log = JSON.parse(rawText) as ExportedLog;

    return {
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
    };
};

const formatControlEvent = (event: ExportedControl) => {
    if (event.type === "crash") return `${event.node}\t:info\t:crash`;
    return `:nemesis\t:info\t:${event.action}\t${JSON.stringify(event.partitionGroups ?? [])}`;
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
