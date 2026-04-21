package main

import (
	"encoding/json"
	"sync"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

// Server provides a central structure and utility functions for communications.
type Server struct {
	n        *maelstrom.Node
	mu       sync.RWMutex
	sg       *SnowflakeGen
	messages map[uint64]int
	adj      []string
}

type TopologyBody struct {
	Type     string              `json:"type"`
	Topology map[string][]string `json:"topology"`
}

type BroadcastBody struct {
	Type    string `json:"type"`
	Message int    `json:"message"`
	Id      *int64 `json:"id,omitempty"`
}

// NewServer creates a new instance of a server, requesting a new Maelstrom node
// in the process. It also initialises handlers for necessary messages.
func NewServer() *Server {
	s := Server{
		n:        maelstrom.NewNode(),
		messages: make(map[uint64]int, 0),
	}

	s.n.Handle("init", func(msg maelstrom.Message) error {
		s.mu.Lock()
		s.sg = NewSnowflakeGen(s.n.ID())
		s.mu.Unlock()

		return nil
	})

	s.n.Handle("topology", func(msg maelstrom.Message) error {
		var body TopologyBody
		if err := json.Unmarshal(msg.Body, &body); err != nil {
			return err
		}

		s.mu.Lock()
		s.adj = body.Topology[s.n.ID()]
		s.mu.Unlock()

		return s.n.Reply(msg, map[string]any{
			"type": "topology_ok",
		})
	})

	s.n.Handle("broadcast", func(msg maelstrom.Message) error {
		var body BroadcastBody
		if err := json.Unmarshal(msg.Body, &body); err != nil {
			return err
		}

		var id uint64

		s.mu.Lock()

		if body.Id != nil {
			id = uint64(*body.Id)
			// incoming from other node
			if _, seen := s.messages[id]; seen {
				s.mu.Unlock()
				// prevent infinite cycle if id already seen
				return s.n.Reply(msg, map[string]any{
					"type": "broadcast_ok",
				})
			}
		} else {
			// incoming from external source, so generate new id
			id = s.sg.NextId()
		}

		s.messages[id] = body.Message

		s.mu.Unlock()

		for _, n := range s.adj {
			s.n.Send(n, map[string]any{
				"type":    "broadcast",
				"id":      id,
				"message": body.Message,
			})
		}

		return s.n.Reply(msg, map[string]any{
			"type": "broadcast_ok",
		})
	})

	s.n.Handle("broadcast_ok", func(msg maelstrom.Message) error {
		return nil
	})

	s.n.Handle("read", func(msg maelstrom.Message) error {
		messages := make([]int, 0, len(s.messages))

		s.mu.RLock()
		for _, message := range s.messages {
			messages = append(messages, message)
		}
		s.mu.RUnlock()

		return s.n.Reply(msg, map[string]any{
			"type":     "read_ok",
			"messages": messages,
		})
	})

	return &s
}

// Run starts running the server, returning an error if anything fails.
func (s *Server) Run() error {
	return s.n.Run()
}
