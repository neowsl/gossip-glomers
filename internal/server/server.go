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
	n *maelstrom.Node
}

// InitServer spins up services based on the challengeID and sets up endpoint
// handlers.
func InitServer(challengeID *string) *Server {
	n := maelstrom.NewNode()

	var ls logstore.LogStore
	switch *challengeID {
	case "5a":
		ls = logstore.NewMemoryLogStore()
	case "5b":
		ls = logstore.NewDistributedLogStore(n)
	case "5c":
		ls = logstore.NewEfficientLogStore(n)
	}

	routes := make(service.RoutingTable)

	// append all new routes from init functions
	switch (*challengeID)[0] {
	case '1':
		maps.Copy(routes, echo.InitEchoService(n))
	case '2':
		maps.Copy(routes, snowflake.InitUUIDService(n))
	case '3':
		maps.Copy(routes, broadcast.InitBroadcastService(n))
	case '4':
		maps.Copy(routes, gcounter.InitGCounterService(n))
	case '5':
		maps.Copy(routes, logstore.InitKafkaService(n, ls))
	}

	// attach all handlers
	for endpoint, handler := range routes {
		n.Handle(endpoint, handler)
	}

	return &Server{
		n: n,
	}
}

// Run starts running the server, returning an error if anything fails.
func (s *Server) Run() error {
	return s.n.Run()
}
