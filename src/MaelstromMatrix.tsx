import * as d3 from "d3";
import {
	Activity,
	BarChart2,
	ChevronRight,
	Cpu,
	GitFork,
	Pause,
	Play,
	Radio,
	Terminal,
	Wifi,
	WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChallengeId } from "./lib/challenges";
import { CHALLENGES, getChallengeById } from "./lib/challenges";
import type { ParsedEvent } from "./lib/parser";
import { computeGCounterMetrics } from "./lib/parser";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const NEON_CYAN = "#00f3ff";
const NEON_EMERALD = "#00ff9d";
const NEON_AMBER = "#ffb800";
const NEON_RED = "#ff2a6d";
const NEON_VIOLET = "#b44dff";

// ── TYPES ─────────────────────────────────────────────────────────────────────
interface NodeDatum extends d3.SimulationNodeDatum {
	id: string;
	isSeqKv?: boolean;
}
interface LinkDatum extends d3.SimulationLinkDatum<NodeDatum> {
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
	particles: { angle: number; speed: number; life: number }[];
}
interface BitRing {
	id: number;
	x: number;
	y: number;
	progress: number;
	tsBits: string;
	nodeBits: string;
	seqBits: string;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function hexPoints(cx: number, cy: number, r: number): [number, number][] {
	return Array.from({ length: 6 }, (_, i) => {
		const a = (Math.PI / 3) * i - Math.PI / 6;
		return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number];
	});
}

function workerNodeColor(
	id: string,
	cid: ChallengeId,
	nodeValues: Record<string, number>,
	nodeMessageCounts: Record<string, number>,
	totalMessages: number,
	isPartitioned: boolean,
	partitionGroups: string[][],
	currentWorkers: string[],
): string {
	if (cid === "echo") return NEON_CYAN;
	if (cid === "unique-id") return NEON_VIOLET;
	if (cid === "broadcast") {
		const c = nodeMessageCounts[id] ?? 0;
		if (totalMessages === 0) return NEON_CYAN;
		if (c >= totalMessages) return NEON_EMERALD;
		if (c > 0) return NEON_AMBER;
		return NEON_CYAN;
	}
	// g-counter
	const maxV = Math.max(...currentWorkers.map((n) => nodeValues[n] ?? 0), 1);
	const v = nodeValues[id] ?? 0;
	if (isPartitioned && partitionGroups[1]?.includes(id)) return NEON_AMBER;
	if (maxV === 0 || maxV === v) return NEON_EMERALD;
	return maxV - v <= 5 ? NEON_AMBER : NEON_RED;
}

// ── DEFINITIONS ──────────────────────────────────────────────────────────────
// Explicitly hard-code the cluster topologies per challenge
const CHALLENGE_CLUSTERS: Record<ChallengeId, string[]> = {
	echo: ["n0"],
	"unique-id": ["n0", "n1", "n2"],
	broadcast: ["n0", "n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8", "n9"],
	"g-counter": ["n0", "n1", "n2", "n3", "n4"],
};

