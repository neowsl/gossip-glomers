package echo

import (
	"encoding/json"
	"gossip-glomers/internal/service"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

func Routes(node *maelstrom.Node) service.Routes {
	return service.Routes{
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
