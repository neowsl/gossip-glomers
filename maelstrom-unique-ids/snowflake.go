package main

import (
	"sync"
	"time"
)

// SnowflakeGen allows for generation of unique IDs.
// A SnowflakeGen is safe for concurrent use by multiple goroutines.
// The epoch and nodeId should be set when the node is initialised.
type SnowflakeGen struct {
	mu            sync.Mutex
	lastTimestamp int64
	epoch         int64
	nodeId        uint64
	sequence      uint64
}

// NextId returns a 64-bit unique id.
func (sg *SnowflakeGen) NextId() uint64 {
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
	return uint64(now-sg.epoch)<<22 | (sg.nodeId&0x3FF)<<12 | sg.sequence
}
