package gcounter

import (
	"context"
	"gossip-glomers/internal/snowflake"
	"strconv"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

const (
	counterPrefix = "counter"
)

// Counter is a CRDT grow-only counter built on maelstrom's seq-kv.
type Counter struct {
	node *maelstrom.Node
	kv   *maelstrom.KV
	gen  *snowflake.Generator
}

// NewCounter creates a new Counter.
func NewCounter(node *maelstrom.Node) *Counter {
	return &Counter{
		node: node,
		kv:   maelstrom.NewSeqKV(node),
		gen:  snowflake.NewGenerator(node.ID()),
	}
}

// Add increments the Counter by delta.
func (c *Counter) Add(delta int) {
	ctx := context.Background()

	// each node writes to a unique key, so no write contention
	currVal, err := c.kv.ReadInt(ctx, counterPrefix+":"+c.node.ID())
	if err != nil {
		currVal = 0
	}

	c.kv.Write(ctx, counterPrefix+":"+c.node.ID(), currVal+delta)
}

// Read returns the current value of the Gounter.
func (c *Counter) Read() int {
	ctx := context.Background()

	// since the KV store is sequentially consistent, "force" an update by
	// making a write call
	barrierKey := strconv.FormatUint(c.gen.NextID(), 10) + "-barrier"
	c.kv.Write(ctx, barrierKey, 0)

	sum := 0
	for _, id := range c.node.NodeIDs() {
		val, err := c.kv.ReadInt(ctx, counterPrefix+":"+id)
		if err != nil {
			val = 0
		}
		sum += val
	}

	return sum
}
