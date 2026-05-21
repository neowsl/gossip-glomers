import * as d3 from "d3";
import type { ParsedEvent } from "./parser";
import { useMaelstromStore } from "./store";
import type { ChallengeStrategy } from "./strategies";

export interface NodeDatum extends d3.SimulationNodeDatum {
    id: string;
    isSeqKv?: boolean;
}
export interface LinkDatum extends d3.SimulationLinkDatum<NodeDatum> {
    severed: boolean;
}
interface Packet {
    id: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    progress: number;
    color: string;
}
interface Burst {
    id: number;
    x: number;
    y: number;
    color: string; // Added color support for generic bursts
    particles: { angle: number; speed: number; life: number }[];
}

const CONSTANTS = {
    NEON_CYAN: "#00f3ff",
    NEON_EMERALD: "#00ff9d",
    NEON_AMBER: "#ffb800",
    NEON_RED: "#ff2a6d",
};

const PROTOCOL_COLORS: Record<string, string> = {
    broadcast: "#00ff9d",
    read: "#ffb800",
    add: "#ffb800",
    write: "#ffb800",
    broadcast_ok: "#b44dff",
    read_ok: "#00f3ff",
    add_ok: "#00f3ff",
    write_ok: "#00f3ff",
    gossip: "#00f3ff",
    topology: "#708090",
};

export class SimulationEngine {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private rafId: number = 0;
    private flicker: number = 0;

    public nodes: NodeDatum[] = [];
    public links: LinkDatum[] = [];
    public packets: Packet[] = [];
    public bursts: Burst[] = [];
    private sim: d3.Simulation<NodeDatum, LinkDatum>;

    public strategy!: ChallengeStrategy;

    public nodeValues = new Map<string, number>();
    public nodeMessageSets = new Map<string, Set<number>>();
    public isPartitioned = false;
    public partitionGroups: string[][] = [];

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const ctx = canvas.getContext("2d");
        if (ctx === null) throw new Error();

