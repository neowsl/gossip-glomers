import type { ParsedEvent } from "../parser";
import type { SimulationEngine } from "../simulationEngine";

export { BroadcastStrategy } from "./broadcast";

export interface ChallengeStrategy {
    id: string;
    workers: string[];
    service?: string;

    processEvent(evt: ParsedEvent, engine: SimulationEngine): void;

    getNodeValue(nodeId: string, engine: SimulationEngine): number;
    getNodeColor(nodeId: string, engine: SimulationEngine): string;
    getDisplayString(nodeId: string, engine: SimulationEngine): string | null;
}
