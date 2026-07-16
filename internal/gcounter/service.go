package gcounter

import (
	"encoding/json"
	"gossip-glomers/internal/service"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

type addBody struct {
	service.BaseBody
	Delta int `json:"delta"`
}

func Routes(node *maelstrom.Node) service.Routes {
	counter := NewCounter(node)

	return service.Routes{
		"add": func(msg maelstrom.Message) error {
			var body addBody
			if err := json.Unmarshal(msg.Body, &body); err != nil {
				return err
			}

			counter.Add(body.Delta)

			return node.Reply(msg, map[string]any{
				"type": "add_ok",
			})
		},
		"read": func(msg maelstrom.Message) error {
			return node.Reply(msg, map[string]any{
				"type":  "read_ok",
				"value": counter.Read(),
			})
		},
	}
}
