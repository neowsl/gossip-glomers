package transaction

import (
	"encoding/json"
	"fmt"
	"gossip-glomers/internal/service"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

type operation struct {
	Kind  string
	Key   int
	Value *int
}

func (op *operation) UnmarshalJSON(data []byte) error {
	var fields []json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}

	if len(fields) != 3 {
		return fmt.Errorf("transaction operation must have 3 fields")
	}

	if err := json.Unmarshal(fields[0], &op.Kind); err != nil {
		return fmt.Errorf("decode operation kind: %w", err)
	}

	if err := json.Unmarshal(fields[1], &op.Key); err != nil {
		return fmt.Errorf("decode operation key: %w", err)
	}

	if err := json.Unmarshal(fields[2], &op.Value); err != nil {
		return fmt.Errorf("decode operation value: %w", err)
	}

	return nil
}

func (op operation) MarshalJSON() ([]byte, error) {
	return json.Marshal([3]any{
		op.Kind,
		op.Key,
		op.Value,
	})
}

type txnBody struct {
	service.BaseBody
	MsgID int         `json:"msg_id"`
	Txn   []operation `json:"txn"`
}

func Routes(node *maelstrom.Node, store Store) service.Routes {
	return service.Routes{
		"txn": func(msg maelstrom.Message) error {
			var body txnBody
			if err := json.Unmarshal(msg.Body, &body); err != nil {
				return err
			}

			store.HandleOperations(body.Txn)

			return node.Reply(msg, map[string]any{
				"type": "txn_ok",
				"txn":  body.Txn,
			})
		},
	}
}
