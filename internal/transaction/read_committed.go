package transaction

import (
	"gossip-glomers/internal/mailbox"
	"sync"
	"time"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

// ReadCommittedStore is a distributed implementation of a transaction Store.
// Guarantees total availability with a Read Committed consistency model.
type ReadCommittedStore struct {
	store   map[int]*versionedValue
	mailbox *mailbox.Mailbox[txn]
	mu      sync.RWMutex
}

func NewReadCommittedStore() *ReadCommittedStore {
	m := mailbox.New[txn](mailbox.Config{
		MaxEnvelopesPerBatch: 20,
		MaxBackoff:           3 * time.Second,
	})

	store := ReadCommittedStore{
		store:   make(map[int]*versionedValue),
		mailbox: m,
	}

	m.OnEnvelopeReceived = func(envelope mailbox.Envelope[txn]) {
		keys := make([]int, 0, len(envelope.Content))
		for _, op := range envelope.Content {
			if op.Kind == "w" {
				// snapshot only needs to concern writes
				keys = append(keys, op.Key)
			}
		}
		snapshot := store.snapshot(keys)

		for _, op := range envelope.Content {
			if op.Kind == "w" {
				snapshot[op.Key] = &versionedValue{
					Snowflake: envelope.Snowflake,
					Value:     *op.Value,
				}
			}
		}

		store.batchWrite(snapshot)
	}

	return &store
}

func (s *ReadCommittedStore) SetNode(node *maelstrom.Node) {
	s.mailbox.SetNode(node)
}
func (s *ReadCommittedStore) SetTopology(topology map[string][]string) {
	s.mailbox.SetTopology(topology)
}

func (s *ReadCommittedStore) HandleTransaction(txn txn) {
	envelope := s.mailbox.SendAll(txn)

	// 1. take atomic snapshot the current state to avoid dirty reads
	keys := make([]int, 0, len(txn))
	for _, op := range txn {
		keys = append(keys, op.Key)
	}
	snapshot := s.snapshot(keys)

	// 2. apply updates to snapshot
	// since the mutex has been released, large transactions won't block each
	// other
	for i := range txn {
		op := &txn[i]

		switch op.Kind {
		case "r":
			if snapshot[op.Key] != nil {
				op.Value = new(int)
				*op.Value = snapshot[op.Key].Value
			}
		case "w":
			snapshot[op.Key] = &versionedValue{
				Snowflake: envelope.Snowflake,
				Value:     *op.Value,
			}
		}
	}

	// 3. atomically update entire node's store with snapshot state
	s.batchWrite(snapshot)
}

// snapshot is an atomic operation that returns a map, copying only the
// provided keys.
func (s *ReadCommittedStore) snapshot(keys []int) map[int]*versionedValue {
	s.mu.RLock()
	defer s.mu.RUnlock()

	res := make(map[int]*versionedValue, len(keys))
	for _, key := range keys {
		res[key] = s.store[key]
	}

	return res
}

// batchWrite is an atomic operation that applies updates from the given state.
func (s *ReadCommittedStore) batchWrite(state map[int]*versionedValue) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for key, versionedValue := range state {
		curr := s.store[key]
		if versionedValue != nil &&
			(curr == nil || versionedValue.Snowflake > curr.Snowflake) {
			s.store[key] = versionedValue
		}
	}
}
