package server

import (
	"encoding/json"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
	"gossip-glomers/internal/snowflake"
)

// handleInit should be invoked when the node first becomes online, allowing for
// seeding of this server's snowflakes.
func (s *Server) handleInit(msg maelstrom.Message) error {
	s.mu.Lock()
	s.sg = snowflake.NewSnowflakeGen(s.n.ID())
	s.mu.Unlock()

	return nil
}

// handleTopology parses and initialises the network's topology (which nodes
// neighbour each other).
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

// handleEcho responds with a message of the same body and of type "echo_ok".
func (s *Server) handleEcho(msg maelstrom.Message) error {
	var body map[string]any
	if err := json.Unmarshal(msg.Body, &body); err != nil {
		return err
	}

	body["type"] = "echo_ok"

	return s.n.Reply(msg, body)
}

// handleGenerate responds with a unique ID, which is a uint64.
func (s *Server) handleGenerate(msg maelstrom.Message) error {
	return s.n.Reply(msg, map[string]any{
		"type": "generate_ok",
		"id":   s.sg.NextId(),
	})
}

// handleBroadcast takes a message and broadcasts it to all neighbouring nodes.
func (s *Server) handleBroadcast(msg maelstrom.Message) error {
	var body BroadcastBody
	if err := json.Unmarshal(msg.Body, &body); err != nil {
		return err
	}

	newMessage := Message{
		Snowflake: s.sg.NextId(),
		Content:   body.Message,
	}

	s.mu.Lock()
	s.messages[newMessage.Snowflake] = newMessage
	s.mu.Unlock()

	for _, n := range s.adj {
		s.n.Send(n, map[string]any{
			"type":     "gossip",
			"messages": []Message{newMessage},
		})
	}

	return s.n.Reply(msg, map[string]any{
		"type": "broadcast_ok",
	})
}

// handleGossip takes a list of messages and relays them to neighbouring nodes.
func (s *Server) handleGossip(msg maelstrom.Message) error {
	var body GossipBody
	if err := json.Unmarshal(msg.Body, &body); err != nil {
		return err
	}

	// only send new messages to avoid infinite cycle
	newMessages := make([]Message, 0, len(body.Messages))

	s.mu.Lock()
	for _, message := range body.Messages {
		// prevent infinite cycle if already seen
		if _, seen := s.messages[message.Snowflake]; seen {
			continue
		}

		s.messages[message.Snowflake] = message
		newMessages = append(newMessages, message)
	}
	s.mu.Unlock()

	// stop gossip chain if no new messages
	if len(newMessages) == 0 {
		return nil
	}

	for _, n := range s.adj {
		s.n.Send(n, map[string]any{
			"type":     "gossip",
			"messages": newMessages,
		})
	}

	return nil
}

// handleRead responds with all of this node's local messages.
func (s *Server) handleRead(msg maelstrom.Message) error {
	messages := make([]int, 0, len(s.messages))

	s.mu.RLock()
	for _, message := range s.messages {
		messages = append(messages, message.Content)
	}
	s.mu.RUnlock()

	return s.n.Reply(msg, map[string]any{
		"type":     "read_ok",
		"messages": messages,
	})
}
