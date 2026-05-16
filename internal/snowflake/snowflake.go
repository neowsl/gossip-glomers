package snowflake

import (
	"strconv"
	"strings"
	"sync"
	"time"
)

// SnowflakeGen allows for generation of unique IDs.
// A SnowflakeGen is safe for concurrent use by multiple goroutines.
// The epoch and nodeID should be set when the node is initialised.
type SnowflakeGen struct {
	nodeID        uint64
	epoch         int64
	mu            sync.Mutex
	lastTimestamp int64
	sequence      uint64
}

// NewSnowflakeGen creates and initialises a new SnowflakeGen with the given
// nodeID.
func NewSnowflakeGen(nodeID string) *SnowflakeGen {
	idStr := strings.TrimPrefix(nodeID, "n")
	nodeIDUint, _ := strconv.ParseUint(idStr, 10, 64)

	epoch := time.Date(2026, time.April, 17, 0, 0, 0, 0, time.UTC)
	epochMs := epoch.UnixMilli()

	return &SnowflakeGen{
		nodeID: nodeIDUint,
		epoch:  epochMs,
	}
}

// NextID returns a 64-bit unique ID.
// NextID is safe to call concurrently with other operations and will block
// until all other operations finish.
func (sg *SnowflakeGen) NextID() uint64 {
	sg.mu.Lock()
	defer sg.mu.Unlock()

	now := time.Now().UnixMilli()

	if now == sg.lastTimestamp {
		sg.sequence = (sg.sequence + 1) & 0xFFF
		// wait for next ms
		if sg.sequence == 0 {
			for now <= sg.lastTimestamp {
				now = time.Now().UnixMilli()
			}
		}
	} else {
		sg.sequence = 0
	}

	sg.lastTimestamp = now

	// bits: |------ 41 ------|-- 10 ---|--- 12 ---|
	//       | ms since epoch | node id | sequence |
	return uint64(now-sg.epoch)<<22 | (sg.nodeID&0x3FF)<<12 | sg.sequence
}
