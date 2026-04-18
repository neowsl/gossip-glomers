package main

import (
	"log"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

func main() {
	n := maelstrom.NewNode()

	sg := NewSnowflakeGen(n.ID())

	n.Handle("generate", func(msg maelstrom.Message) error {
		res := map[string]any{
			"type": "generate_ok",
			"id":   sg.NextId(),
		}

		return n.Reply(msg, res)
	})

	if err := n.Run(); err != nil {
		log.Fatal(err)
	}
}
