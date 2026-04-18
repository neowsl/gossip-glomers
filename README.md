# Gossip Glomers

> Having fun with distributed systems :)

In my ongoing efforts to procrastinate from schoolwork, I stumbled across this challenge, [Gossip Glomers](https://fly.io/dist-sys) by [Fly.io](https://fly.io). I thought it'd be a nice way to develop some Go skills while also learning about distributed systems!

<img src="https://madebyhuman.iamjarl.com/badges/crafted-white.svg" alt="Crafted by Human" width="180" height="60">

## Challenges

### 1. Echo

Pretty self-explanatory, just followed the tutorial for setting up a Maelstrom node. It was cool seeing the test suite blur across my terminal!

### 2. Unique ID Generation

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

**Design decisions**:
- I used the above scheme of bits to mimic Twitter's own standard. However, if we have less mac hines running, we can shrink the size of `node id`, or if less throughput is necessary, we can shrink the size of `sequence`.
- Extra bits are always fun to play with! Perhaps a parity bit for error checking, or a few bits could signify the priority/type of message?
- Why the line `now <= sg.lastTimestamp`? Time skips can occur, and if `now` is stepped backwards, we could potentially hand out an ID we already used. `<=` lets us avoid this problem.
