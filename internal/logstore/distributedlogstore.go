package logstore

import (
	"context"
	"slices"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

// DistributedLogStore is a distributed implementation of a LogStore building
// on maelstrom's lin-kv store.
type DistributedLogStore struct {
	logs    *maelstrom.KV
	offsets *maelstrom.KV
}

// NewDistributedLogStore creates a new empty DistributedLogStore.
func NewDistributedLogStore(node *maelstrom.Node) *DistributedLogStore {
	return &DistributedLogStore{
		logs:    maelstrom.NewLinKV(node),
		offsets: maelstrom.NewLinKV(node),
	}
}

func (s *DistributedLogStore) Append(key string, msg int) (offset int, err error) {
	ctx := context.Background()

	for {
		var log []Message
		err := s.logs.ReadInto(ctx, key, &log)
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
		err = s.logs.CompareAndSwap(ctx, key, log, newLog, createIfNotExists)
		if err == nil {
			return nextOffset, nil
		}
	}
}

func (s *DistributedLogStore) Poll(offsets map[string]int) (msgs map[string][][2]int, err error) {
	ctx := context.Background()
	res := make(map[string][][2]int)

	for key, offset := range offsets {

		var log []Message
		err := s.logs.ReadInto(ctx, key, &log)
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
		err := s.offsets.Write(ctx, key, offset)
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
		res[key], err = s.offsets.ReadInt(ctx, key)
		if err != nil {
			res[key] = 0
		}
	}

	return res, nil
}
