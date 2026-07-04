package server

import (
	"context"
	"math/rand"
	"sync"
	"time"

	"gossip-glomers/internal/gcounter"
	"gossip-glomers/internal/logstore"
	"gossip-glomers/internal/snowflake"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

const (
	MessagesPerBatch = 20
	MaxBackoff       = 3 * time.Second
)

// Server provides a central structure and utility functions for communications.
type Server struct {
	n        *maelstrom.Node
	mu       sync.RWMutex
	sg       *snowflake.SnowflakeGen
	messages map[uint64]Message
	adj      []string
	outgoing map[string]chan Message
	gc       gcounter.GCounter
	ls       logstore.LogStore
}

// NewServer creates a new instance of a server, requesting a new Maelstrom node
// in the process. It also initialises handlers for necessary messages.
func NewServer(challengeID *string) *Server {
	n := maelstrom.NewNode()

	var ls logstore.LogStore
	switch *challengeID {
	case "5a":
		ls = logstore.NewMemoryLogStore()
	case "5b":
		ls = logstore.NewDistributedLogStore(n)
	}

	s := Server{
		n:        n,
		messages: make(map[uint64]Message, 1024),
		outgoing: make(map[string]chan Message),
		gc:       *gcounter.NewGCounter(n),
		ls:       ls,
	}

	// challenge 1
	n.Handle("init", s.handleInit)
	n.Handle("topology", s.handleTopology)
	n.Handle("echo", s.handleEcho)
	// challenge 2
	n.Handle("generate", s.handleGenerate)
	// challenge 3
	n.Handle("broadcast", s.handleBroadcast)
	n.Handle("gossip", s.handleGossip)
	// challenge 4
	n.Handle("add", s.handleAdd)
	if (*challengeID)[0] == '3' {
		n.Handle("read", s.handleRead3)
	} else {
		n.Handle("read", s.handleRead4)
	}
	// challenge 5
	n.Handle("send", s.handleSend)
	n.Handle("poll", s.handlePoll)
	n.Handle("commit_offsets", s.handleCommitOffsets)
	n.Handle("list_committed_offsets", s.handleListCommittedOffsets)

	return &s
}

// spawnNeighbourWorker() spawns a new goroutine that consumes messages from
// `ch` and forwards them to `dest`, waiting until `dest` becomes responsive if
// it goes offline.
func (s *Server) spawnNeighbourWorker(dest string, ch <-chan Message) {
	for firstMsg := range ch {
		// batch-send messages to avoid overloading network
		// prepare batch first, then commit to sending (otherwise data will be
		// lost)
		batch := []Message{firstMsg}

		for range MessagesPerBatch - 1 {
			// select for safe concurrency
			select {
			case m := <-ch:
				batch = append(batch, m)
			default:
				goto send
			}
		}

	send:
		// exponential backoff
		backoff := 50 * time.Millisecond
		for {
			// some black magic to prevent memory leaks from `defer cancel()`
			success := func() bool {
				ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
				defer cancel()

				// SyncRPC will error if message was not received (i.e. we will get an
				// ACK if message was received).
				_, err := s.n.SyncRPC(ctx, dest, map[string]any{
					"type":     "gossip",
					"messages": batch,
				})

				return err == nil
			}()

			if success {
				// success, move onto next batch of messages in channel
				break
			}

			time.Sleep(backoff)
			// double backoff to prevent "stampeding"
			backoff = min(MaxBackoff, backoff*2)
			backoff += time.Duration(rand.Intn(50)) * time.Millisecond
		}
	}
}

// Run starts running the server, returning an error if anything fails.
func (s *Server) Run() error {
	return s.n.Run()
}
