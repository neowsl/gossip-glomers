package main

import (
	"encoding/json"
	"log"
	"strconv"
	"strings"
	"time"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

func main() {
	n := maelstrom.NewNode()

	epoch := time.Date(2026, time.April, 17, 0, 0, 0, 0, time.UTC)
	epochMs := epoch.UnixMilli()

	var sg SnowflakeGen

	n.Handle("init", func(msg maelstrom.Message) error {
		var body map[string]any
		if err := json.Unmarshal(msg.Body, &body); err != nil {
			return err
		}

		idStr := body["node_id"].(string)
		idStr = strings.TrimPrefix(idStr, "n")
		nodeId, _ := strconv.ParseUint(idStr, 10, 64)

		sg.epoch = epochMs
		sg.nodeId = nodeId

		return nil
	})

	n.Handle("generate", func(msg maelstrom.Message) error {
		body := make(map[string]any, 2)

		body["type"] = "generate_ok"
		body["id"] = sg.NextId()

		return n.Reply(msg, body)
	})

	if err := n.Run(); err != nil {
		log.Fatal(err)
	}
}
