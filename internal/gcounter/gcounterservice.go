package gcounter

import (
	"encoding/json"
	"gossip-glomers/internal/service"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

type AddBody struct {
	service.BaseBody
	Delta int `json:"delta"`
}

func InitGCounterService(node *maelstrom.Node) service.RoutingTable {
	gc := NewGCounter(node)

	return service.RoutingTable{
		"add": func(msg maelstrom.Message) error {
			var body AddBody
			if err := json.Unmarshal(msg.Body, &body); err != nil {
				return err
			}

			gc.Add(body.Delta)

			return node.Reply(msg, map[string]any{
				"type": "add_ok",
			})
		},
		"read": func(msg maelstrom.Message) error {
			return node.Reply(msg, map[string]any{
				"type":  "read_ok",
				"value": gc.Read(),
			})
		},
	}
}
