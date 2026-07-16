package snowflake

import (
	"gossip-glomers/internal/service"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

func Routes(node *maelstrom.Node) service.Routes {
	var gen *Generator

	return service.Routes{
		"init": func(msg maelstrom.Message) error {
			gen = NewGenerator(node.ID())

			return nil
		},
		"generate": func(msg maelstrom.Message) error {
			return node.Reply(msg, map[string]any{
				"type": "generate_ok",
				"id":   gen.NextID(),
			})
		},
	}
}
