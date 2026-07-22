package logstore

import "maps"

import "sync"

// InMemoryStore is an in-memory implementation of a log Store.
type InMemoryStore struct {
	mu      sync.RWMutex
	logs    map[string][]record
	offsets map[string]int
}

// NewInMemoryStore creates a new empty InMemoryStore.
func NewInMemoryStore() *InMemoryStore {
	return &InMemoryStore{
		logs:    make(map[string][]record),
		offsets: make(map[string]int),
	}
}

func (s *InMemoryStore) Append(key string, msg int) (offset int, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	log := s.logs[key]

	nextOffset := 0
	if len(log) > 0 {
		nextOffset = log[len(log)-1].Offset + 1
	}

	m := record{
		Offset:  nextOffset,
		Content: msg,
	}

	s.logs[key] = append(s.logs[key], m)

	return nextOffset, nil
}

func (s *InMemoryStore) Poll(offsets map[string]int) (msgs map[string][][2]int, err error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	res := make(map[string][][2]int)

	for key, offset := range offsets {
		for _, m := range s.logs[key] {
			if m.Offset < offset {
				continue
			}

			res[key] = append(res[key], [2]int{m.Offset, m.Content})
		}
	}

	return res, nil
}

func (s *InMemoryStore) Commit(offsets map[string]int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	maps.Copy(s.offsets, offsets)

	return nil
}

func (s *InMemoryStore) ListCommitted(keys []string) (offsets map[string]int, err error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	res := make(map[string]int)

	for _, key := range keys {
		res[key] = s.offsets[key]
	}

	return res, nil
}
