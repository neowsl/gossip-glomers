package echo

import (
	"encoding/json"
	"gossip-glomers/internal/service"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

func InitEchoService(node *maelstrom.Node) service.RoutingTable {
	return service.RoutingTable{
		"echo": func(msg maelstrom.Message) error {
			var body map[string]any
			if err := json.Unmarshal(msg.Body, &body); err != nil {
				return err
			}

			body["type"] = "echo_ok"

			return node.Reply(msg, body)
		},
	}
}
