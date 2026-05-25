package logstore

import "maps"

import "sync"

// MemoryLogStore is an in-memory implementation of a LogStore
type MemoryLogStore struct {
	mu      sync.RWMutex
	logs    map[string][]Message
	offsets map[string]int
}

// NewMemoryLogStore creates a new empty MemoryLogStore.
func NewMemoryLogStore() *MemoryLogStore {
	return &MemoryLogStore{
		logs:    make(map[string][]Message),
		offsets: make(map[string]int),
	}
}

func (s *MemoryLogStore) Append(key string, msg int) (offset int, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	log := s.logs[key]

	nextOffset := 0
	if len(log) > 0 {
		nextOffset = log[len(log)-1].Offset + 1
	}

	m := Message{
		Offset:  nextOffset,
		Content: msg,
	}

	s.logs[key] = append(s.logs[key], m)

	return nextOffset, nil
}

func (s *MemoryLogStore) Poll(offsets map[string]int) (msgs map[string][][2]int, err error) {
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

func (s *MemoryLogStore) Commit(offsets map[string]int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	maps.Copy(s.offsets, offsets)

	return nil
}

func (s *MemoryLogStore) ListCommitted(keys []string) (offsets map[string]int, err error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	res := make(map[string]int)

	for _, key := range keys {
		res[key] = s.offsets[key]
	}

	return res, nil
}
