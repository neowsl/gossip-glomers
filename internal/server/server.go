package server

import (
	"maps"

	"gossip-glomers/internal/broadcast"
	"gossip-glomers/internal/echo"
	"gossip-glomers/internal/gcounter"
	"gossip-glomers/internal/logstore"
	"gossip-glomers/internal/service"
	"gossip-glomers/internal/snowflake"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

// Server is responsible for orchestrating individual services for challenges.
type Server struct {
	node *maelstrom.Node
}

// New spins up services based on the challengeID and sets up endpoint
// handlers.
func New(challengeID *string) *Server {
	node := maelstrom.NewNode()

	var store logstore.Store
	switch *challengeID {
	case "5a":
		store = logstore.NewInMemoryStore()
	case "5b":
		store = logstore.NewLinKVStore(node)
	case "5c":
		store = logstore.NewShardedStore(node)
	}

	routes := make(service.Routes)

	// append all new routes from init functions
	switch (*challengeID)[0] {
	case '1':
		maps.Copy(routes, echo.Routes(node))
	case '2':
		maps.Copy(routes, snowflake.Routes(node))
	case '3':
		maps.Copy(routes, broadcast.Routes(node))
	case '4':
		maps.Copy(routes, gcounter.Routes(node))
	case '5':
		maps.Copy(routes, logstore.Routes(node, store))
	}

	// attach all handlers
	for endpoint, handler := range routes {
		node.Handle(endpoint, handler)
	}

	return &Server{
		node: node,
	}
}

// Run starts running the server, returning an error if anything fails.
func (s *Server) Run() error {
	return s.node.Run()
}
