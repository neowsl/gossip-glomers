package transaction

import "sync"

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

func (s *InMemoryStore) Read(key int) (value *int, err error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var ok bool
	val, ok := s.values[key]
	if !ok {
		return nil, nil
	}

	return &val, nil
}

func (s *InMemoryStore) Write(key int, value int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.values[key] = value

	return nil
}
