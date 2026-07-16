package service

import maelstrom "github.com/jepsen-io/maelstrom/demo/go"

// Routes maps endpoints to handler functions.
type Routes map[string]func(maelstrom.Message) error

// BaseBody is the base of any request body.
type BaseBody struct {
	Type string `json:"type"`
}