        this.ctx = ctx;
        this.sim = d3
            .forceSimulation<NodeDatum>()
            .force("charge", d3.forceManyBody().strength(-200))
            .force("collide", d3.forceCollide(28))
            .alphaDecay(0.02);
    }

    public loadChallenge(strategy: ChallengeStrategy) {
        this.strategy = strategy;
        this.resetState();
        this.initializeTopology();
        this.startLoop();
    }

    private resetState() {
        this.nodeValues.clear();
        this.nodeMessageSets.clear();
        this.packets = [];
        this.bursts = [];
        this.isPartitioned = false;
        this.partitionGroups = [];
        this.sim.stop();
    }

    private initializeTopology() {
        if (this.canvas.parentElement === null) throw new Error();

        const { clientWidth: W, clientHeight: H } = this.canvas.parentElement;
        this.canvas.width = W;
        this.canvas.height = H;
        const cx = W / 2,
            cy = H / 2,
            orbit = Math.min(W, H) * 0.4;

        this.nodes = this.strategy.workers.map((id, i) => {
            const a =
                (2 * Math.PI * i) / this.strategy.workers.length - Math.PI / 2;
            return {
                id,
                x: cx + orbit * Math.cos(a),
                y: cy + orbit * Math.sin(a),
                vx: 0,
                vy: 0,
            };
        });

        if (this.strategy.hasSeqKv) {
            this.nodes.push({
                id: "seq-kv",
                isSeqKv: true,
                x: cx,
                y: cy,
                fx: cx,
                fy: cy,
            });
        }

        this.links = this.nodes.flatMap((src, i) =>
            this.nodes.slice(i + 1).map((dest) => ({
                source: src.id,
                target: dest.id,
                severed: false,
            })),
        );

        this.sim
            .nodes(this.nodes)
            .force(
                "link",
                d3
                    .forceLink<NodeDatum, LinkDatum>(this.links)
                    .id((d) => d.id)
                    .distance(orbit * 0.8),
            )
            .force("center", d3.forceCenter(cx, cy)) // Ensure cluster doesn't drift away off-screen
            .alpha(0.7)
            .restart();
    }

    public processEvent(evt: ParsedEvent) {
        if (evt.type === "nemesis") {
            this.handleNemesis(evt);
            return;
        }

        if (evt.src && evt.dest) {
            let packetColor = PROTOCOL_COLORS[evt.type] || "#ffffff";
            if (!evt.src.startsWith("c") && !evt.dest.startsWith("c")) {
                packetColor = "#00f3ff";
            }
            this.spawnPacket(evt.src, evt.dest, packetColor);
        }

        if (this.strategy) this.strategy.processEvent(evt, this);
    }

    public spawnPacket(srcId: string, destId: string, color: string) {
        const p1 = this.getPosition(srcId);
        const p2 = this.getPosition(destId);
        if (!p1 || !p2) return;

        // --- NEW: KINETIC MOMENTUM TUG ---
        // We find if one endpoint is a node and apply force toward the other endpoint
        const n1 = this.nodes.find((n) => n.id === srcId);
        const n2 = this.nodes.find((n) => n.id === destId);
        const TUG_STRENGTH = 2.0;

        // If client sends to node, pull the node slightly towards the client
        if (!n1 && n2) {
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const dist = Math.hypot(dx, dy) || 1;
            n2.vx = (n2.vx || 0) + (dx / dist) * TUG_STRENGTH;
            n2.vy = (n2.vy || 0) + (dy / dist) * TUG_STRENGTH;
            this.sim.alpha(Math.max(this.sim.alpha(), 0.08)).restart(); // Reheat sim softly
        }
        // If node sends to client, push node away from the cluster towards client
        else if (n1 && !n2) {
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.hypot(dx, dy) || 1;
            n1.vx = (n1.vx || 0) + (dx / dist) * TUG_STRENGTH;
            n1.vy = (n1.vy || 0) + (dy / dist) * TUG_STRENGTH;
            this.sim.alpha(Math.max(this.sim.alpha(), 0.08)).restart();
        }

        this.packets.push({
            id: Math.random(),
            x1: p1.x,
            y1: p1.y,
            x2: p2.x,
            y2: p2.y,
            progress: 0,
            color,
        });
    }

    // --- NEW: PROGRAMMATIC BURST EXPOSURE ---
    public spawnBurst(nodeId: string, color: string, count = 24) {
        const pos = this.getPosition(nodeId);
        if (!pos) return;

        this.bursts.push({
            id: Math.random(),
            x: pos.x,
            y: pos.y,
            color,
            particles: Array.from({ length: count }, () => ({
                angle: Math.random() * Math.PI * 2,
                speed: 1 + Math.random() * 3,
                life: 1,
            })),
        });
    }

    private getPosition(id: string): { x: number; y: number } | null {
        const node = this.nodes.find((n) => n.id === id);
        if (node && node.x != null && node.y != null)
            return { x: node.x, y: node.y };

        if (!id.startsWith("c")) return null;
        const W = this.canvas.width;
        const match = id.match(/\d+/);
        const num = match ? parseInt(match[0], 10) : 0;
        const totalSlots = 5;
        const slot = num % totalSlots;
        return { x: W * (0.15 + slot * (0.7 / (totalSlots - 1 || 1))), y: 30 };
    }

    private handleNemesis(evt: ParsedEvent) {
        if (!("nemesis" in evt)) return;
        const store = useMaelstromStore.getState();

        if (evt.nemesis === "start-partition") {
            this.isPartitioned = true;
            this.partitionGroups = evt.partitionGroups || [];
            this.links.forEach((l) => {
                const s = typeof l.source === "object" ? l.source.id : l.source;
                const t = typeof l.target === "object" ? l.target.id : l.target;
                const gS = this.partitionGroups.findIndex((g) => g.includes(s));
                const gT = this.partitionGroups.findIndex((g) => g.includes(t));
                l.severed = gS !== gT && gS !== -1 && gT !== -1;
            });
            store.updateMetrics({ networkHealthy: false });
        } else if (evt.nemesis === "stop-partition") {
            this.isPartitioned = false;
            this.partitionGroups = [];
            this.links.forEach((l) => {
                l.severed = false;
            });
            store.updateMetrics({ networkHealthy: true });

            // --- NEW: SPAWN BURSTS ON PARTITION HEAL ---
            setTimeout(() => {
                this.nodes.forEach(
                    (n) =>
                        !n.isSeqKv &&
                        this.spawnBurst(n.id, CONSTANTS.NEON_EMERALD, 32),
                );
            }, 200);
        }
    }

    private startLoop() {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        const draw = () => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.flicker += 0.07;
            const speed = useMaelstromStore.getState().speed;

            if (this.isPartitioned) this.drawPartitionBarriers();
            this.drawLinks();
            this.drawNodes();
            this.drawPackets(speed);
            this.drawBursts(speed); // Render particle systems

            this.rafId = requestAnimationFrame(draw);
        };
        requestAnimationFrame(draw);
    }

    // --- NEW: DRAW BURSTS LOOP ---
    private drawBursts(speed: number) {
        this.bursts = this.bursts.filter((b) =>
            b.particles.some((p) => p.life > 0),
        );

        this.bursts.forEach((b) => {
            b.particles.forEach((p) => {
                if (p.life <= 0) return;

                p.life -= 0.014 * speed;
                if (p.life <= 0) {
                    p.life = 0;
                    return;
                }

                const dist = (1 - p.life) * 85;
                const bx = b.x + Math.cos(p.angle) * dist * p.speed;
                const by = b.y + Math.sin(p.angle) * dist * p.speed;
                const r = Math.max(0.001, 2.5 * p.life);
                const alpha = Math.max(
                    0,
                    Math.min(255, Math.floor(p.life * 255)),
                );

                this.ctx.save();
                this.ctx.shadowBlur = 8;
                this.ctx.shadowColor = b.color;
                this.ctx.beginPath();
                this.ctx.arc(bx, by, r, 0, Math.PI * 2);
                this.ctx.fillStyle = `${b.color}${alpha.toString(16).padStart(2, "0")}`;
                this.ctx.fill();
                this.ctx.restore();
            });
        });
    }

    private drawLinks() {
        for (const l of this.links) {
            const s = l.source as NodeDatum;
            const t = l.target as NodeDatum;
            if (!s.x || !s.y || !t.x || !t.y) return;

            this.ctx.beginPath();
            this.ctx.moveTo(s.x, s.y);
            this.ctx.lineTo(t.x, t.y);

            if (l.severed) {
                const f = 0.25 + 0.5 * Math.abs(Math.sin(this.flicker * 4));
                this.ctx.strokeStyle = `rgba(255,42,109,${f})`;
                this.ctx.setLineDash([4, 6]);
            } else {
                this.ctx.strokeStyle = "rgba(0,255,157,0.09)";
                this.ctx.setLineDash([]);
            }
            this.ctx.stroke();
        }
    }

    private drawNodes() {
        for (const node of this.nodes) {
            if (!node.x || !node.y) return;
            const r = node.isSeqKv ? 60 : 40;
            const color = node.isSeqKv
                ? CONSTANTS.NEON_CYAN
                : this.strategy.getNodeColor(node.id, this);

            this.ctx.save();
            this.ctx.shadowBlur = 18;
            this.ctx.shadowColor = color;
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
            this.ctx.fillStyle = "rgba(2,10,22,0.90)";
            this.ctx.fill();
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            this.ctx.shadowBlur = 0;
            this.ctx.fillStyle = color;
            this.ctx.font = "bold 16px 'JetBrains Mono',monospace";
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";

            const dispVal = this.strategy.getDisplayString(node.id, this);
            if (dispVal) {
                this.ctx.fillText(dispVal, node.x, node.y - 12);
                this.ctx.font = "16px 'JetBrains Mono',monospace";
                this.ctx.fillStyle = "rgba(200,220,255,0.65)";
                this.ctx.fillText(node.id, node.x, node.y + 7);
            } else {
                this.ctx.fillText(node.id, node.x, node.y);
            }
            this.ctx.restore();
        }
    }

    private drawPackets(speed: number) {
        this.packets = this.packets.filter((p) => p.progress < 1);
        for (const p of this.packets) {
            p.progress = Math.min(p.progress + 0.02 * speed, 1);
            const ease =
                p.progress < 0.5
                    ? 2 * p.progress * p.progress
                    : -1 + (4 - 2 * p.progress) * p.progress;
            const px = p.x1 + (p.x2 - p.x1) * ease;
            const py = p.y1 + (p.y2 - p.y1) * ease;

            this.ctx.save();
            this.ctx.shadowBlur = 12;
            this.ctx.shadowColor = p.color;
            this.ctx.beginPath();
            this.ctx.arc(px, py, 4, 0, Math.PI * 2);
            this.ctx.fillStyle = p.color;
            this.ctx.fill();
            this.ctx.restore();
        }
    }

    private drawPartitionBarriers() {
        this.ctx.save();
        this.partitionGroups.forEach((group) => {
            // Collect active pixel coordinates for nodes inside this isolated cell
            const points = group
                .map((id) => this.nodes.find((n) => n.id === id))
                .filter((n) => n && n.x != null) as any[];

            if (points.length === 0) return;

            // Compute center mass bounding coordinates for the cluster segment
            const minX = Math.min(...points.map((p) => p.x)) - 60;
            const maxX = Math.max(...points.map((p) => p.x)) + 60;
            const minY = Math.min(...points.map((p) => p.y)) - 60;
            const maxY = Math.max(...points.map((p) => p.y)) + 60;

            // Draw glowing boundary zone overlay
            this.ctx.beginPath();
            this.ctx.roundRect(minX, minY, maxX - minX, maxY - minY, 16);
            this.ctx.strokeStyle = "rgba(255, 42, 109, 0.25)";
            this.ctx.lineWidth = 8;
            this.ctx.setLineDash([6, 12]);
            this.ctx.stroke();
            this.ctx.fillStyle = "rgba(255, 42, 109, 0.02)";
            this.ctx.fill();
        });
        this.ctx.restore();
    }

    public destroy() {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.sim.stop();
    }
}
