package snowflake

import (
	"strconv"
	"strings"
	"sync"
	"time"
)

// Generator allows for generation of unique IDs.
// A Generator is safe for concurrent use by multiple goroutines.
// The epoch and nodeID should be set when the node is initialised.
type Generator struct {
	nodeID        uint64
	epoch         int64
	mu            sync.Mutex
	lastTimestamp int64
	sequence      uint64
}

// NewGenerator creates and initialises a new Generator with the given nodeID.
func NewGenerator(nodeID string) *Generator {
	idStr := strings.TrimPrefix(nodeID, "n")
	nodeIDUint, _ := strconv.ParseUint(idStr, 10, 64)

	epoch := time.Date(2026, time.July, 6, 0, 0, 0, 0, time.UTC)
	epochMs := epoch.UnixMilli()

	return &Generator{
		nodeID: nodeIDUint,
		epoch:  epochMs,
	}
}

// NextID returns a 64-bit unique ID.
// NextID is safe to call concurrently with other operations and will block
// until all other operations finish.
func (g *Generator) NextID() uint64 {
	g.mu.Lock()
	defer g.mu.Unlock()

	now := time.Now().UnixMilli()

	if now == g.lastTimestamp {
		g.sequence = (g.sequence + 1) & 0xFFF
		// wait for next ms
		if g.sequence == 0 {
			for now <= g.lastTimestamp {
				now = time.Now().UnixMilli()
			}
		}
	} else {
		g.sequence = 0
	}

	g.lastTimestamp = now

	// bits: |------ 41 ------|-- 10 ---|--- 12 ---|
	//       | ms since epoch | node id | sequence |
	return uint64(now-g.epoch)<<22 | (g.nodeID&0x3FF)<<12 | g.sequence
}
