package transaction

import (
	"gossip-glomers/internal/mailbox"
	"gossip-glomers/internal/snowflake"
	"slices"
	"time"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

// versionedValue holds not only a value, but also a Snowflake ID to allow for
// a total ordering of the messages that arrive.
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
}
func (s *ReadUncommittedStore) SetTopology(topology map[string][]string) {
	s.mailbox.SetTopology(topology)
}

func (s *ReadUncommittedStore) HandleTransaction(txn txn) {
	// replicate this transaction across all other nodes
	replica := slices.Clone(txn)
	envelope := s.mailbox.SendAll(replica)

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
// I.e. the versionedValue with a larger Snowflake is kept.
func (s *ReadUncommittedStore) Write(key int, value versionedValue) {
	s.store.Update(
		key,
		func(curr *versionedValue) (next versionedValue, newer bool) {
			// >= because writes from the same transaction should update
			return value, curr == nil || value.Snowflake >= curr.Snowflake
		},
	)
}
