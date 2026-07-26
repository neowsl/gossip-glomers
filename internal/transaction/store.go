package transaction

import maelstrom "github.com/jepsen-io/maelstrom/demo/go"

// Store is a transaction store that handles operations.
type Store interface {
	SetNode(node *maelstrom.Node)
	SetTopology(topology map[string][]string)

	// HandleOperations applies the operations sequentially, mutating the
	// operations slice if required.
	HandleOperations(ops []operation)
}
