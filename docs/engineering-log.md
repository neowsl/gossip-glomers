# Engineering Log


## 1. Echo

Pretty self-explanatory, just followed the tutorial for setting up a Maelstrom node. It was cool seeing the test suite blur across my terminal!

## 2. Unique ID Generation

Having no prior experience in distributed systems, this was already an interesting challenge. I did some research and learned that companies like Twitter use a [Snowflake ID](https://en.wikipedia.org/wiki/Snowflake_ID), which looks like this:

```
bits: |------ 41 ------|-- 10 ---|--- 12 ---|
      | ms since epoch | node id | sequence |
```

Where:

- `ms since epoch` is the number of Unix milliseconds after a set epoch (beware of time skips!)
- `node id` is the ID of the current node. This was given by the Maelstrom suite, but in a real-world scenario, we'd probably use something like a config file.
- `sequence` is a running mutexed counter that is commonly used to help piece together order of events. It also lets us ID multiple messages in a single millisecond!

After finishing, I collected and refactored all the ID generation logic into a struct in `snowflake.go`.

### Design decisions

- I used the above scheme of bits to mimic Twitter's own standard. However, if we have less machines running, we can shrink the size of `node id`, or if less throughput is necessary, we can shrink the size of `sequence`.
- Extra bits are always fun to play with! Perhaps a parity bit for error checking, or a few bits could signify the priority/type of message?
- Why the line `now <= sg.lastTimestamp`? Time skips can occur, and if `now` is stepped backwards, we could potentially hand out an ID we already used. `<=` lets us avoid this problem.

## 3a. Single-Node Broadcast

A bit easier than "Unique ID Generation". Simply store all incoming messages in a `int` slice, then send them out upon request. Remember to use a **mutex** to lock edits to the messages!

## 3b. Multi-Node Broadcast

Significantly harder than "Single-Node Broadcast". The main challenge was preventing "infinite broadcast cycles", where nodes would broadcast the same message back and forth. To prevent this, I stored the messages in a `map[snowflake.ID]int` instead, where the key is a unique ID (shoutout "Unique ID Generation"!) and value is the actual message. When a node receives a message, it first checks if it has seen its ID, and only proceeds if not.

### Design decisions

- I used a map instead of a set, because the keys of the map allow us to uniquely identify messages, allowing things like duplicate messages!
- If the messages were larger, nodes could proactively "probe" their sendees to check if they've already received the message, potentially reducing the amount of data sent over a network.
- I learned that the unique IDs (snowflakes) enforce a concept known as **idempotency**, where duplicate operations only produce one result :)

## 3c. Fault Tolerant Broadcast

Some really interesting problems here! In order to preserve and forward messages after a network partitions and heals, a lot more work has to be done.

