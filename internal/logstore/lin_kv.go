package logstore

import (
	"context"
	"slices"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

const (
	logPrefix    = "log"
	offsetPrefix = "offset"
)

// LinKVStore is a distributed implementation of a log Store building on
// maelstrom's lin-kv store.
type LinKVStore struct {
	kv *maelstrom.KV
}

// NewLinKVStore creates a new empty LinKVStore.
func NewLinKVStore(node *maelstrom.Node) *LinKVStore {
	return &LinKVStore{
		// each call to `NewLinKV()` creates a client interface to the same
		// service; we can't create multiple instances of lin-kv stores.
		kv: maelstrom.NewLinKV(node),
	}
}

// logKey returns a domain-prefixed log key string based on rawKey.
func (s *LinKVStore) logKey(rawKey string) string {
	return logPrefix + ":" + rawKey
}

// offsetKey returns a domain-prefixed offset key string based on rawKey.
func (s *LinKVStore) offsetKey(rawKey string) string {
	return offsetPrefix + ":" + rawKey
}

func (s *LinKVStore) Append(key string, msg int) (offset int, err error) {
	ctx := context.Background()

	// use disjoint domain prefixing to ensure log keys don't interfere with
	// offset keys
	dbKey := s.logKey(key)

	for {
		var log []record
		err := s.kv.ReadInto(ctx, dbKey, &log)
		if err != nil {
			log = []record{}
		}

		nextOffset := 0
		if len(log) > 0 {
			nextOffset = log[len(log)-1].Offset + 1
		}

		newLog := slices.Clone(log)
		newLog = append(newLog, record{Offset: nextOffset, Content: msg})

		createIfNotExists := len(log) == 0
		// CAS works on any serialisable type!
		err = s.kv.CompareAndSwap(ctx, dbKey, log, newLog, createIfNotExists)
		if err == nil {
			return nextOffset, nil
		}
	}
}

func (s *LinKVStore) Poll(offsets map[string]int) (msgs map[string][][2]int, err error) {
	ctx := context.Background()
	res := make(map[string][][2]int)

	for key, offset := range offsets {
		dbKey := s.logKey(key)

		var log []record
		err := s.kv.ReadInto(ctx, dbKey, &log)
		if err != nil {
			log = []record{}
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

func (s *LinKVStore) Commit(offsets map[string]int) error {
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

func (s *LinKVStore) ListCommitted(keys []string) (offsets map[string]int, err error) {
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
