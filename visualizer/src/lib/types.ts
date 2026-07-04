export type ChallengeId =
    | "echo"
    | "unique-ids"
    | "broadcast"
    | "g-counter"
    | "kafka-log";

export interface Point {
    x: number;
    y: number;
}
