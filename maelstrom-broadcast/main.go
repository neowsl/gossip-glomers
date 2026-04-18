package main

import (
	"encoding/json"
	"log"
	"sync"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

func main() {
	n := maelstrom.NewNode()

	messages := make([]int, 0)

	var mu sync.RWMutex

	n.Handle("broadcast", func(msg maelstrom.Message) error {
		var body map[string]any
		if err := json.Unmarshal(msg.Body, &body); err != nil {
			return err
		}

		message := int(body["message"].(float64))

		mu.Lock()
		messages = append(messages, message)
		mu.Unlock()

		res := map[string]any{
			"type": "broadcast_ok",
		}

		return n.Reply(msg, res)
	})

	n.Handle("read", func(msg maelstrom.Message) error {
		mu.RLock()
		defer mu.RUnlock()

		res := map[string]any{
			"type":     "read_ok",
			"messages": messages,
		}

		return n.Reply(msg, res)
	})

	n.Handle("topology", func(msg maelstrom.Message) error {
		res := map[string]any{
			"type": "topology_ok",
		}

		return n.Reply(msg, res)
	})

	if err := n.Run(); err != nil {
		log.Fatal(err)
	}
}
