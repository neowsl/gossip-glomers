package service

import maelstrom "github.com/jepsen-io/maelstrom/demo/go"

// RoutingTable maps endpoints to handler functions.
type RoutingTable map[string]func(maelstrom.Message) error

// BaseBody is the base of any request body.
type BaseBody struct {
	Type string `json:"type"`
}
