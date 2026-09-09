# Idempotency

## Introduction

Idempotency is a property of an operation where applying it once has the same effect as applying it multiple times. Formally,

$$
[f(x) equiv f(f(x))] -> "idempotent(f)"
$$

Idempotency is an important property to enforce in distributed systems. A classic example is ordering fast food. Consider the following series of events:

1. I tap "Place Order" on my McDonald's app.
2. The server accepts the order and responds with a confirmation.
3. The returning connection between the client and the server drops.
4. My phone tells me my order didn't go through.
5. In hangry frustration, I tap "Place Order" two more times.
6. The server accepts two more identical orders and charges me two more times.
7. My big back receives three Big Macs.

## Implementation

There are many ways to implement idempotency in a system. In Maelstrom Matrix, my go-to solution was to attach a [Snowflake ID](concepts/snowflake-ids.md) to each operation. The server then keeps track of every ID it has seen and simply rejects any duplicate IDs. So now,

1. I tap "Place Order" on my McDonald's app. Along with my order, my phone attaches an `ID = 1` idempotency key.
2. The server accepts the order, remembers `ID = 1`, and responds with a confirmation.
3. The returning connection between the client and the server drops.
4. My phone tells me my order didn't go through.
5. In hangry frustration, I tap "Place Order" two more times. Since my phone received no confirmation from the server, it attaches `ID = 1` to both orders.
6. The server remembers previously seeing `ID = 1` and rejects the two incoming orders.
7. Even though I never got a confirmation, I'm pleasantly surprised when my food arrives.

Brilliant.
