package server

import (
	"encoding/json"

	"gossip-glomers/internal/snowflake"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
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
	// initialise all channels and workers so we don't have to do it later
	for _, n := range s.adj {
		ch := make(chan Message, 10000)
		s.outgoing[n] = ch
		go s.spawnNeighbourWorker(n, ch)
	}
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
		"id":   s.sg.NextID(),
	})
}

// handleBroadcast takes a message and broadcasts it to all neighbouring nodes.
func (s *Server) handleBroadcast(msg maelstrom.Message) error {
	var body BroadcastBody
	if err := json.Unmarshal(msg.Body, &body); err != nil {
		return err
	}

	newMsg := Message{
		Src:       s.n.ID(),
		Snowflake: s.sg.NextID(),
		Content:   body.Message,
	}

	s.mu.Lock()
	s.messages[newMsg.Snowflake] = newMsg
	s.mu.Unlock()

	for _, n := range s.adj {
		s.outgoing[n] <- newMsg
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
	newMsgs := make([]Message, 0, len(body.Messages))

	s.mu.Lock()
	for _, m := range body.Messages {
		// prevent infinite cycle if already seen
		if _, seen := s.messages[m.Snowflake]; seen {
			continue
		}

		s.messages[m.Snowflake] = m
		newMsgs = append(newMsgs, m)
	}
	neighbours := s.adj
	s.mu.Unlock()

	// stop gossip chain if no new messages
	if len(newMsgs) > 0 {
		for _, m := range newMsgs {
			for _, n := range neighbours {
				if n == m.Src {
					continue
				}

				s.outgoing[n] <- m
			}
		}
	}

	return s.n.Reply(msg, map[string]any{
		"type": "gossip_ok",
	})
}

// handleAdd increments the value of the global counter.
func (s *Server) handleAdd(msg maelstrom.Message) error {
	var body AddBody
	if err := json.Unmarshal(msg.Body, &body); err != nil {
		return err
	}

	s.gc.Add(body.Delta)

	return s.n.Reply(msg, map[string]any{
		"type": "add_ok",
	})
}

// handleRead3 responds with all of this node's local messages
// (for Challenge #3x).
func (s *Server) handleRead3(msg maelstrom.Message) error {
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

// handleRead4 responds with the current value of the global counter, guaranteed
// to be eventually consistent (for Challenge #4).
func (s *Server) handleRead4(msg maelstrom.Message) error {
	return s.n.Reply(msg, map[string]any{
		"type":  "read_ok",
		"value": s.gc.Read(),
	})
}

// handleSend is a handler that wraps LogStore.Append.
func (s *Server) handleSend(msg maelstrom.Message) error {
	var body SendBody
	if err := json.Unmarshal(msg.Body, &body); err != nil {
		return err
	}

	offset, _ := s.logStore.Append(body.Key, body.Msg)

	return s.n.Reply(msg, map[string]any{
		"type":   "send_ok",
		"offset": offset,
	})
}

// handlePoll is a handler that wraps LogStore.Poll.
func (s *Server) handlePoll(msg maelstrom.Message) error {
	var body PollBody
	if err := json.Unmarshal(msg.Body, &body); err != nil {
		return err
	}

	msgs, _ := s.logStore.Poll(body.Offsets)

	return s.n.Reply(msg, map[string]any{
		"type": "poll_ok",
		"msgs": msgs,
	})
}

// handleCommitOffsets is a handler that wraps LogStore.Commit.
func (s *Server) handleCommitOffsets(msg maelstrom.Message) error {
	var body CommitOffsetsBody
	if err := json.Unmarshal(msg.Body, &body); err != nil {
		return err
	}

	s.logStore.Commit(body.Offsets)

	return s.n.Reply(msg, map[string]any{
		"type": "commit_offsets_ok",
	})
}

// handleListCommittedOffsets is a handler that wraps LogStore.ListCommitted.
func (s *Server) handleListCommittedOffsets(msg maelstrom.Message) error {
	var body ListCommittedOffsetsBody
	if err := json.Unmarshal(msg.Body, &body); err != nil {
		return err
	}

	offsets, _ := s.logStore.ListCommitted(body.Keys)

	return s.n.Reply(msg, map[string]any{
		"type":    "list_committed_offsets_ok",
		"offsets": offsets,
	})
}
