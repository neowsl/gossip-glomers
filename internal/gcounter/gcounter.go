package gcounter

import (
	"context"
	"gossip-glomers/internal/snowflake"
	"strconv"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

const (
	CounterKey = "counter"
)

// GCounter is a grow-only counter.
type GCounter struct {
	n  *maelstrom.Node
	kv *maelstrom.KV
	sg *snowflake.SnowflakeGen
}

// NewGCounter creates a new GCounter with the provided maelstrom store client.
func NewGCounter(node *maelstrom.Node, kv *maelstrom.KV) *GCounter {
	return &GCounter{
		n:  node,
		kv: kv,
		sg: snowflake.NewSnowflakeGen(node.ID()),
	}
}

// Add increments the GCounter by delta.
func (c *GCounter) Add(delta int) {
	ctx := context.Background()

	// each node writes to a unique key, so no write contention
	currVal, err := c.kv.ReadInt(ctx, c.n.ID()+"-"+CounterKey)
	if err != nil {
		currVal = 0
	}

	c.kv.Write(ctx, c.n.ID()+"-"+CounterKey, currVal+delta)
}

// Read returns the current value of the GCounter.
func (c *GCounter) Read() int {
	ctx := context.Background()

	// since the KV store is sequentially consistent, "force" an update by
	// making a write call
	barrierKey := strconv.FormatUint(c.sg.NextID(), 10) + "-barrier"
	c.kv.Write(ctx, barrierKey, 0)

	sum := 0
	for _, id := range c.n.NodeIDs() {
		val, err := c.kv.ReadInt(ctx, id+"-"+CounterKey)
		if err != nil {
			val = 0
		}
		sum += val
	}

	return sum
}