// ── COMPONENT ─────────────────────────────────────────────────────────────────
export default function MaelstromMatrix() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const logRef = useRef<HTMLDivElement>(null);

	// React state
	const [challengeId, setChallengeId] = useState<ChallengeId>("broadcast");
	const [events, setEvents] = useState<ParsedEvent[]>(() =>
		getChallengeById("broadcast").getSimulatedEvents(),
	);

	// Get the hard-coded cluster array for the active challenge
	const currentWorkers = CHALLENGE_CLUSTERS[challengeId];

	const numWorkers = currentWorkers.length;

	// Helper to generate dynamic node maps on the fly based on the current cluster
	const createNodeMap = (fallbackValue: any, includeHub = false) => {
		const map = currentWorkers.reduce<Record<string, any>>((acc, node) => {
			acc[node] =
				fallbackValue instanceof Set
					? new Set()
					: Array.isArray(fallbackValue)
						? []
						: fallbackValue;
			return acc;
		}, {});
		if (includeHub) {
			map["seq-kv"] = fallbackValue;
		}
		return map;
	};

	// d3 & animation refs
	const simRef = useRef<d3.Simulation<NodeDatum, LinkDatum> | null>(null);
	const nodesRef = useRef<NodeDatum[]>([]);
	const linksRef = useRef<LinkDatum[]>([]);
	const packetsRef = useRef<Packet[]>([]);
	const burstsRef = useRef<Burst[]>([]);
	const bitRingsRef = useRef<BitRing[]>([]);
	const rafRef = useRef<number>(0);
	const eventTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const pktIdRef = useRef(0);
	const burstIdRef = useRef(0);
	const bitRingIdRef = useRef(0);
	const flickerRef = useRef(0);
	const canvasSizeRef = useRef({ W: 600, H: 500 });
	const clientPosRef = useRef<Record<string, { x: number; y: number }>>({});

	// state mirrors → refs
	const challengeIdRef = useRef<ChallengeId>("g-counter");
	const isPartitionedRef = useRef(false);
	const partitionGroupsRef = useRef<string[][]>([]);

	// Instantiate refs with the current cluster sizing
	const nodeValuesRef = useRef<Record<string, number>>(createNodeMap(0, true));
	const nodeSeqCountsRef = useRef<Record<string, number>>(createNodeMap(0));
	const nodeMsgSetsRef = useRef<Record<string, Set<number>>>(
		createNodeMap(new Set()),
	);
	const allMsgsSetRef = useRef(new Set<number>());
	const nodeMessageCountsRef = useRef<Record<string, number>>(createNodeMap(0));

	const totalMessagesRef = useRef(0);
	const currentIdxRef = useRef(-1);
	const isPlayingRef = useRef(false);
	const speedRef = useRef(1);
	const eventsRef = useRef<ParsedEvent[]>([]);

	const [currentIdx, setCurrentIdx] = useState(-1);
	const [isPlaying, setIsPlaying] = useState(false);
	const [speed, setSpeed] = useState(1);

	// React state initializers driven by current challenge cluster layout
	const [nodeValues, setNodeValues] = useState<Record<string, number>>(() =>
		createNodeMap(0, true),
	);
	const [nodeSeqCounts, setNodeSeqCounts] = useState<Record<string, number>>(
		() => createNodeMap(0),
	);
	const [nodeMessageCounts, setNodeMessageCounts] = useState<
		Record<string, number>
	>(() => createNodeMap(0));

	const [totalMessages, setTotalMessages] = useState(0);
	const [isPartitioned, setIsPartitioned] = useState(false);
	const [logLines, setLogLines] = useState<string[]>([]);
	const [metrics, setMetrics] = useState({
		totalOps: 0,
		networkHealth: 100,
		consensusDelta: 0,
		eventCount: 0,
	});
	const [convergence, setConvergence] = useState(100);

	// RESET STATE PIPELINE WHEN CHALLENGE CHANGES
	useEffect(() => {
		const freshValues = createNodeMap(0, true);
		const freshSeqs = createNodeMap(0);
		const freshMsgs = createNodeMap(0);

		nodeValuesRef.current = freshValues;
		nodeSeqCountsRef.current = freshSeqs;
		nodeMsgSetsRef.current = createNodeMap(new Set());
		nodeMessageCountsRef.current = freshMsgs;
		allMsgsSetRef.current = new Set();
		totalMessagesRef.current = 0;

		setNodeValues(freshValues);
		setNodeSeqCounts(freshSeqs);
		setNodeMessageCounts(freshMsgs);
		setTotalMessages(0);
	}, [challengeId]);

	// sync state → refs
	useEffect(() => {
		challengeIdRef.current = challengeId;
	}, [challengeId]);
	useEffect(() => {
		isPlayingRef.current = isPlaying;
	}, [isPlaying]);
	useEffect(() => {
		speedRef.current = speed;
	}, [speed]);
	useEffect(() => {
		currentIdxRef.current = currentIdx;
	}, [currentIdx]);
	useEffect(() => {
		eventsRef.current = events;
	}, [events]);

	// ── CANVAS SETUP & ANIMATION LOOP ────────────────────────────────────────────
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const W = canvas.parentElement?.clientWidth ?? 600;
		const H = canvas.parentElement?.clientHeight ?? 500;
		canvas.width = W;
		canvas.height = H;
		canvasSizeRef.current = { W, H };

		const cx = W / 2,
			cy = H / 2;
		const orbit = Math.min(W, H) * 0.9;

		// Dynamic clients mapping down the left axis
		const NUM_CLIENTS = 5;
		const dynamicClients: Record<string, { x: number; y: number }> = {};
		for (let i = 0; i < NUM_CLIENTS; i++) {
			dynamicClients[`c${i}`] = {
				x: 28,
				y: H * (0.15 + i * (0.7 / (NUM_CLIENTS - 1 || 1))),
			};
		}
		clientPosRef.current = dynamicClients;

		// Radial nodes based on the current challenge's hardcoded cluster size
		const initialNodes: NodeDatum[] = [
			{ id: "seq-kv", isSeqKv: true, x: cx, y: cy, fx: cx, fy: cy },
			...currentWorkers.map((id, i) => {
				const a = (2 * Math.PI * i) / numWorkers - Math.PI / 2;
				return {
					id,
					x: cx + orbit * Math.cos(a),
					y: cy + orbit * Math.sin(a),
				};
			}),
		];
		nodesRef.current = initialNodes;

		// Full-mesh link computation based entirely on current workers array length
		const hubLinks: LinkDatum[] = [
			...currentWorkers.map((n) => ({
				source: n,
				target: "seq-kv",
				severed: false,
			})),
			...currentWorkers.flatMap((src, i) =>
				currentWorkers.slice(i + 1).map((dest) => ({
					source: src,
					target: dest,
					severed: false,
				})),
			),
		];
		linksRef.current = hubLinks;

		const sim = d3
			.forceSimulation<NodeDatum>(initialNodes)
			.force(
				"link",
				d3
					.forceLink<NodeDatum, LinkDatum>(hubLinks)
					.id((d) => d.id)
					.distance((l) => {
						const t =
							typeof l.target === "object"
								? (l.target as NodeDatum).id
								: (l.target as string);
						return t === "seq-kv" ||
							(typeof l.source === "object" &&
								(l.source as NodeDatum).id === "seq-kv")
							? orbit
							: orbit * 0.4;
					})
					.strength(0.4),
			)
			.force("charge", d3.forceManyBody().strength(-8000))
			.force("collide", d3.forceCollide(28))
			.alphaDecay(0.02)
			.on("tick", () => {});
		simRef.current = sim;

		// ── DRAW ──────────────────────────────────────────────────────────────────
		function drawFrame() {
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			ctx.clearRect(0, 0, W, H);
			flickerRef.current += 0.07;

			const cid = challengeIdRef.current;
			const cfg = getChallengeById(cid);
			const nodes = nodesRef.current;
			const links = linksRef.current;
			const partitioned = isPartitionedRef.current;
			const nodeVals = nodeValuesRef.current;
			const msgCnts = nodeMessageCountsRef.current;
			const totMsg = totalMessagesRef.current;
			const pgrs = partitionGroupsRef.current;

			// Links
			links.forEach((l) => {
				const s =
					typeof l.source === "object"
						? (l.source as NodeDatum)
						: nodes.find((n) => n.id === l.source);
				const t =
					typeof l.target === "object"
						? (l.target as NodeDatum)
						: nodes.find((n) => n.id === l.target);
				if (!s || !t || s.x == null || t.x == null) return;
				ctx.beginPath();
				ctx.moveTo(s.x, s.y);
				ctx.lineTo(t.x, t.y);
				if (l.severed) {
					const f =
						0.25 +
						0.5 *
							Math.abs(Math.sin(flickerRef.current * 4 + Math.random() * 0.3));
					ctx.strokeStyle = `rgba(255,42,109,${f})`;
					ctx.lineWidth = 1.5;
					ctx.setLineDash([4, 6]);
				} else {
					const isKv = (s as NodeDatum).isSeqKv || (t as NodeDatum).isSeqKv;
					ctx.strokeStyle = isKv
						? "rgba(0,243,255,0.14)"
						: "rgba(0,255,157,0.09)";
					ctx.lineWidth = 1;
					ctx.setLineDash([]);
				}
				ctx.stroke();
				ctx.setLineDash([]);
			});

			// Nodes
			nodes.forEach((node) => {
				if (node.x == null || node.y == null) return;
				if (node.isSeqKv && !cfg.showSeqKv) return;

				const r = node.isSeqKv ? 60 : 40;
				const color = node.isSeqKv
					? NEON_CYAN
					: workerNodeColor(
							node.id,
							cid,
							nodeVals,
							msgCnts,
							totMsg,
							partitioned,
							pgrs,
							currentWorkers,
						);

				// Get display value
				let dispVal = "";
				if (!node.isSeqKv) {
					const sc = nodeSeqCountsRef.current;
					if (cid === "echo" || cid === "unique-id")
						dispVal = String(sc[node.id] ?? 0);
					else if (cid === "broadcast") dispVal = String(msgCnts[node.id] ?? 0);
					else dispVal = String(nodeVals[node.id] ?? 0);
				}

				ctx.save();
				ctx.shadowBlur = 18;
				ctx.shadowColor = color;

				if (node.isSeqKv) {
					const pts = hexPoints(node.x, node.y, r);
					ctx.beginPath();
					ctx.moveTo(pts[0][0], pts[0][1]);
					pts.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
					ctx.closePath();
					ctx.fillStyle = "rgba(2,10,22,0.92)";
					ctx.fill();
					ctx.strokeStyle = color;
					ctx.lineWidth = 2;
					ctx.stroke();
					ctx.shadowBlur = 0;
					ctx.fillStyle = color;
					ctx.font = "bold 16px 'JetBrains Mono',monospace";
					ctx.textAlign = "center";
					ctx.textBaseline = "middle";
					ctx.fillText("seq-kv", node.x, node.y);
				} else {
					ctx.beginPath();
					ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
					ctx.fillStyle = "rgba(2,10,22,0.90)";
					ctx.fill();
					ctx.strokeStyle = color;
					ctx.lineWidth = 2;
					ctx.stroke();
					ctx.shadowBlur = 0;
					ctx.fillStyle = color;
					ctx.font = "bold 16px 'JetBrains Mono',monospace";
					ctx.textAlign = "center";
					ctx.textBaseline = "middle";
					if (dispVal) {
						ctx.fillText(dispVal, node.x, node.y - 12);
						ctx.font = "16px 'JetBrains Mono',monospace";
						ctx.fillStyle = "rgba(200,220,255,0.65)";
						ctx.fillText(node.id, node.x, node.y + 7);
					} else {
						ctx.fillText(node.id, node.x, node.y);
					}
				}
				ctx.restore();
			});

			// Packets
			packetsRef.current = packetsRef.current.filter((p) => p.progress < 1);
			packetsRef.current.forEach((p) => {
				p.progress = Math.min(p.progress + 0.02 * speedRef.current, 1);
				const ease =
					p.progress < 0.5
						? 2 * p.progress * p.progress
						: -1 + (4 - 2 * p.progress) * p.progress;
				const px = p.x1 + (p.x2 - p.x1) * ease;
				const py = p.y1 + (p.y2 - p.y1) * ease;
				const fade = p.progress < 0.8 ? 1 : (1 - p.progress) / 0.2;
				ctx.save();
				ctx.shadowBlur = 12;
				ctx.shadowColor = p.color;
				ctx.beginPath();
				ctx.arc(px, py, 4, 0, Math.PI * 2);
				ctx.fillStyle = `${p.color}${Math.floor(fade * 255)
					.toString(16)
					.padStart(2, "0")}`;
				ctx.fill();
				// trail
				for (let i = 1; i <= 4; i++) {
					const tp = Math.max(0, p.progress - i * 0.012);
					const e2 = tp < 0.5 ? 2 * tp * tp : -1 + (4 - 2 * tp) * tp;
					const tx = p.x1 + (p.x2 - p.x1) * e2,
						ty = p.y1 + (p.y2 - p.y1) * e2;
					const tf = ((5 - i) / 5) * fade * 0.35;
					const tr = (4 - i * 0.6) * fade;
					if (tr > 0) {
						ctx.beginPath();
						ctx.arc(tx, ty, tr, 0, Math.PI * 2);
						ctx.fillStyle = `${p.color}${Math.floor(tf * 255)
							.toString(16)
							.padStart(2, "0")}`;
						ctx.fill();
					}
				}
				ctx.restore();
			});

			// Bursts
			burstsRef.current = burstsRef.current.filter((b) =>
				b.particles.some((p) => p.life > 0),
			);
			burstsRef.current.forEach((b) => {
				b.particles.forEach((p) => {
					if (p.life <= 0) return;
					p.life -= 0.014 * speedRef.current;
					if (p.life <= 0) {
						p.life = 0;
						return;
					}
					const dist = (1 - p.life) * 85;
					const bx = b.x + Math.cos(p.angle) * dist * p.speed;
					const by = b.y + Math.sin(p.angle) * dist * p.speed;
					const r = Math.max(0.001, 2.5 * p.life);
					const alpha = Math.max(0, Math.min(255, Math.floor(p.life * 255)));
					ctx.save();
					ctx.shadowBlur = 8;
					ctx.shadowColor = NEON_EMERALD;
					ctx.beginPath();
					ctx.arc(bx, by, r, 0, Math.PI * 2);
					ctx.fillStyle = `${NEON_EMERALD}${alpha.toString(16).padStart(2, "0")}`;
					ctx.fill();
					ctx.restore();
				});
			});

			// Bit rings (Unique ID challenge)
			if (cid === "unique-id") {
				bitRingsRef.current = bitRingsRef.current.filter(
					(r) => r.progress < 1.3,
				);
				bitRingsRef.current.forEach((ring) => {
					ring.progress += 0.018 * speedRef.current;
					const p = Math.min(ring.progress, 1);
					const fade =
						ring.progress < 0.75
							? ring.progress / 0.75
							: 1 - (ring.progress - 0.75) / 0.55;
					if (fade <= 0) return;

					const rings = [
						{
							r: 28 + p * 22,
							color: NEON_CYAN,
							label: `TS:${ring.tsBits}`,
						},
						{
							r: 50 + p * 22,
							color: NEON_EMERALD,
							label: `NODE:${ring.nodeBits}`,
						},
						{
							r: 72 + p * 22,
							color: NEON_VIOLET,
							label: `SEQ:${ring.seqBits}`,
						},
					];
					rings.forEach(({ r, color, label }) => {
						ctx.save();
						ctx.shadowBlur = 10;
						ctx.shadowColor = color;
						ctx.beginPath();
						ctx.arc(ring.x, ring.y, r, 0, Math.PI * 2);
						ctx.strokeStyle = `${color}${Math.floor(fade * 160)
							.toString(16)
							.padStart(2, "0")}`;
						ctx.lineWidth = 2;
						ctx.stroke();
						ctx.restore();
						if (p > 0.45) {
							ctx.fillStyle = `${color}${Math.floor(fade * 200)
								.toString(16)
								.padStart(2, "0")}`;
							ctx.font = "7px 'JetBrains Mono',monospace";
							ctx.textAlign = "center";
							ctx.fillText(label, ring.x, ring.y - r - 5);
						}
					});
				});
			}

			rafRef.current = requestAnimationFrame(drawFrame);
		}

		drawFrame();
		return () => {
			cancelAnimationFrame(rafRef.current);
			sim.stop();
		};
	}, [challengeId, currentWorkers]);

	// ── TOPOLOGY: update simulation when challenge changes ────────────────────────
	useEffect(() => {
		const sim = simRef.current;
		if (!sim) return;
		const cfg = getChallengeById(challengeId);
		const { W, H } = canvasSizeRef.current;
		const cx = W / 2,
			cy = H / 2;

		const orbit = Math.min(W, H) * 0.35;

		// 1. DYNAMICALLY BUILD ONLY THE REQUIRED NODES
		// Architectural rule: Never pass inactive nodes into a physics simulation.
		const newNodes: NodeDatum[] = [];

		if (cfg.showSeqKv) {
			newNodes.push({
				id: "seq-kv",
				isSeqKv: true,
				x: cx,
				y: cy,
				fx: cx,
				fy: cy,
			});
		}

		newNodes.push(
			...currentWorkers.map((id, i) => {
				const a = (2 * Math.PI * i) / numWorkers - Math.PI / 2;
				return {
					id,
					x: cx + orbit * Math.cos(a),
					y: cy + orbit * Math.sin(a),
					vx: 0,
					vy: 0,
				};
			}),
		);

		nodesRef.current = newNodes;

		// 2. Build links
		let newLinks: LinkDatum[] = [];
		if (cfg.topology === "kv-hub") {
			newLinks = [
				...currentWorkers.map((n) => ({
					source: n,
					target: "seq-kv",
					severed: false,
				})),
				...cfg.topologyLinks.map(([s, t]) => ({
					source: s,
					target: t,
					severed: false,
				})),
			];
		} else if (cfg.topology === "mesh") {
			newLinks = cfg.topologyLinks.map(([s, t]) => ({
				source: s,
				target: t,
				severed: false,
			}));
		}
		linksRef.current = newLinks;

		// 3. APPLY CONTEXT-AWARE FORCES
		const hasLinks = newLinks.length > 0;

		sim
			.nodes(newNodes)
			.force(
				"link",
				hasLinks
					? d3
							.forceLink<NodeDatum, LinkDatum>(newLinks)
							.id((d) => d.id)
							.distance(orbit * 0.6)
							.strength(0.35)
					: null,
			)
			// Dynamically scale the repulsion. -3000 is great for tight clusters,
			// but -400 is safer when nodes are floating independently.
			.force("charge", d3.forceManyBody().strength(hasLinks ? -3000 : -400))
			.force("center", d3.forceCenter(cx, cy))
			// Apply soft positional gravity to independently anchor unlinked nodes
			.force("x", hasLinks ? null : d3.forceX(cx).strength(0.04))
			.force("y", hasLinks ? null : d3.forceY(cy).strength(0.04))
			.force("partition", null)
			.alpha(0.4)
			.restart();
	}, [challengeId, currentWorkers, numWorkers]);

	// ── PLAYBACK TIMER ────────────────────────────────────────────────────────────
	useEffect(() => {
		if (eventTimerRef.current) clearInterval(eventTimerRef.current);
		if (!isPlaying) return;
		const ms = Math.round(50 / speed);
		eventTimerRef.current = setInterval(() => {
			const nextIdx = currentIdxRef.current + 1;
			if (nextIdx >= eventsRef.current.length) {
				setIsPlaying(false);
				return;
			}
			setCurrentIdx(nextIdx);
			processEvent(eventsRef.current[nextIdx]);
		}, ms);
		return () => {
			if (eventTimerRef.current) clearInterval(eventTimerRef.current);
		};
	}, [isPlaying, speed]); // eslint-disable-line

	// ── HELPERS ───────────────────────────────────────────────────────────────────
	const getPos = useCallback((id: string): { x: number; y: number } | null => {
		const n = nodesRef.current.find((n) => n.id === id);
		if (n && n.x != null) return { x: n.x, y: n.y };
		// Large client IDs from multi-client Jepsen tests: map cN → c(N%5)
		if (id.startsWith("c")) {
			const num = parseInt(id.slice(1), 10);
			const slotId = `c${isNaN(num) ? 0 : num % 5}`;
			return clientPosRef.current[slotId] ?? null;
		}
		return clientPosRef.current[id] ?? null;
	}, []);

	const spawnPacket = useCallback(
		(src: string, dest: string, color: string) => {
			const p1 = getPos(src),
				p2 = getPos(dest);
			if (!p1 || !p2) return;
			packetsRef.current.push({
				id: pktIdRef.current++,
				x1: p1.x,
				y1: p1.y,
				x2: p2.x,
				y2: p2.y,
				progress: 0,
				color,
			});
		},
		[getPos],
	);

	const spawnBurst = useCallback(
		(nodeId: string, count = 24) => {
			const pos = getPos(nodeId);
			if (!pos) return;
			burstsRef.current.push({
				id: burstIdRef.current++,
				x: pos.x,
				y: pos.y,
				particles: Array.from({ length: count }, () => ({
					angle: Math.random() * Math.PI * 2,
					speed: 1 + Math.random() * 3,
					life: 1,
				})),
			});
		},
		[getPos],
	);

	const spawnBitRing = useCallback(
		(nodeId: string, tsBits: string, nodeBits: string, seqBits: string) => {
			const pos = getPos(nodeId);
			if (!pos) return;
			bitRingsRef.current.push({
				id: bitRingIdRef.current++,
				x: pos.x,
				y: pos.y,
				progress: 0,
				tsBits,
				nodeBits,
				seqBits,
			});
		},
		[getPos],
	);

	const spawnConvergenceBurst = useCallback(() => {
		currentWorkers.forEach((n, i) =>
			setTimeout(() => spawnBurst(n, 32), i * 60),
		);
	}, [spawnBurst, currentWorkers]);

	// ── PROCESS EVENT ─────────────────────────────────────────────────────────────
	const processEvent = useCallback(
		(evt: ParsedEvent) => {
			const cid = challengeIdRef.current;
			setLogLines((prev) => [evt.raw, ...prev].slice(0, 80));

			// ── Nemesis (all challenges) ────────────────────────────
			if (evt.type === "nemesis") {
				if (evt.nemesis === "start-partition") {
					const grps = evt.partitionGroups ?? [
						["n0", "n1", "n2"],
						["n3", "n4"],
					];
					isPartitionedRef.current = true;
					partitionGroupsRef.current = grps;
					setIsPartitioned(true);
					linksRef.current.forEach((l) => {
						const ls =
							typeof l.source === "object"
								? (l.source as NodeDatum).id
								: (l.source as string);
						const lt =
							typeof l.target === "object"
								? (l.target as NodeDatum).id
								: (l.target as string);
						const si = grps.findIndex((g) => g.includes(ls));
						const ti = grps.findIndex((g) => g.includes(lt));
						l.severed = si !== ti && si !== -1 && ti !== -1;
					});
					const sim = simRef.current;
					if (sim) {
						sim
							.force("charge", d3.forceManyBody().strength(-400))
							.force(
								"partition",
								d3
									.forceX<NodeDatum>()
									.x((d) => {
										if (grps[0]?.includes(d.id))
											return canvasSizeRef.current.W / 2 - 120;
										if (grps[1]?.includes(d.id))
											return canvasSizeRef.current.W / 2 + 120;
										return canvasSizeRef.current.W / 2;
									})
									.strength(0.18),
							)
							.alpha(0.8)
							.restart();
					}
				} else if (evt.nemesis === "stop-partition") {
					isPartitionedRef.current = false;
					partitionGroupsRef.current = [];
					setIsPartitioned(false);
					linksRef.current.forEach((l) => {
						l.severed = false;
					});
					const sim = simRef.current;
					if (sim) {
						sim
							.force("partition", null)
							.force("charge", d3.forceManyBody().strength(-50))
							.alpha(0.6)
							.restart();
					}
					setTimeout(spawnConvergenceBurst, 200);
				}
				setMetrics((prev) => ({
					...prev,
					networkHealth: isPartitionedRef.current ? 0 : 100,
				}));
				return;
			}

			const isWorkerSrc = (currentWorkers as string[]).includes(evt.src);
			const isWorkerDest = (currentWorkers as string[]).includes(evt.dest);

			// ── Echo ────────────────────────────────────────────────
			if (cid === "echo") {
				if (evt.type === "echo" && isWorkerDest) {
					spawnPacket(evt.src, evt.dest, NEON_CYAN);
				} else if (evt.type === "echo_ok" && isWorkerSrc) {
					spawnPacket(evt.src, evt.dest, NEON_EMERALD);
					nodeSeqCountsRef.current[evt.src] =
						(nodeSeqCountsRef.current[evt.src] ?? 0) + 1;
					setNodeSeqCounts({ ...nodeSeqCountsRef.current });
				}
				setMetrics((prev) => ({
					...prev,
					totalOps: prev.totalOps + 1,
					networkHealth: 100,
					consensusDelta: 0,
					eventCount: prev.eventCount + 1,
				}));
			}

			// ── Unique ID ────────────────────────────────────────────
			else if (cid === "unique-id") {
				if (evt.type === "generate" && isWorkerDest) {
					spawnPacket(evt.src, evt.dest, NEON_VIOLET);
				} else if (evt.type === "generate_ok" && isWorkerSrc) {
					spawnPacket(evt.src, evt.dest, NEON_VIOLET);
					nodeSeqCountsRef.current[evt.src] =
						(nodeSeqCountsRef.current[evt.src] ?? 0) + 1;
					setNodeSeqCounts({ ...nodeSeqCountsRef.current });
					spawnBitRing(
						evt.src,
						evt.tsBits ?? "41b",
						evt.nodeBits ?? "10b",
						evt.seqBits ?? "12b",
					);
				}
				const total = Object.values(nodeSeqCountsRef.current).reduce(
					(a, b) => a + b,
					0,
				);
				setMetrics((prev) => ({
					...prev,
					totalOps: total,
					networkHealth: 100,
					consensusDelta: 0,
					eventCount: prev.eventCount + 1,
				}));
			}

			// ── Broadcast ────────────────────────────────────────────
			else if (cid === "broadcast") {
				const msg = evt.message;

				if (evt.type === "broadcast" && isWorkerDest && msg !== undefined) {
					// Client invokes broadcast on a node
					allMsgsSetRef.current.add(msg);
					nodeMsgSetsRef.current[evt.dest]?.add(msg);
					totalMessagesRef.current = allMsgsSetRef.current.size;
					setTotalMessages(totalMessagesRef.current);
					spawnPacket(evt.src, evt.dest, NEON_EMERALD);
				} else if (evt.type === "broadcast_ok" && isWorkerSrc) {
					spawnPacket(evt.src, evt.dest, NEON_EMERALD);
				} else if (
					evt.type === "gossip" &&
					isWorkerSrc &&
					isWorkerDest &&
					msg !== undefined
				) {
					nodeMsgSetsRef.current[evt.dest]?.add(msg);
					spawnPacket(evt.src, evt.dest, NEON_CYAN);
				} else if (evt.type === "read" && isWorkerDest) {
					// Client polls a node for its current message set
					spawnPacket(evt.src, evt.dest, NEON_AMBER);
				} else if (
					evt.type === "read_ok" &&
					isWorkerSrc &&
					evt.value !== undefined
				) {
					// Node responds with count of messages it knows — update per-node counter
					const reported = evt.value;
					nodeMessageCountsRef.current[evt.src] = Math.max(
						nodeMessageCountsRef.current[evt.src] ?? 0,
						reported,
					);
					setNodeMessageCounts({ ...nodeMessageCountsRef.current });
					spawnPacket(evt.src, evt.dest, NEON_AMBER);
				}

				// Recompute per-node counts from message sets (gossip/broadcast path)
				currentWorkers.forEach((n) => {
					const setSize = nodeMsgSetsRef.current[n]?.size ?? 0;
					if (setSize > (nodeMessageCountsRef.current[n] ?? 0)) {
						nodeMessageCountsRef.current[n] = setSize;
					}
				});
				setNodeMessageCounts({ ...nodeMessageCountsRef.current });

				// Convergence: fraction of nodes that know about as many messages as the most-informed node
				const counts = currentWorkers.map(
					(n) => nodeMessageCountsRef.current[n] ?? 0,
				);
				const maxCount = Math.max(...counts, 1);
				const minCount = Math.min(...counts);
				const conv = Math.round((minCount / maxCount) * 100);
				setConvergence(conv);
				const synced = counts.filter((c) => c >= maxCount).length;
				const health = isPartitionedRef.current ? 0 : conv;
				setMetrics((prev) => ({
					...prev,
					totalOps: prev.totalOps + 1,
					networkHealth: health,
					consensusDelta: currentWorkers.length - synced,
					eventCount: prev.eventCount + 1,
				}));
			}

			// ── G-Counter ────────────────────────────────────────────
			else {
				const vals = { ...nodeValuesRef.current };

				// Jepsen format: node is src on :ok events, dest on :invoke events.
				// Only :ok :read gives us the actual counter total at a node.
				if (evt.type === "read_ok" && isWorkerSrc && evt.value !== undefined) {
					vals[evt.src] = Math.max(vals[evt.src] ?? 0, evt.value);
				}
				// Legacy JSON format: gossip/write events carry value directly
				if (evt.type === "gossip" && isWorkerDest && evt.value !== undefined) {
					vals[evt.dest] = Math.max(vals[evt.dest] ?? 0, evt.value);
				}
				if (
					evt.type === "write" &&
					evt.dest === "seq-kv" &&
					evt.value !== undefined
				) {
					vals["seq-kv"] = Math.max(vals["seq-kv"] ?? 0, evt.value);
				}
				if (evt.type === "read_ok" && isWorkerDest && evt.value !== undefined) {
					vals[evt.dest] = Math.max(vals[evt.dest] ?? 0, evt.value);
				}

				nodeValuesRef.current = vals;
				setNodeValues({ ...vals });

				// Packet colour by operation type
				let pcolor = NEON_CYAN;
				if (evt.type === "add" || evt.type === "add_ok") pcolor = NEON_VIOLET;
				else if (evt.type === "gossip") pcolor = NEON_EMERALD;
				else if (evt.type === "read" || evt.type === "read_ok")
					pcolor = NEON_AMBER;

				// Resolve node endpoints — Jepsen: invoke has node as dest, ok has node as src
				const pktSrc = isWorkerSrc ? evt.src : isWorkerDest ? evt.src : null;
				const pktDest = isWorkerSrc ? evt.dest : isWorkerDest ? evt.dest : null;
				const seqKvSrc = evt.src === "seq-kv" ? evt.src : null;
				const seqKvDest = evt.dest === "seq-kv" ? evt.dest : null;

				const finalSrc =
					pktSrc ??
					seqKvSrc ??
					(isWorkerSrc ? evt.src : isWorkerDest ? evt.src : null);
				const finalDest =
					pktDest ??
					seqKvDest ??
					(isWorkerSrc ? evt.dest : isWorkerDest ? evt.dest : null);

				if (finalSrc && finalDest) spawnPacket(finalSrc, finalDest, pcolor);

				const maxV = Math.max(...currentWorkers.map((n) => vals[n] ?? 0), 1);
				const minV = Math.min(...currentWorkers.map((n) => vals[n] ?? 0));
				const conv = Math.round((minV / maxV) * 100);
				setConvergence(isPartitionedRef.current ? 0 : conv);
				setMetrics(
					computeGCounterMetrics(
						currentIdxRef.current,
						eventsRef.current,
						vals,
						isPartitionedRef.current,
					),
				);
			}
		},
		[spawnPacket, spawnBurst, spawnBitRing, spawnConvergenceBurst],
	);

	// ── CHALLENGE SWITCH ──────────────────────────────────────────────────────────
	const switchChallenge = useCallback((newId: ChallengeId) => {
		if (eventTimerRef.current) clearInterval(eventTimerRef.current);
		setIsPlaying(false);

		const newWorkers = CHALLENGE_CLUSTERS[newId];

		setChallengeId(newId);
		challengeIdRef.current = newId;
		setCurrentIdx(-1);
		currentIdxRef.current = -1;

		const freshValues = newWorkers.reduce((acc, n) => ({ ...acc, [n]: 0 }), {
			"seq-kv": 0,
		});
		const freshCounts = newWorkers.reduce((acc, n) => ({ ...acc, [n]: 0 }), {});
		const freshSets = newWorkers.reduce(
			(acc, n) => ({ ...acc, [n]: new Set() }),
			{},
		);

		nodeValuesRef.current = freshValues;
		setNodeValues(freshValues);

		nodeSeqCountsRef.current = freshCounts;
		setNodeSeqCounts(freshCounts);

		nodeMsgSetsRef.current = freshSets;
		nodeMessageCountsRef.current = { ...freshCounts };
		setNodeMessageCounts({ ...freshCounts });
		totalMessagesRef.current = 0;
		setTotalMessages(0);
		// Reset network
		isPartitionedRef.current = false;
		partitionGroupsRef.current = [];
		setIsPartitioned(false);
		linksRef.current.forEach((l) => {
			l.severed = false;
		});
		// Reset visuals
		packetsRef.current = [];
		burstsRef.current = [];
		bitRingsRef.current = [];
		// Reset UI
		setLogLines([]);
		setMetrics({
			totalOps: 0,
			networkHealth: 100,
			consensusDelta: 0,
			eventCount: 0,
		});
		setConvergence(100);
		// Load events
		const newEvents = getChallengeById(newId).getSimulatedEvents();
		setEvents(newEvents);
		eventsRef.current = newEvents;
	}, []);

	// ── RESET ─────────────────────────────────────────────────────────────────────
	const handleReset = useCallback(() => {
		switchChallenge(challengeIdRef.current);
		// Re-load the correct events for current challenge
		const newEvents = getChallengeById(
			challengeIdRef.current,
		).getSimulatedEvents();
		setTimeout(() => {
			setEvents(newEvents);
			eventsRef.current = newEvents;
		}, 20);
	}, [switchChallenge]);

	useEffect(() => {
		if (logRef.current) logRef.current.scrollTop = 0;
	}, [logLines]);

	// ── DERIVED ───────────────────────────────────────────────────────────────────
	const challenge = getChallengeById(challengeId);
	const maxNodeValue = Math.max(
		...currentWorkers.map((n) => nodeValues[n] ?? 0),
		1,
	);
	const healthColor =
		metrics.networkHealth > 75
			? NEON_EMERALD
			: metrics.networkHealth > 40
				? NEON_AMBER
				: NEON_RED;
	const totalMinted = Object.values(nodeSeqCounts).reduce((a, b) => a + b, 0);

	const m1Label =
		challengeId === "broadcast"
			? "TOTAL MSG"
			: challengeId === "unique-id"
				? "IDs MINTED"
				: "TOTAL OPS";
	const m1Val =
		challengeId === "broadcast"
			? String(totalMessages)
			: challengeId === "unique-id"
				? String(totalMinted)
				: String(metrics.totalOps);
	const m3Label =
		challengeId === "broadcast"
			? "CONVERGENCE"
			: challengeId === "g-counter"
				? "CONSENSUS Δ"
				: "INDEPENDENCE";
	const m3Val =
		challengeId === "broadcast"
			? `${convergence}%`
			: challengeId === "g-counter"
				? String(metrics.consensusDelta)
				: "100%";
	const m3Color =
		challengeId === "g-counter"
			? metrics.consensusDelta > 0
				? NEON_AMBER
				: NEON_EMERALD
			: challengeId === "broadcast"
				? convergence < 50
					? NEON_RED
					: convergence < 100
						? NEON_AMBER
						: NEON_EMERALD
				: NEON_EMERALD;

	// ── RENDER ────────────────────────────────────────────────────────────────────
	return (
		<div
			className="fixed inset-0 flex overflow-hidden"
			style={{
				background: "#020a16",
				fontFamily: "'JetBrains Mono','Fira Code',monospace",
			}}
		>
			<link
				href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap"
				rel="stylesheet"
			/>

			{/* ── LEFT: Command Center ─────────────────────────────────────────────── */}
			<aside
				className="flex flex-col gap-3 p-4 overflow-hidden shrink-0"
				style={{
					width: "20%",
					minWidth: 190,
					borderRight: "1px solid rgba(0,243,255,0.1)",
				}}
			>
				{/* Logo */}
				<div>
					<div className="flex items-center gap-2 mb-0.5">
						<GitFork size={32} color={NEON_CYAN} />
						<span
							style={{
								color: NEON_CYAN,
								fontSize: 32,
								letterSpacing: 3,
								fontWeight: 700,
							}}
						>
							MAELSTROM
						</span>
					</div>
					<div
						style={{
							color: "#334",
							fontSize: 20,
							letterSpacing: 1.5,
						}}
					>
						MATRIX
					</div>
				</div>

				<div
					style={{
						width: "100%",
						height: 1,
						background:
							"linear-gradient(to right,rgba(0,243,255,0.3),transparent)",
					}}
				/>

				{/* Challenge Selector */}
				<div>
					<div
						style={{
							color: "rgba(0,243,255,0.4)",
							fontSize: 20,
							letterSpacing: 1.5,
							marginBottom: 5,
						}}
					>
						── CHALLENGE ──
					</div>
					<div className="flex flex-col gap-1">
						{CHALLENGES.map((c) => (
							<button
								key={c.id}
								onClick={() => switchChallenge(c.id)}
								className="flex items-center gap-2 px-2 py-1.5 rounded text-left"
								style={{
									background:
										challengeId === c.id ? `${c.accentColor}12` : "transparent",
									border: `1px solid ${challengeId === c.id ? c.accentColor + "60" : "rgba(100,120,140,0.15)"}`,
									cursor: "pointer",
									fontFamily: "inherit",
									transition: "all 0.15s",
								}}
							>
								<span
									style={{
										color:
											challengeId === c.id
												? c.accentColor
												: "rgba(100,120,140,0.6)",
										fontSize: 18,
										fontWeight: 700,
										minWidth: 12,
									}}
								>
									{c.number}.
								</span>
								<span
									style={{
										color:
											challengeId === c.id
												? c.accentColor
												: "rgba(180,200,220,0.45)",
										fontSize: 18,
										letterSpacing: 0.5,
										textShadow:
											challengeId === c.id
												? `0 0 8px ${c.accentColor}`
												: "none",
									}}
								>
									{c.label}
								</span>
								{challengeId === c.id && (
									<span
										style={{
											marginLeft: "auto",
											color: c.accentColor,
											fontSize: 18,
										}}
									>
										▶
									</span>
								)}
							</button>
						))}
					</div>
				</div>

				{/* Mission Objective */}
				<div
					style={{
						background: "rgba(0,243,255,0.03)",
						border: "1px solid rgba(0,243,255,0.08)",
						borderRadius: 4,
						padding: "6px 8px",
					}}
				>
					<div
						style={{
							color: "rgba(0,243,255,0.4)",
							fontSize: 20,
							letterSpacing: 1,
							marginBottom: 4,
						}}
					>
						MISSION OBJECTIVE
					</div>
					<div
						style={{
							color: "rgba(180,210,255,0.65)",
							fontSize: 14,
							lineHeight: 1.5,
						}}
					>
						{challenge.missionObjective}
					</div>
					<div
						style={{
							marginTop: 8,
							display: "flex",
							alignItems: "center",
							gap: 4,
						}}
					>
						<span
							style={{
								color: "rgba(0,243,255,0.3)",
								fontSize: 14,
							}}
						>
							MODEL:
						</span>
						<span
							style={{
								color: challenge.accentColor,
								fontSize: 14,
								fontWeight: 700,
								textShadow: `0 0 6px ${challenge.accentColor}`,
							}}
						>
							{challenge.consistencyModel}
						</span>
					</div>
				</div>

				{/* Metrics */}
				<div className="flex flex-col gap-2">
					<MetricCard
						icon={<Activity size={18} color={NEON_CYAN} />}
						label={m1Label}
						value={m1Val}
						color={NEON_CYAN}
					/>
					<MetricCard
						icon={<Wifi size={18} color={healthColor} />}
						label="NET HEALTH"
						value={`${metrics.networkHealth}%`}
						color={healthColor}
					/>
					<MetricCard
						icon={<Cpu size={18} color={m3Color} />}
						label={m3Label}
						value={m3Val}
						color={m3Color}
					/>
				</div>

				{/* Node States */}
				<div
					style={{
						color: "rgba(0,243,255,0.35)",
						fontSize: 20,
						letterSpacing: 1,
					}}
				>
					── NODE STATES ──
				</div>
				<div className="flex flex-col gap-1" style={{ flex: 1, minHeight: 0 }}>
					{currentWorkers.map((n) => {
						let val = 0,
							col = NEON_CYAN;
						if (challengeId === "g-counter") {
							val = nodeValues[n] ?? 0;
							const lag = maxNodeValue - val;
							col = lag === 0 ? NEON_EMERALD : lag <= 5 ? NEON_AMBER : NEON_RED;
						} else if (challengeId === "broadcast") {
							val = nodeMessageCounts[n] ?? 0;
							col =
								totalMessages === 0
									? NEON_CYAN
									: val >= totalMessages
										? NEON_EMERALD
										: val > 0
											? NEON_AMBER
											: NEON_CYAN;
						} else if (challengeId === "unique-id") {
							val = nodeSeqCounts[n] ?? 0;
							col = NEON_VIOLET;
						} else {
							val = nodeSeqCounts[n] ?? 0;
							col = NEON_CYAN;
						}
						return (
							<div key={n} className="flex items-center justify-between">
								<span
									style={{
										color: "rgba(180,210,255,0.6)",
										fontSize: 12,
									}}
								>
									{n}
								</span>
								<span
									style={{
										color: col,
										fontSize: 14,
										fontWeight: 700,
										textShadow: `0 0 7px ${col}`,
									}}
								>
									{val}
								</span>
							</div>
						);
					})}
					{challengeId === "g-counter" && (
						<div
							className="flex items-center justify-between"
							style={{
								borderTop: "1px solid rgba(0,243,255,0.1)",
								paddingTop: 3,
								marginTop: 2,
							}}
						>
							<span
								style={{
									color: "rgba(0,243,255,0.5)",
									fontSize: 12,
								}}
							>
								seq-kv
							</span>
							<span
								style={{
									color: NEON_CYAN,
									fontSize: 14,
									fontWeight: 700,
									textShadow: `0 0 7px ${NEON_CYAN}`,
								}}
							>
								{nodeValues["seq-kv"] ?? 0}
							</span>
						</div>
					)}
				</div>

				{isPartitioned && (
					<div
						className="flex items-center gap-1.5 px-2 py-1.5 rounded"
						style={{
							background: "rgba(255,42,109,0.07)",
							border: "1px solid rgba(255,42,109,0.4)",
							animation: "pulse 1.2s ease-in-out infinite",
						}}
					>
						<WifiOff size={9} color={NEON_RED} />
						<span
							style={{
								color: NEON_RED,
								fontSize: 16,
								letterSpacing: 1,
							}}
						>
							PARTITION ACTIVE
						</span>
					</div>
				)}

				<div
					style={{
						color: "rgba(0,243,255,0.2)",
						fontSize: 18,
						textAlign: "center",
					}}
				>
					@neowsl
				</div>
			</aside>

			{/* ── CENTER: Matrix Stage ──────────────────────────────────────────────── */}
			<main className="relative flex flex-col" style={{ flex: 1 }}>
				{/* Top bar */}
				<div
					className="flex items-center justify-between px-4 py-2"
					style={{ borderBottom: "1px solid rgba(0,243,255,0.07)" }}
				>
					<div
						style={{
							color: "rgba(0,243,255,0.45)",
							fontSize: 14,
							letterSpacing: 2,
						}}
					>
						◈ DISTRIBUTED STATE MATRIX ◈
					</div>
					<div className="flex items-center gap-4">
						<StatusPill
							label="CHALLENGE"
							value={`${challenge.number}. ${challenge.label.toUpperCase()}`}
							color={challenge.accentColor}
						/>
						<StatusPill
							label="NODES"
							value={String(numWorkers)}
							color={NEON_EMERALD}
						/>
						<StatusPill
							label="STATUS"
							value={isPartitioned ? "PARTITIONED" : "HEALTHY"}
							color={isPartitioned ? NEON_RED : NEON_EMERALD}
						/>
					</div>
				</div>

				{/* Canvas */}
				<div className="relative flex-1 overflow-hidden">
					{isPartitioned && (
						<div
							className="absolute pointer-events-none"
							style={{
								inset: 0,
								background:
									"linear-gradient(to right,rgba(255,42,109,0.03) 0%,transparent 35%,transparent 65%,rgba(255,42,109,0.03) 100%)",
								zIndex: 1,
							}}
						/>
					)}
					<canvas
						ref={canvasRef}
						className="w-full h-full"
						style={{ display: "block" }}
					/>
					{/* Legend */}
					<div
						className="absolute bottom-2 left-1/2"
						style={{
							transform: "translateX(-50%)",
							display: "flex",
							gap: 8,
							alignItems: "center",
							background: "rgba(2,10,22,0.85)",
							border: "1px solid rgba(0,243,255,0.12)",
							borderRadius: 6,
							padding: "3px 10px",
							fontSize: 12,
							letterSpacing: 1,
						}}
					>
						<span style={{ color: NEON_EMERALD }}>● SYNCED</span>
						<span style={{ color: NEON_AMBER }}>● STALE</span>
						<span style={{ color: NEON_RED }}>● DIVERGED</span>
						{challengeId === "unique-id" && (
							<span style={{ color: NEON_VIOLET }}>● ID RING</span>
						)}
						{challengeId === "broadcast" && (
							<span style={{ color: NEON_CYAN }}>● GOSSIP</span>
						)}
						{challengeId === "g-counter" && (
							<span style={{ color: NEON_VIOLET }}>● ADD OP</span>
						)}
					</div>
				</div>

				{/* Convergence bar */}
				<div
					className="px-4 py-2 flex items-center gap-3"
					style={{ borderTop: "1px solid rgba(0,243,255,0.06)" }}
				>
					<div className="flex items-center gap-1.5">
						<BarChart2 size={9} color="rgba(0,243,255,0.4)" />
						<span
							style={{
								color: "rgba(0,243,255,0.4)",
								fontSize: 14,
								letterSpacing: 1.5,
								whiteSpace: "nowrap",
							}}
						>
							GLOBAL CONVERGENCE
						</span>
					</div>
					<div
						style={{
							flex: 1,
							height: 4,
							background: "rgba(0,243,255,0.07)",
							borderRadius: 2,
							overflow: "hidden",
						}}
					>
						<div
							style={{
								height: "100%",
								width: `${convergence}%`,
								background:
									convergence === 100
										? `linear-gradient(to right,${NEON_CYAN},${NEON_EMERALD})`
										: convergence > 50
											? `linear-gradient(to right,${NEON_AMBER},${NEON_CYAN})`
											: `linear-gradient(to right,${NEON_RED},${NEON_AMBER})`,
								boxShadow: `0 0 6px ${convergence === 100 ? NEON_EMERALD : convergence > 50 ? NEON_AMBER : NEON_RED}`,
								transition: "width 0.4s ease",
							}}
						/>
					</div>
					<span
						style={{
							color:
								convergence === 100
									? NEON_EMERALD
									: convergence > 50
										? NEON_AMBER
										: NEON_RED,
							fontSize: 14,
							fontWeight: 700,
							minWidth: 36,
							textAlign: "right",
							textShadow: `0 0 8px ${convergence === 100 ? NEON_EMERALD : NEON_AMBER}`,
						}}
					>
						{convergence}%
					</span>
				</div>

				{/* Event progress */}
				<div className="flex items-center gap-3 px-4 pb-2">
					<span style={{ color: "rgba(0,243,255,0.3)", fontSize: 14 }}>
						EVENT {Math.max(0, currentIdx + 1)}/{events.length}
					</span>
					<div
						style={{
							flex: 1,
							height: 2,
							background: "rgba(0,243,255,0.08)",
							borderRadius: 1,
							overflow: "hidden",
						}}
					>
						<div
							style={{
								height: "100%",
								width: `${((currentIdx + 1) / Math.max(events.length, 1)) * 100}%`,
								background: `linear-gradient(to right,${challenge.accentColor},${NEON_EMERALD})`,
								boxShadow: `0 0 5px ${challenge.accentColor}`,
								transition: "width 0.2s",
							}}
						/>
					</div>
				</div>
			</main>

			{/* ── RIGHT: Diagnostic Feed ────────────────────────────────────────────── */}
			<aside
				className="flex flex-col gap-3 p-4 overflow-hidden shrink-0"
				style={{
					width: "20%",
					minWidth: 185,
					borderLeft: "1px solid rgba(0,243,255,0.1)",
				}}
			>
				<div className="flex items-center gap-2">
					<Radio size={20} color={NEON_CYAN} />
					<span
						style={{
							color: NEON_CYAN,
							fontSize: 20,
							letterSpacing: 2,
							fontWeight: 700,
						}}
					>
						DIAGNOSTICS
					</span>
				</div>

				{/* Playback */}
				<div className="flex flex-col gap-2">
					<div
						style={{
							color: "rgba(0,243,255,0.4)",
							fontSize: 20,
							letterSpacing: 1,
						}}
					>
						── PLAYBACK ──
					</div>
					<div className="flex gap-2">
						<button
							onClick={() => setIsPlaying((p) => !p)}
							className="flex items-center gap-1.5 px-3 py-1.5 rounded"
							style={{
								background: isPlaying
									? "rgba(255,42,109,0.1)"
									: "rgba(0,243,255,0.08)",
								border: `1px solid ${isPlaying ? "rgba(255,42,109,0.4)" : "rgba(0,243,255,0.25)"}`,
								color: isPlaying ? NEON_RED : NEON_CYAN,
								fontSize: 16,
								cursor: "pointer",
								fontFamily: "inherit",
								letterSpacing: 1,
							}}
						>
							{isPlaying ? <Pause size={16} /> : <Play size={16} />}
							{isPlaying ? "PAUSE" : "PLAY"}
						</button>
						<button
							onClick={handleReset}
							style={{
								background: "rgba(100,100,120,0.08)",
								border: "1px solid rgba(100,100,120,0.18)",
								color: "rgba(180,200,220,0.5)",
								fontSize: 16,
								cursor: "pointer",
								fontFamily: "inherit",
								padding: "4px 8px",
								borderRadius: 4,
							}}
						>
							RST
						</button>
					</div>
					<div
						style={{
							color: "rgba(0,243,255,0.35)",
							fontSize: 18,
							letterSpacing: 1,
						}}
					>
						SPEED
					</div>
					<div className="flex gap-1">
						{[1, 2, 5].map((s) => (
							<button
								key={s}
								onClick={() => setSpeed(s)}
								style={{
									flex: 1,
									padding: "4px 0",
									borderRadius: 4,
									cursor: "pointer",
									fontFamily: "inherit",
									background:
										speed === s ? "rgba(0,243,255,0.12)" : "rgba(0,0,0,0.2)",
									border: `1px solid ${speed === s ? "rgba(0,243,255,0.45)" : "rgba(100,120,140,0.18)"}`,
									color: speed === s ? NEON_CYAN : "rgba(180,200,220,0.35)",
									fontSize: 14,
									fontWeight: speed === s ? 700 : 400,
									textShadow: speed === s ? `0 0 7px ${NEON_CYAN}` : "none",
								}}
							>
								{s}x
							</button>
						))}
					</div>
				</div>

				<div
					style={{
						width: "100%",
						height: 1,
						background:
							"linear-gradient(to right,rgba(0,243,255,0.25),transparent)",
					}}
				/>

				{/* Log terminal */}
				<div className="flex items-center gap-1.5">
					<Terminal size={18} color={NEON_CYAN} />
					<span
						style={{
							color: "rgba(0,243,255,0.45)",
							fontSize: 18,
							letterSpacing: 1.5,
						}}
					>
						RAW LOG STREAM
					</span>
				</div>
				<div
					ref={logRef}
					className="flex-1 overflow-y-auto"
					style={{
						background: "rgba(0,5,12,0.7)",
						border: "1px solid rgba(0,243,255,0.08)",
						borderRadius: 4,
						padding: "5px 7px",
						minHeight: 0,
					}}
				>
					{logLines.length === 0 ? (
						<div
							style={{
								color: "rgba(0,243,255,0.2)",
								fontSize: 14,
								textAlign: "center",
								marginTop: 20,
							}}
						>
							Press PLAY to begin
							<br />
							streaming events…
						</div>
					) : (
						logLines.map((line, i) => (
							<LogLine key={i} line={line} fresh={i === 0} />
						))
					)}
				</div>
			</aside>

			<style>{`
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.45} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-track{background:rgba(0,5,12,0.8)}
        ::-webkit-scrollbar-thumb{background:rgba(0,243,255,0.18);border-radius:2px}
      `}</style>
		</div>
	);
}

