package main

import (
	"sync"
	"time"
)

type SnowflakeGen struct {
	mu            sync.Mutex
	lastTimestamp int64
	epoch         int64
	nodeId        uint64
	sequence      uint64
}

func (sg *SnowflakeGen) NextId() uint64 {
	sg.mu.Lock()
	defer sg.mu.Unlock()

	now := time.Now().UnixMilli()

	if now == sg.lastTimestamp {
		sg.sequence = (sg.sequence + 1) & 0xFFF
		// wait for next ms
		if sg.sequence == 0 {
			for now == sg.lastTimestamp {
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
