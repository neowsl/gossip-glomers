package logstore

import (
	"encoding/json"
	"gossip-glomers/internal/service"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

type SendBody struct {
	service.BaseBody
	Key string `json:"key"`
	Msg int    `json:"msg"`
}

type PollBody struct {
	service.BaseBody
	Offsets map[string]int `json:"offsets"`
}

type CommitOffsetsBody = PollBody

type ListCommittedOffsetsBody struct {
	service.BaseBody
	Keys []string `json:"keys"`
}

func InitKafkaService(node *maelstrom.Node, ls LogStore) service.RoutingTable {
	return service.RoutingTable{
		"send": func(msg maelstrom.Message) error {
			var body SendBody
			if err := json.Unmarshal(msg.Body, &body); err != nil {
				return err
			}

			offset, _ := ls.Append(body.Key, body.Msg)

			return node.Reply(msg, map[string]any{
				"type":   "send_ok",
				"offset": offset,
			})
		},
		"poll": func(msg maelstrom.Message) error {
			var body PollBody
			if err := json.Unmarshal(msg.Body, &body); err != nil {
				return err
			}

			msgs, _ := ls.Poll(body.Offsets)

			return node.Reply(msg, map[string]any{
				"type": "poll_ok",
				"msgs": msgs,
			})
		},
		"commit_offsets": func(msg maelstrom.Message) error {
			var body CommitOffsetsBody
			if err := json.Unmarshal(msg.Body, &body); err != nil {
				return err
			}

			ls.Commit(body.Offsets)

			return node.Reply(msg, map[string]any{
				"type": "commit_offsets_ok",
			})
		},
		"list_committed_offsets": func(msg maelstrom.Message) error {
			var body ListCommittedOffsetsBody
			if err := json.Unmarshal(msg.Body, &body); err != nil {
				return err
			}

			offsets, _ := ls.ListCommitted(body.Keys)

			return node.Reply(msg, map[string]any{
				"type":    "list_committed_offsets_ok",
				"offsets": offsets,
			})
		},
	}
}
