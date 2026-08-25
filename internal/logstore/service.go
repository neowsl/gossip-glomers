package logstore

import (
	"encoding/json"
	"gossip-glomers/internal/service"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

type sendBody struct {
	service.BaseBody
	Key string `json:"key"`
	Msg int    `json:"msg"`
}

type pollBody struct {
	service.BaseBody
	Offsets map[string]int `json:"offsets"`
}

type commitOffsetsBody = pollBody

type listCommittedOffsetsBody struct {
	service.BaseBody
	Keys []string `json:"keys"`
}

func Routes(node *maelstrom.Node, store Store) service.Routes {
	return service.Routes{
		"send": func(msg maelstrom.Message) error {
			var body sendBody
			if err := json.Unmarshal(msg.Body, &body); err != nil {
				return err
			}

			offset, err := store.Append(body.Key, body.Msg)
			if err != nil {
				return err
			}

			return node.Reply(msg, map[string]any{
				"type":   "send_ok",
				"offset": offset,
			})
		},
		"poll": func(msg maelstrom.Message) error {
			var body pollBody
			if err := json.Unmarshal(msg.Body, &body); err != nil {
				return err
			}

			msgs, err := store.Poll(body.Offsets)
			if err != nil {
				return err
			}

			return node.Reply(msg, map[string]any{
				"type": "poll_ok",
				"msgs": msgs,
			})
		},
		"commit_offsets": func(msg maelstrom.Message) error {
			var body commitOffsetsBody
			if err := json.Unmarshal(msg.Body, &body); err != nil {
				return err
			}

			err := store.Commit(body.Offsets)
			if err != nil {
				return err
			}

			return node.Reply(msg, map[string]any{
				"type": "commit_offsets_ok",
			})
		},
		"list_committed_offsets": func(msg maelstrom.Message) error {
			var body listCommittedOffsetsBody
			if err := json.Unmarshal(msg.Body, &body); err != nil {
				return err
			}

			offsets, err := store.ListCommitted(body.Keys)
			if err != nil {
				return err
			}

			return node.Reply(msg, map[string]any{
				"type":    "list_committed_offsets_ok",
				"offsets": offsets,
			})
		},
	}
}
