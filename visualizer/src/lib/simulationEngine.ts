import * as d3 from "d3";
import { COLORS } from "./colors";
import type { ParsedEvent, ParsedTopology } from "./parser";
import { useMaelstromStore } from "./store";
import type { ChallengeStrategy } from "./strategies";
import type { Point } from "./types";
import { hexToRgba } from "./utils";

export interface NodeDatum extends d3.SimulationNodeDatum {
    id: string;
    service?: string;
    down: boolean;
    readyToBurst?: boolean;
}
export interface LinkDatum extends d3.SimulationLinkDatum<NodeDatum> {
    severed: boolean;
}
interface Packet {
    id: number;
    src: Point;
    dest: Point;
    progress: number;
    color: string;
    delivered: boolean;
}
interface Burst {
    id: number;
    x: number;
    y: number;
    color: string;
    particles: { angle: number; speed: number; life: number }[];
}

const PROTOCOL_COLORS: Record<string, string> = {
    echo: COLORS.CONTENT,
    generate: COLORS.CONTENT,
    broadcast: COLORS.PRIMARY,
    read: COLORS.CONTENT,
    add: COLORS.PRIMARY,
    send: COLORS.PRIMARY,
    poll: COLORS.CONTENT,
    assign: COLORS.SECONDARY,

    echo_ok: COLORS.SUCCESS,
    generate_ok: COLORS.SUCCESS,
    broadcast_ok: COLORS.SUCCESS,
    read_ok: COLORS.SUCCESS,
    add_ok: COLORS.SUCCESS,
    send_ok: COLORS.SUCCESS,
    poll_ok: COLORS.SUCCESS,
    assign_ok: COLORS.SUCCESS,
    mailbox_batch_gossip: COLORS.PRIMARY,
    mailbox_batch_gossip_ok: COLORS.SUCCESS,
    write: COLORS.ACCENT,
    write_ok: COLORS.SUCCESS,
    cas: COLORS.WARNING,
    cas_ok: COLORS.SUCCESS,
    txn: COLORS.CONTENT,
    txn_ok: COLORS.SUCCESS,
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

    public strategy?: ChallengeStrategy;
    private topology?: ParsedTopology;

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

    public loadChallenge(
        strategy: ChallengeStrategy,
        topology?: ParsedTopology,
    ) {
        this.strategy = strategy;
        this.topology = topology;
        if (topology?.dynamic) {
            strategy.workers = topology.workers;
            strategy.service = topology.services[0];
        }
        this.resetState();
        this.initializeTopology();
        this.startLoop();
    }

    public resetState() {
        this.nodeValues.clear();
        this.nodeMessageSets.clear();
        this.packets = [];
        this.bursts = [];
        this.isPartitioned = false;
        this.partitionGroups = [];
    }

    private initializeTopology() {
        if (this.canvas.parentElement === null || !this.strategy)
            throw new Error();

        const { clientWidth: W, clientHeight: H } = this.canvas;
        const cx = W / 2,
            cy = H / 2,
            orbit = Math.min(W, H) * 0.4;
        const workerTargets = new Map<string, Point>();

        this.nodes = this.strategy.workers.map((id, i) => {
            const a =
                // biome-ignore lint/style/noNonNullAssertion: map
                (2 * Math.PI * i) / this.strategy!.workers.length - Math.PI / 2;
            const target = {
                x: cx + orbit * Math.cos(a),
                y: cy + orbit * Math.sin(a),
            };
            workerTargets.set(id, target);
            return {
                id,
                down: false,
                ...target,
                vx: 0,
                vy: 0,
            };
        });

        const services = this.topology?.dynamic
            ? this.topology.services
            : this.strategy.service
              ? [this.strategy.service]
              : [];
        for (const service of services) {
            this.nodes.push({
                id: service,
                service,
                down: false,
                x: cx,
                y: cy,
                fx: cx,
                fy: cy,
            });
        }

        const topologyLinks = this.topology?.dynamic
            ? this.topology.links
            : undefined;
        const linkKeys = new Set<string>();
        this.links = topologyLinks
            ? Object.entries(topologyLinks).flatMap(([src, destinations]) =>
                  destinations.flatMap((dest) => {
                      if (!this.nodes.some((node) => node.id === dest))
                          return [];
                      const key = [src, dest].sort().join(":");
                      if (linkKeys.has(key)) return [];
                      linkKeys.add(key);
                      return [{ source: src, target: dest, severed: false }];
                  }),
              )
            : this.nodes.flatMap((src, i) =>
                  this.nodes.slice(i + 1).map((dest) => ({
                      source: src.id,
                      target: dest.id,
                      severed: false,
                  })),
              );

        const linkForce = d3
            .forceLink<NodeDatum, LinkDatum>(this.links)
            .id((d) => d.id)
            .distance(orbit * 0.8);
        if (this.strategy.id === "broadcast") linkForce.strength(0.02);

        this.sim
            .nodes(this.nodes)
            .force("link", linkForce)
            .force("center", d3.forceCenter(cx, cy))
            .force(
                "orbitX",
                this.strategy.id === "broadcast"
                    ? d3
                          .forceX<NodeDatum>(
                              (node) => workerTargets.get(node.id)?.x ?? cx,
                          )
                          .strength(0.25)
                    : null,
            )
            .force(
                "orbitY",
                this.strategy.id === "broadcast"
                    ? d3
                          .forceY<NodeDatum>(
                              (node) => workerTargets.get(node.id)?.y ?? cy,
                          )
                          .strength(0.25)
                    : null,
            )
            .alpha(0.7)
            .restart();
    }

    public processEvent(evt: ParsedEvent) {
        if (evt.type === "nemesis") {
            this.handleNemesis(evt);
            return;
        }

        if (evt.type === "crash") {
            this.spawnBurst(evt.dest, COLORS.ERROR, 64);
            const node = this.nodes.find((n) => n.id === evt.src);
            if (node) {
                node.down = !node.down;
            }
            return;
        }

        if (evt.src && evt.dest) {
            const packetColor = this.getPacketColor(evt);
            this.spawnPacket(
                evt.src,
                evt.dest,
                packetColor,
                evt.delivered !== false,
            );

            const srcNode = this.nodes.find((n) => n.id === evt.src);
            if (srcNode?.readyToBurst) {
                this.spawnBurst(srcNode.id, COLORS.SUCCESS, 32);
                srcNode.readyToBurst = false;
            }
        }

        this.strategy?.processEvent(evt, this);
    }

    private getPacketColor(evt: ParsedEvent) {
        if (evt.delivered === false || evt.type === "error")
            return COLORS.ERROR;
        const serviceIds = new Set(this.topology?.services ?? []);
        if (serviceIds.has(evt.src) || serviceIds.has(evt.dest)) {
            return evt.type.endsWith("_ok") ? COLORS.SUCCESS : COLORS.ACCENT;
        }
        return (
            PROTOCOL_COLORS[evt.type] ??
            (evt.type.endsWith("_ok") ? COLORS.SUCCESS : COLORS.SECONDARY)
        );
    }

    public spawnPacket(
        srcId: string,
        destId: string,
        color: string,
        delivered = true,
    ) {
        const p1 = this.getPosition(srcId);
        const p2 = this.getPosition(destId);
        if (!p1 || !p2) return;

        const n1 = this.nodes.find((n) => n.id === srcId);
        const n2 = this.nodes.find((n) => n.id === destId);
        const TUG_STRENGTH = 2.0;

        if (!n1 && n2) {
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const dist = Math.hypot(dx, dy) || 1;
            n2.vx = (n2.vx || 0) + (dx / dist) * TUG_STRENGTH;
            n2.vy = (n2.vy || 0) + (dy / dist) * TUG_STRENGTH;
            this.sim.alpha(Math.max(this.sim.alpha(), 0.08)).restart();
        } else if (n1 && !n2) {
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.hypot(dx, dy) || 1;
            n1.vx = (n1.vx || 0) + (dx / dist) * TUG_STRENGTH;
            n1.vy = (n1.vy || 0) + (dy / dist) * TUG_STRENGTH;
            this.sim.alpha(Math.max(this.sim.alpha(), 0.08)).restart();
        }

        this.packets.push({
            id: Math.random(),
            src: p1,
            dest: p2,
            progress: 0,
            color,
            delivered,
        });
    }

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

    private getPosition(id: string): Point | null {
        const node = this.nodes.find((n) => n.id === id);
        if (node && node.x != null && node.y != null)
            return { x: node.x, y: node.y };

        if (!id.startsWith("c")) return null;

        const match = id.match(/\d+/);
        const index = match ? parseInt(match[0], 10) : 0;

        const total = this.strategy?.workers.length ?? this.nodes.length;

        const padding = 64;
        const innerWidth = this.canvas.clientWidth - padding * 2;
        const fraction = total > 0 ? (index + 0.5) / total : 0.5;

        return {
            x: padding + fraction * innerWidth,
            y: 16,
        };
    }

    private handleNemesis(evt: ParsedEvent) {
        if (!("nemesis" in evt)) return;
        const store = useMaelstromStore.getState();

        if (evt.nemesis === "start-partition") {
            this.isPartitioned = true;
            this.partitionGroups = evt.partitionGroups || [];
            for (const l of this.links) {
                const s = typeof l.source === "object" ? l.source.id : l.source;
                const t = typeof l.target === "object" ? l.target.id : l.target;
                const gS = this.partitionGroups.findIndex((g) =>
                    g.includes(s.toString()),
                );
                const gT = this.partitionGroups.findIndex((g) =>
                    g.includes(t.toString()),
                );
                l.severed = gS !== gT && gS !== -1 && gT !== -1;
            }
            store.updateMetrics({ networkHealthy: false });
        } else if (evt.nemesis === "stop-partition") {
            this.isPartitioned = false;
            this.partitionGroups = [];
            for (const l of this.links) {
                l.severed = false;
            }
            store.updateMetrics({ networkHealthy: true });

            for (const n of this.nodes) {
                if (!n.service) {
                    n.readyToBurst = true;
                }
            }
        }
    }

    private startLoop() {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        const draw = () => {
            this.ctx.fillStyle = COLORS.BASE_100;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            this.flicker += 0.1;
            const speed = useMaelstromStore.getState().speed;

            if (this.isPartitioned) this.drawPartitionBarriers();
            this.drawLinks();
            this.drawPackets(speed);
            this.drawNodes();
            this.drawBursts(speed);

            this.rafId = requestAnimationFrame(draw);
        };
        requestAnimationFrame(draw);
    }

    private drawBursts(speed: number) {
        this.bursts = this.bursts.filter((b) =>
            b.particles.some((p) => p.life > 0),
        );

        for (const b of this.bursts) {
            for (const p of b.particles) {
                if (p.life <= 0) continue;

                p.life -= 0.014 * speed;
                if (p.life <= 0) {
                    p.life = 0;
                    continue;
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
            }
        }
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
                const f = 0.25 + 0.5 * Math.abs(Math.sin(this.flicker));
                this.ctx.strokeStyle = hexToRgba(COLORS.ERROR, f);
                this.ctx.setLineDash([4, 6]);
            } else {
                this.ctx.strokeStyle = hexToRgba(COLORS.CONTENT, 0.5);
                this.ctx.setLineDash([]);
            }
            this.ctx.stroke();
        }
    }

    private drawNodes() {
        if (!this.strategy) throw new Error();

        for (const node of this.nodes) {
            if (!node.x || !node.y) return;
            const r = node.service ? 60 : 40;
            let color = node.service
                ? COLORS.PRIMARY
                : this.strategy.getNodeColor(node.id, this);
            if (node.service === "lin-kv") {
                color = COLORS.BASE_100;
            }

            this.ctx.save();
            this.ctx.shadowBlur = 18;
            this.ctx.shadowColor = node.down ? COLORS.ERROR : color;
            this.ctx.beginPath();

            if (node.service) {
                for (let i = 0; i <= 6; i++) {
                    const angle = (i * Math.PI) / 3 + Math.PI / 6;
                    const x = node.x + r * Math.cos(angle);
                    const y = node.y + r * Math.sin(angle);
                    if (i === 0) {
                        this.ctx.moveTo(x, y);
                    } else {
                        this.ctx.lineTo(x, y);
                    }
                }
            } else {
                this.ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
            }

            this.ctx.fillStyle = COLORS.BASE_300;
            this.ctx.fill();
            this.ctx.strokeStyle = node.down ? COLORS.ERROR : color;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            this.ctx.shadowBlur = 0;
            this.ctx.fillStyle = node.down ? COLORS.ERROR : color;
            this.ctx.font = "bold 16px 'JetBrains Mono',monospace";
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";

            const dispVal = this.strategy.getDisplayString(node.id, this);
            if (dispVal) {
                this.ctx.fillText(dispVal, node.x, node.y - 12);
                this.ctx.font = "16px 'JetBrains Mono',monospace";
                this.ctx.fillStyle = COLORS.CONTENT;
                this.ctx.fillText(node.id, node.x, node.y + 7);
            } else {
                this.ctx.fillText(node.id, node.x, node.y);
            }
            this.ctx.restore();
        }
    }

    private drawPackets(speed: number) {
        this.packets = this.packets.filter((p) => p.progress < 1);
        const useGlow = this.packets.length < 200;
        for (const p of this.packets) {
            p.progress = Math.min(p.progress + 0.025 * speed, 1);
            const travelProgress = p.delivered
                ? p.progress
                : Math.min(p.progress, 0.72);

            const ease =
                travelProgress < 0.5
                    ? 2 * travelProgress * travelProgress
                    : -1 + (4 - 2 * travelProgress) * travelProgress;

            const px = p.src.x + (p.dest.x - p.src.x) * ease;
            const py = p.src.y + (p.dest.y - p.src.y) * ease;

            this.ctx.save();
            if (useGlow) {
                this.ctx.shadowBlur = 12;
                this.ctx.shadowColor = p.color;
            }
            this.ctx.globalAlpha = p.delivered
                ? 1
                : Math.max(0, 1 - Math.max(0, p.progress - 0.72) / 0.28);
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
            const points = group
                .map((id) => this.nodes.find((n) => n.id === id))
                .filter((n) => n && n.x != null) as Point[];

            if (points.length === 0) return;

            const minX = Math.min(...points.map((p) => p.x)) - 60;
            const maxX = Math.max(...points.map((p) => p.x)) + 60;
            const minY = Math.min(...points.map((p) => p.y)) - 60;
            const maxY = Math.max(...points.map((p) => p.y)) + 60;

            this.ctx.beginPath();
            this.ctx.roundRect(minX, minY, maxX - minX, maxY - minY, 16);
            this.ctx.strokeStyle = COLORS.ERROR;
            this.ctx.lineWidth = 4;
            this.ctx.setLineDash([6, 12]);
            this.ctx.stroke();
        });
        this.ctx.restore();
    }

    public destroy() {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.sim.stop();
    }
}