💡 I essentially got to experience the [Two Generals' Problem](https://www.youtube.com/watch?v=IP-rGJKSZ3s) firsthand!

### Design decisions

- I implemented an "outgoing" map of neighbouring nodes to Go **channels**. Channels are really nice here because they are essentially concurrency-safe queues. Reminds me of RabbitMQ from a previous internship!
- To prevent overloading the network, I refactored the prior "gossiping" code to consume a list of messages at once, allowing for outgoing messages to be **batched**.
- Another cool idea is **exponential backoff**, where each subsequent retry of a `SendRPC` takes exponentially longer. This, combined with a **jitter**, prevents the **thundering herd** problem, where a huge amount of data is sent the moment a network heals.

## 3d/e. Efficient Broadcast

I didn't have to change much since I started with a well-designed system.

### Metrics

- Messages-per-operation: 8.63
- Median latency: 890ms
- Maximum latency: 1503ms

## 4. Grow-Only Counter

I thought this would be an easy challenge. My first approach was to simply add all deltas to a central KV store using a single key. I learned how to use `CompareAndSwap` (**CAS**) to test for the previous value before updates to ensure consistency. I then wrapped the add code into a **retry loop** to update the values while probing for consistency.

However, this approach failed as some nodes returned incorrect values at the end. One way I alleviated this issue was to have each node write to its own key, so that there's no write contention between nodes. Qualitatively, this reduced the likelihood of failing the Jepsen test, but I was occasionally still getting invalid results.

After digging around, I found this [comment by aphyr](https://github.com/jepsen-io/maelstrom/issues/39#issuecomment-1445414521). That's when it clicked - the provided KV store is guaranteed to be **sequentially consistent when observed**. This means that if event B happens after event A in one node's timeline, event B must happen after event A in *every node's timeline*.

So, putting the pieces together: I was seeing incorrect values initially because in the final few seconds, it was possible to read/observe a stale value (because a stale value technically satisfies the "sequentially consistent" guarantee). However, if we perform a "junk" operation (e.g. a write operation to a UUID key), we force the KV store to give us the most recent values on the next observation. And that's the solution!

### Design decisions

- Every node wrote to its own unique key (based on its ID) to avoid write contention across nodes.
- A "junk" or "barrier" operation is performed before every read to guarantee the lastest values.

## 5a. Single-Node Kafka-Style Log

A fairly straightforward challenge. I learned how Go's interface system works!

### Design decisions

- I initially thought that "committing" an offset meant that older messages can be deleted. While this is true of services like RabbitMQ, Kafka preserves *all* messages. The offset serves as a "bookmark" for the client rather than the server.
- I used the **dependency injection** design pattern: `logstore.Store` is an interface that can have multiple implementations, such as the `logstore.InMemoryStore` for this part of the challenge. Then, by changing the command-line arguments, we can programmatically select which implementation of `logstore.Store` to use!

## 5b. Multi-Node Kafka-Style Log

Also a fairly simple migration from the `logstore.InMemoryStore` to a `DistributedStore` using the `lin-kv` service. Linearisability and sequential consistency are both classified as CP in in the [CAP theorem](https://en.wikipedia.org/wiki/CAP_theorem). However, linearizability guarantees global real-time synchronisation (i.e. no stale reads) at the cost of increased latency.

### Design decisions

- I used **disjoint domain prefixing** to prevent collisions between log and offset keys, resulting in a **66x** improvement in throughput (mainly since the original solution was chopped).

### Metrics

- Messages-per-operation: 4.78
- Availability: 99.96%

---

♻️ Since the upcoming challenges are beginning to get very tricky, it was at this point when I refactored the underlying server architecture. I split the individual services and handlers into separate files and used a **routing table** to string everything together. This decoupled the services, allowing for higher **orthagonality** in my code. The old architecture can be found on [this commit](https://github.com/neowsl/maelstrom-matrix/tree/df03d59afb5f886ddd2921cdc2070343c70ac8b1).

## 5c. Efficient Kafka-Style Log

This challenge was really cool. Looking at the **Lamport diagrams** from 5b, there was a lot of Compare-and-Swap contention, which was overloading the `lin-kv` service.

### Design decisions

- I **hashed** each key to map it to a specific node, then routed logs to their respective nodes using `SyncRPC`.
- This **scatter-gather** approach allowed each node to own a set of unique keys, completely eliminating CAS contention and allowing logs to be stored in a `MemoryLogStore`.
- I would like to explore **partitioning** within a key (e.g. based on timestamp) to distribute load on hot keys.
- I would also like to explore **consistent hashing** in the future to avoid massive data shifts when nodes are added or dropped.

### Metrics

- Messages-per-operation: 1.39
- Availability: 99.96%

## 6a. Single-Node, Totally-Available Transactions

A fairly straightforward challenge and an intro to **MVCC**. The goal was to support transactions containing multiple Read/Write operations with **weak consistency** while guaranteeing **total availability**.

### Design decisions

- Rather than making each transaction atomic, I instead treated each operation as atomic. This meant that writes may be interwoven between transactions, which is allowable in weak consistency.
- This was also a fun challenge to explore handling JSON serde with Go. Null pointers were a real pain though...
- This challenge was also by far the most difficult to architect; I tried to make my interfaces reusable for the upcoming iterations of this challenge, but may very well need to make some more abstractions.

♻️ The following challenges reuse much of my broadcasting code from Challenge 3, so I decided to pull out the retry/backoff logic into a `mailbox` library! I also used Go generics to generalise `transactions.InMemoryStore` to support 6b and 6c.

## 6b. Totally-Available, Read Uncommitted Transactions

An extremely interesting challenge, not just from a dist-sys angle, but from an architectural perspective as well. I refactored so much of the codebase...

This challenge emphasised a [Read Uncommitted](https://jepsen.io/consistency/models/read-uncommitted) model, so I had to guarantee **no dirty writes** - i.e. writes from separate transactions must not get entangled. The main lesson of this challenge was understanding which operations/values to keep. Since this challenge required **total availability**, I figured Read operations must make direct queries into the current local state of each node. Therefore, the challenge lied in how to handle Write operations.

I used a **LWW (Last-Write-Wins)** model for determining which writes to keep. When a transaction is received, it is immediately **replicated** across all nodes. Since this replication uses Mailbox Envelopes, each transaction is also tied to a Snowflake ID (shoutout Challenge 2 again)! These Snowflake IDs increase with time, so we can implement LWW by simply keeping the largest Snowflake ID of the writes!

💡 [Apache Cassandra](https://cassandra.apache.org/_/index.html) is a distributed database that uses LWW!

💡 Snowflake IDs are extremely useful for this challenge because they solve many of the core problems addressed by [Lamport Clocks](https://lamport.azurewebsites.net/pubs/time-clocks.pdf) while also remaining decentralised and thus totally available.

### Design decisions

- I reused code from Challenge 2's Snowflake, Challenge 3's Mailbox, and Challenge 6a's InMemoryStore!
- Replicated Write operations are handled with a LWW policy for low latency and total availability.
- Read operations observe the current local state of each node.

## 6c. Totally-Available, Read Committed Transactions

One of, if not the, hardest challenge here conceptually. This challenge emphasised a [Read Committed](https://jepsen.io/consistency/models/read-committed) model, which on top of Read Uncommitted, added the requirement of **no dirty reads** - i.e. reads must not view uncommitted writes.

After reading through *Designing Data-Intensive Applications*, I settled on an **multiversion concurrency control (MVCC)** implementation.

### Design decisions

- Much of the code is similar to Challenge 6b, including replication and LWW-ordering.
- Transactions performed on an **atomic snapshot** of the state of a store. Since these snapshots are decoupled, no transaction blocks another (aside from a minute bit of time required to perform a snapshot).
- After applying a transaction, the snapshot is then **atomically written** using LWW rules.
