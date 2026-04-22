package server

import (
	"encoding/json"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
	"gossip-glomers/internal/snowflake"
)

func (s *Server) handleInit(msg maelstrom.Message) error {
	s.mu.Lock()
	s.sg = snowflake.NewSnowflakeGen(s.n.ID())
	s.mu.Unlock()

	return nil
}

func (s *Server) handleTopology(msg maelstrom.Message) error {
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
}

func (s *Server) handleEcho(msg maelstrom.Message) error {
	var body map[string]any
	if err := json.Unmarshal(msg.Body, &body); err != nil {
		return err
	}

	body["type"] = "echo_ok"

	return s.n.Reply(msg, body)
}

func (s *Server) handleGenerate(msg maelstrom.Message) error {
	return s.n.Reply(msg, map[string]any{
		"type": "generate_ok",
		"id":   s.sg.NextId(),
	})
}

func (s *Server) handleBroadcast(msg maelstrom.Message) error {
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
}

// satisfy the handler for "broadcast_ok"
func (s *Server) handleBroadcastOk(msg maelstrom.Message) error {
	return nil
}

func (s *Server) handleRead(msg maelstrom.Message) error {
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
}