// ── SUB-COMPONENTS ────────────────────────────────────────────────────────────
function MetricCard({
	icon,
	label,
	value,
	color,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
	color: string;
}) {
	return (
		<div
			className="flex flex-col gap-1 px-2 py-1.5 rounded"
			style={{
				background: "rgba(0,243,255,0.03)",
				border: `1px solid ${color}18`,
				backdropFilter: "blur(4px)",
			}}
		>
			<div className="flex items-center gap-1.5">
				{icon}
				<span
					style={{
						color: "rgba(180,210,255,0.45)",
						fontSize: 16,
						letterSpacing: 1.5,
					}}
				>
					{label}
				</span>
			</div>
			<div
				style={{
					color,
					fontSize: 20,
					fontWeight: 700,
					lineHeight: 1,
					textShadow: `0 0 10px ${color}`,
				}}
			>
				{value}
			</div>
		</div>
	);
}

function StatusPill({
	label,
	value,
	color,
}: {
	label: string;
	value: string;
	color: string;
}) {
	return (
		<div className="flex items-center gap-1.5" style={{ fontSize: 14 }}>
			<span style={{ color: "rgba(180,210,255,0.28)", letterSpacing: 0.8 }}>
				{label}:
			</span>
			<span
				style={{
					color,
					fontWeight: 700,
					textShadow: `0 0 5px ${color}`,
					letterSpacing: 0.4,
				}}
			>
				{value}
			</span>
		</div>
	);
}

function LogLine({ line, fresh }: { line: string; fresh: boolean }) {
	let color = "rgba(0,243,255,0.5)";
	if (
		line.includes("echo_ok") ||
		line.includes("generate_ok") ||
		line.includes("broadcast_ok") ||
		line.includes("read_ok")
	)
		color = "rgba(0,255,157,0.75)";
	else if (line.includes("gossip") || line.includes("write"))
		color = "rgba(0,200,255,0.6)";
	else if (line.includes("partition") || line.includes("nemesis"))
		color = "rgba(255,42,109,0.95)";
	else if (line.includes(":add")) color = "rgba(180,77,255,0.8)";
	return (
		<div
			style={{
				fontSize: 12,
				lineHeight: 1.6,
				color,
				wordBreak: "break-all",
				borderBottom: "1px solid rgba(0,243,255,0.04)",
				paddingBottom: 2,
				marginBottom: 2,
				animation: fresh ? "fadeIn 0.15s ease-out" : "none",
			}}
		>
			<ChevronRight
				size={6}
				style={{
					display: "inline",
					marginRight: 2,
					color: "rgba(0,243,255,0.25)",
					verticalAlign: "middle",
				}}
			/>
			{line}
		</div>
	);
}
