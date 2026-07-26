package broadcast

import (
	"encoding/json"
	"gossip-glomers/internal/mailbox"
	"gossip-glomers/internal/service"
	"time"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

const (
	messagesPerBatch = 20
	maxBackoff       = 3 * time.Second
)

type broadcastBody struct {
	service.BaseBody
	Message int `json:"message"`
}

func Routes(node *maelstrom.Node) service.Routes {
	m := mailbox.New[int](mailbox.Config{
		MaxEnvelopesPerBatch: 20,
		MaxBackoff:           3 * time.Second,
	})

	return service.Routes{
		"init": func(msg maelstrom.Message) error {
			m.SetNode(node)

			return nil
		},
		"topology": func(msg maelstrom.Message) error {
			var body mailbox.TopologyBody
			if err := json.Unmarshal(msg.Body, &body); err != nil {
				return err
			}

			m.SetTopology(body.Topology)

			return node.Reply(msg, map[string]any{
				"type": "topology_ok",
			})
		},
		"broadcast": func(msg maelstrom.Message) error {
			var body broadcastBody
			if err := json.Unmarshal(msg.Body, &body); err != nil {
				return err
			}

			m.SendAll(body.Message)

			return node.Reply(msg, map[string]any{
				"type": "broadcast_ok",
			})
		},
		"read": func(msg maelstrom.Message) error {
			return node.Reply(msg, map[string]any{
				"type":     "read_ok",
				"messages": m.Read(),
			})
		},
	}
}
