package main

import (
	"container/list"
	"encoding/json"
	"log"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

func main() {
	n := maelstrom.NewNode()

	messages := list.New()

	n.Handle("broadcast", func(msg maelstrom.Message) error {
		var body map[string]any
		if err := json.Unmarshal(msg.Body, &body); err != nil {
			return err
		}

		message := body["message"].(int)

		messages.PushBack(message)

		res := map[string]any{
			"type": "broadcast_ok",
		}

		return n.Reply(msg, res)
	})

	n.Handle("read", func(msg maelstrom.Message) error {
		jsonMessages, _ := json.Marshal(messages)

		res := map[string]any{
			"type":     "read_ok",
			"messages": jsonMessages,
		}

		return n.Reply(msg, res)
	})

	n.Handle("topology_ok", func(msg maelstrom.Message) error {
		res := map[string]any{
			"type": "topology_ok",
		}

		return n.Reply(msg, res)
	})

	if err := n.Run(); err != nil {
		log.Fatal(err)
	}
}
