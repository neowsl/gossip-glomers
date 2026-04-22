package server

import (
	"sync"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
	"gossip-glomers/internal/snowflake"
)

// Server provides a central structure and utility functions for communications.
type Server struct {
	n        *maelstrom.Node
	mu       sync.RWMutex
	sg       *snowflake.SnowflakeGen
	messages map[uint64]Message
	adj      []string
}

// NewServer creates a new instance of a server, requesting a new Maelstrom node
// in the process. It also initialises handlers for necessary messages.
func NewServer() *Server {
	s := Server{
		n:        maelstrom.NewNode(),
		messages: make(map[uint64]Message, 0),
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

// Run starts running the server, returning an error if anything fails.
func (s *Server) Run() error {
	return s.n.Run()
}
