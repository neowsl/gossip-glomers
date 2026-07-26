package transaction

import (
	"sync"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

// InMemoryStore is an in-memory implementation of a transaction Store.
type InMemoryStore struct {
	mu     sync.RWMutex
	values map[int]int
}

func NewInMemoryStore() *InMemoryStore {
	return &InMemoryStore{
		values: make(map[int]int),
	}
}

func (s *InMemoryStore) SetNode(_ *maelstrom.Node)         {}
func (s *InMemoryStore) SetTopology(_ map[string][]string) {}

func (s *InMemoryStore) HandleOperations(ops []operation) {
	for i := range ops {
		op := &ops[i]

		switch op.Kind {
		case "r":
			val := s.read(op.Key)
			if val != nil {
				op.Value = new(int)
				*op.Value = *val
			}
		case "w":
			s.write(op.Key, *op.Value)
		}
	}
}

// read returns the current value of the key, or nil if the key doesn't exist.
func (s *InMemoryStore) read(key int) *int {
	s.mu.RLock()
	defer s.mu.RUnlock()

	val, ok := s.values[key]
	if !ok {
		return nil
	}

	return &val
}

// write sets the value of the key.
func (s *InMemoryStore) write(key int, value int) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.values[key] = value
}
