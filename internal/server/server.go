package server

import (
	"context"
	"math/rand"
	"sync"
	"time"

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
}

// NewServer creates a new instance of a server, requesting a new Maelstrom node
// in the process. It also initialises handlers for necessary messages.
func NewServer() *Server {
	s := Server{
		n:        maelstrom.NewNode(),
		messages: make(map[uint64]Message, 0),
		outgoing: make(map[string]chan Message),
	}

	s.n.Handle("init", s.handleInit)
	s.n.Handle("topology", s.handleTopology)
	s.n.Handle("echo", s.handleEcho)
	s.n.Handle("generate", s.handleGenerate)
	s.n.Handle("broadcast", s.handleBroadcast)
	s.n.Handle("gossip", s.handleGossip)
	s.n.Handle("read", s.handleRead)

	return &s
}

// spawnNeighbourWorker() spawns a new goroutine that consumes messages from
// `ch` and forwards them to `dest`, waiting until `dest` becomes responsive if
// it goes offline.
func (s *Server) spawnNeighbourWorker(dest string, ch chan Message) {
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
		for {
			// exponential backoff
			backoff := 50 * time.Millisecond
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
