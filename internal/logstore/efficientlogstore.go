package logstore

import (
	"context"
	"encoding/json"
	"gossip-glomers/internal/service"
	"hash/fnv"
	"maps"
	"sync"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

type SendResponseBody struct {
	service.BaseBody
	Offset int `json:"offset"`
}

type PollResponseBody struct {
	service.BaseBody
	Msgs map[string][][2]int `json:"msgs"`
}

type ListCommittedOffsetsResponseBody struct {
	service.BaseBody
	Offsets map[string]int `json:"offsets"`
}

// EfficientLogStore is a distributed implementation of a LogStore building
// on MemoryLogStore via inter-node gossiping.
type EfficientLogStore struct {
	node *maelstrom.Node
	ls   *MemoryLogStore
}

// NewEfficientLogStore creates a new empty EfficientLogStore.
func NewEfficientLogStore(node *maelstrom.Node) *EfficientLogStore {
	return &EfficientLogStore{
		node: node,
		ls:   NewMemoryLogStore(),
	}
}

// routeKey maps the given key to a node ID. Useful for routing logs between
// nodes.
func (s *EfficientLogStore) routeKey(key string) string {
	h := fnv.New32a()
	h.Write([]byte(key))

	nodeIDs := s.node.NodeIDs()
	numNodes := len(nodeIDs)

	idx := int(h.Sum32()) % numNodes
	return nodeIDs[idx]
}

func (s *EfficientLogStore) Append(key string, msg int) (offset int, err error) {
	targetNode := s.routeKey(key)

	// handle locally
	if targetNode == s.node.ID() {
		return s.ls.Append(key, msg)
	}

	// reroute to targetNode to handle
	ctx := context.Background()

	res, err := s.node.SyncRPC(ctx, targetNode, map[string]any{
		"type": "send",
		"key":  key,
		"msg":  msg,
	})

	if err != nil {
		return 0, err
	}

	var body SendResponseBody
	if err := json.Unmarshal(res.Body, &body); err != nil {
		return 0, err
	}

	return body.Offset, nil
}

func (s *EfficientLogStore) Poll(offsets map[string]int) (msgs map[string][][2]int, err error) {
	// first determine which offsets each node will need to handle
	assignees := make(map[string]map[string]int)
	for key, offset := range offsets {
		targetNode := s.routeKey(key)
		if assignees[targetNode] == nil {
			assignees[targetNode] = make(map[string]int)
		}
		assignees[targetNode][key] = offset
	}

	// then use scatter-gather approach
	res := make(map[string][][2]int)
	var wg sync.WaitGroup
	var mu sync.Mutex
	ctx := context.Background()
	// handle errors via an error channel
	errCh := make(chan error, len(assignees))

	// 1. scatter
	for nodeID, offsets := range assignees {
		if nodeID == s.node.ID() {
			msgs, err := s.ls.Poll(offsets)
			if err != nil {
				return nil, err
			}

			// 2. gather
			mu.Lock()
			maps.Copy(res, msgs)
			mu.Unlock()

			continue
		}

		wg.Add(1)
		go func(nodeID string, offsets map[string]int) {
			defer wg.Done()

			// 1. scatter
			msg, err := s.node.SyncRPC(ctx, nodeID, map[string]any{
				"type":    "poll",
				"offsets": offsets,
			})

			if err != nil {
				errCh <- err
				return
			}

			var body PollResponseBody
			if err := json.Unmarshal(msg.Body, &body); err != nil {
				errCh <- err
				return
			}

			// 2. gather
			mu.Lock()
			maps.Copy(res, body.Msgs)
			mu.Unlock()
		}(nodeID, offsets)
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		if err != nil {
			return nil, err
		}
	}
	return res, nil
}

func (s *EfficientLogStore) Commit(offsets map[string]int) error {
	assignees := make(map[string]map[string]int)
	for key, offset := range offsets {
		targetNode := s.routeKey(key)
		if assignees[targetNode] == nil {
			assignees[targetNode] = make(map[string]int)
		}
		assignees[targetNode][key] = offset
	}

	var wg sync.WaitGroup
	ctx := context.Background()
	errCh := make(chan error, len(assignees))

	for nodeID, offsets := range assignees {
		if nodeID == s.node.ID() {
			err := s.ls.Commit(offsets)
			if err != nil {
				return err
			}

			continue
		}

		wg.Add(1)
		go func(nodeID string, offsets map[string]int) {
			defer wg.Done()

			msg, err := s.node.SyncRPC(ctx, nodeID, map[string]any{
				"type":    "commit_offsets",
				"offsets": offsets,
			})

			if err != nil {
				errCh <- err
				return
			}

			var body PollResponseBody
			if err := json.Unmarshal(msg.Body, &body); err != nil {
				errCh <- err
			}
		}(nodeID, offsets)
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *EfficientLogStore) ListCommitted(keys []string) (offsets map[string]int, err error) {
	assignees := make(map[string][]string)
	for _, key := range keys {
		targetNode := s.routeKey(key)
		assignees[targetNode] = append(assignees[targetNode], key)
	}

	res := make(map[string]int)
	var wg sync.WaitGroup
	var mu sync.Mutex
	ctx := context.Background()
	errCh := make(chan error, len(assignees))

	for nodeID, keys := range assignees {
		if nodeID == s.node.ID() {
			msgs, err := s.ls.ListCommitted(keys)
			if err != nil {
				return nil, err
			}

			mu.Lock()
			maps.Copy(res, msgs)
			mu.Unlock()

			continue
		}

		wg.Add(1)
		go func(nodeID string, keys []string) {
			defer wg.Done()

			msg, err := s.node.SyncRPC(ctx, nodeID, map[string]any{
				"type": "list_committed_offsets",
				"keys": keys,
			})

			if err != nil {
				errCh <- err
				return
			}

			var body ListCommittedOffsetsResponseBody
			if err := json.Unmarshal(msg.Body, &body); err != nil {
				errCh <- err
				return
			}

			mu.Lock()
			maps.Copy(res, body.Offsets)
			mu.Unlock()
		}(nodeID, keys)
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		if err != nil {
			return nil, err
		}
	}
	return res, nil
}
