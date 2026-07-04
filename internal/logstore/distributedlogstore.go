package logstore

import (
	"context"
	"slices"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

// DistributedLogStore is a distributed implementation of a LogStore building
// on maelstrom's lin-kv store.
type DistributedLogStore struct {
	kv *maelstrom.KV
}

// NewDistributedLogStore creates a new empty DistributedLogStore.
func NewDistributedLogStore(node *maelstrom.Node) *DistributedLogStore {
	return &DistributedLogStore{
		// each call to `NewLinKV()` creates a client interface to the same
		// service; we can't create multiple instances of lin-kv stores.
		kv: maelstrom.NewLinKV(node),
	}
}

// logKey returns a domain-prefixed log key string based on rawKey.
func (s *DistributedLogStore) logKey(rawKey string) string {
	return "log:" + rawKey
}

// offsetKey returns a domain-prefixed offset key string based on rawKey.
func (s *DistributedLogStore) offsetKey(rawKey string) string {
	return "offset:" + rawKey
}

func (s *DistributedLogStore) Append(key string, msg int) (offset int, err error) {
	ctx := context.Background()

	// use disjoint domain prefixing to ensure log keys don't interfere with
	// offset keys
	dbKey := s.logKey(key)

	for {
		var log []Message
		err := s.kv.ReadInto(ctx, dbKey, &log)
		if err != nil {
			log = []Message{}
		}

		nextOffset := 0
		if len(log) > 0 {
			nextOffset = log[len(log)-1].Offset + 1
		}

		newLog := slices.Clone(log)
		newLog = append(newLog, Message{Offset: nextOffset, Content: msg})

		createIfNotExists := len(log) == 0
		// CAS works on any serialisable type!
		err = s.kv.CompareAndSwap(ctx, dbKey, log, newLog, createIfNotExists)
		if err == nil {
			return nextOffset, nil
		}
	}
}

func (s *DistributedLogStore) Poll(offsets map[string]int) (msgs map[string][][2]int, err error) {
	ctx := context.Background()
	res := make(map[string][][2]int)

	for key, offset := range offsets {
		dbKey := s.logKey(key)

		var log []Message
		err := s.kv.ReadInto(ctx, dbKey, &log)
		if err != nil {
			log = []Message{}
		}

		for _, m := range log {
			if m.Offset < offset {
				continue
			}

			res[key] = append(res[key], [2]int{m.Offset, m.Content})
		}
	}

	return res, nil
}

func (s *DistributedLogStore) Commit(offsets map[string]int) error {
	ctx := context.Background()

	for key, offset := range offsets {
		dbKey := s.offsetKey(key)

		err := s.kv.Write(ctx, dbKey, offset)
		if err != nil {
			return err
		}
	}

	return nil
}

func (s *DistributedLogStore) ListCommitted(keys []string) (offsets map[string]int, err error) {
	ctx := context.Background()
	res := make(map[string]int)

	for _, key := range keys {
		dbKey := s.offsetKey(key)

		res[key], err = s.kv.ReadInt(ctx, dbKey)
		if err != nil {
			res[key] = 0
		}
	}

	return res, nil
}
