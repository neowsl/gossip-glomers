package snowflake

import (
	"gossip-glomers/internal/service"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

func InitUUIDService(node *maelstrom.Node) service.RoutingTable {
	var sg *SnowflakeGen

	return service.RoutingTable{
		"init": func(msg maelstrom.Message) error {
			sg = NewSnowflakeGen(node.ID())

			return nil
		},
		"generate": func(msg maelstrom.Message) error {
			return node.Reply(msg, map[string]any{
				"type": "generate_ok",
				"id":   sg.NextID(),
			})
		},
	}
}
