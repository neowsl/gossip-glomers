package transaction

import (
	"sync"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

// InMemoryStore[K, V] is an in-memory implementation of a transaction Store.
// It houses key-value pairs with type-K keys and type-V values.
type InMemoryStore[K comparable, V any] struct {
	mu     sync.RWMutex
	values map[K]V
}

func NewInMemoryStore[K comparable, V any]() *InMemoryStore[K, V] {
	return &InMemoryStore[K, V]{
		values: make(map[K]V),
	}
}

func (s *InMemoryStore[K, V]) SetNode(_ *maelstrom.Node)         {}
func (s *InMemoryStore[K, V]) SetTopology(_ map[string][]string) {}

func (s *InMemoryStore[K, V]) HandleTransaction(txn txn) {
	for i := range txn {
		op := &txn[i]

		switch op.Kind {
		case "r":
			castedKey, _ := any(op.Key).(K)
			val := s.Read(castedKey)
			if val != nil {
				op.Value = new(int)
				castedValue, _ := any(*val).(int)
				*op.Value = castedValue
			}
		case "w":
			castedKey, _ := any(op.Key).(K)
			castedValue, _ := any(*op.Value).(V)
			s.Write(castedKey, castedValue)
		}
	}
}

// Read returns the current value of the key, or nil if the key doesn't exist.
func (s *InMemoryStore[K, V]) Read(key K) *V {
	s.mu.RLock()
	defer s.mu.RUnlock()

	val, ok := s.values[key]
	if !ok {
		return nil
	}

	return &val
}

// Write sets the value of the key.
func (s *InMemoryStore[K, V]) Write(key K, value V) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.values[key] = value
}

// Update is an atomic operation for updating values. It takes an update
// function, which returns both a next value and a flag indicating if the next
// value is newer. Update will only update the value if newer is true.
func (s *InMemoryStore[K, V]) Update(
	key K,
	update func(curr *V) (next V, newer bool),
) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var curr *V
	val, ok := s.values[key]
	if ok {
		curr = &val
	}

	next, ok := update(curr)
	if ok {
		s.values[key] = next
	}
}
