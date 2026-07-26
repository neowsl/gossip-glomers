package transaction

import (
	"gossip-glomers/internal/mailbox"
	"gossip-glomers/internal/snowflake"
	"time"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

// versionedValue holds
type versionedValue struct {
	Snowflake snowflake.ID
	Value     int
}

// ReadUncommittedStore is a distributed implementation of a transaction Store.
// Guarantees total availability with a Read Uncommitted consistency model.
// Writes are replicated with a LWW (Last-Write-Wins) policy.
type ReadUncommittedStore struct {
	store   *InMemoryStore[int, versionedValue]
	mailbox *mailbox.Mailbox[txn]
	gen     *snowflake.Generator
}

func NewReadUncommittedStore() *ReadUncommittedStore {
	m := mailbox.New[txn](mailbox.Config{
		MaxEnvelopesPerBatch: 20,
		MaxBackoff:           3 * time.Second,
	})

	store := ReadUncommittedStore{
		store:   NewInMemoryStore[int, versionedValue](),
		mailbox: m,
	}

	m.OnEnvelopeReceived = func(envelope mailbox.Envelope[txn]) {
		for _, op := range envelope.Content {
			if op.Kind == "w" {
				// we only care about writes with LWW
				store.Write(op.Key, versionedValue{
					Snowflake: envelope.Snowflake,
					Value:     *op.Value,
				})
			}
		}
	}

	return &store
}

func (s *ReadUncommittedStore) SetNode(node *maelstrom.Node) {
	s.mailbox.SetNode(node)
	s.gen = snowflake.NewGenerator(node.ID())
}
func (s *ReadUncommittedStore) SetTopology(topology map[string][]string) {
	s.mailbox.SetTopology(topology)
}

func (s *ReadUncommittedStore) HandleTransaction(txn txn) {
	// replicate this transaction across all other nodes
	envelope := s.mailbox.SendAll(txn)

	for i := range txn {
		op := &txn[i]

		switch op.Kind {
		case "r":
			val := s.store.Read(op.Key)
			if val != nil {
				op.Value = new(int)
				*op.Value = val.Value
			}
		case "w":
			s.Write(op.Key, versionedValue{
				Snowflake: envelope.Snowflake,
				Value:     *op.Value,
			})
		}
	}
}

// Write updates the value of the key with a LWW (Last-Write-Wins) policy.
// I.e. the versionedValue with a larger snowflake is kept.
func (s *ReadUncommittedStore) Write(key int, versionedValue versionedValue) {
	curr := s.store.Read(key)
	if curr == nil || versionedValue.Snowflake > curr.Snowflake {
		// update only if there is currently no value or if the new value's
		// snowflake is larger
		s.store.Write(key, versionedValue)
	}
}
