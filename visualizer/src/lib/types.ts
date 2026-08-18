export type ChallengeId =
    | "echo"
    | "unique-ids"
    | "broadcast"
    | "g-counter"
    | "kafka-log"
    | "txn-store";

export interface Point {
    x: number;
    y: number;
}
