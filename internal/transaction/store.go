package transaction

import maelstrom "github.com/jepsen-io/maelstrom/demo/go"

// Store is a transaction store that handles operations.
type Store interface {
	SetNode(node *maelstrom.Node)
	SetTopology(topology map[string][]string)

	// HandleTransaction applies the operations in the transaction
	// sequentially, mutating the transaction if required.
	HandleTransaction(txn txn)
}
