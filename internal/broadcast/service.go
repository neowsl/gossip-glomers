package broadcast

import (
	"context"
	"encoding/json"
	"gossip-glomers/internal/service"
	"gossip-glomers/internal/snowflake"
	"math/rand"
	"sync"
	"time"

	maelstrom "github.com/jepsen-io/maelstrom/demo/go"
)

const (
	messagesPerBatch = 20
	maxBackoff       = 3 * time.Second
)

// message stores details relevant to a message. Each message is marked by a
// unique snowflake.
type message struct {
	Src       string       `json:"src"`
	Snowflake snowflake.ID `json:"snowflake"`
	Content   int          `json:"content"`
}

type topologyBody struct {
	service.BaseBody
	Topology map[string][]string `json:"topology"`
}

type broadcastBody struct {
	service.BaseBody
	Message int `json:"message"`
}

type gossipBody struct {
	service.BaseBody
	Messages []message `json:"messages"`
}

func Routes(node *maelstrom.Node) service.Routes {
	var mu sync.RWMutex
	var gen *snowflake.Generator
	var adj []string
	messages := make(map[snowflake.ID]message, 1024)
	outgoing := make(map[string]chan message)

	return service.Routes{
		"init": func(msg maelstrom.Message) error {
			gen = snowflake.NewGenerator(node.ID())

			return nil
		},
		"topology": func(msg maelstrom.Message) error {
			var body topologyBody
			if err := json.Unmarshal(msg.Body, &body); err != nil {
				return err
			}

			mu.Lock()
			adj = body.Topology[node.ID()]
			// initialise all channels and workers so we don't have to do it later
			for _, n := range adj {
				ch := make(chan message, 10000)
				outgoing[n] = ch
				go spawnNeighbourWorker(node, n, ch)
			}
			mu.Unlock()

			return node.Reply(msg, map[string]any{
				"type": "topology_ok",
			})
		},
		"broadcast": func(msg maelstrom.Message) error {
			var body broadcastBody
			if err := json.Unmarshal(msg.Body, &body); err != nil {
				return err
			}

			newMsg := message{
				Src:       node.ID(),
				Snowflake: gen.NextID(),
				Content:   body.Message,
			}

			mu.Lock()
			messages[newMsg.Snowflake] = newMsg
			mu.Unlock()

			for _, n := range adj {
				outgoing[n] <- newMsg
			}

			return node.Reply(msg, map[string]any{
				"type": "broadcast_ok",
			})
		},
		"gossip": func(msg maelstrom.Message) error {
			var body gossipBody
			if err := json.Unmarshal(msg.Body, &body); err != nil {
				return err
			}

			// only send new messages to avoid infinite cycle
			newMsgs := make([]message, 0, len(body.Messages))

			mu.Lock()
			for _, m := range body.Messages {
				// prevent infinite cycle if already seen
				if _, seen := messages[m.Snowflake]; seen {
					continue
				}

				messages[m.Snowflake] = m
				newMsgs = append(newMsgs, m)
			}
			neighbours := adj
			mu.Unlock()

			// stop gossip chain if no new messages
			if len(newMsgs) > 0 {
				for _, m := range newMsgs {
					for _, n := range neighbours {
						if n == m.Src || n == msg.Src {
							continue
						}

						outgoing[n] <- m
					}
				}
			}

			return node.Reply(msg, map[string]any{
				"type": "gossip_ok",
			})
		},
		"read": func(msg maelstrom.Message) error {
			resMsgs := make([]int, 0, len(messages))

			mu.RLock()
			for _, message := range messages {
				resMsgs = append(resMsgs, message.Content)
			}
			mu.RUnlock()

			return node.Reply(msg, map[string]any{
				"type":     "read_ok",
				"messages": resMsgs,
			})
		},
	}
}

// spawnNeighbourWorker() spawns a new goroutine that consumes messages from
// `ch` and forwards them to `dest`, waiting until `dest` becomes responsive if
// it goes offline.
func spawnNeighbourWorker(node *maelstrom.Node, dest string, ch <-chan message) {
	for firstMsg := range ch {
		// batch-send messages to avoid overloading network
		// prepare batch first, then commit to sending (otherwise data will be
		// lost)
		batch := []message{firstMsg}

		for range messagesPerBatch - 1 {
			// select for safe concurrency
			select {
			case m := <-ch:
				batch = append(batch, m)
			default:
				goto send
			}
		}

	send:
		// exponential backoff
		backoff := 50 * time.Millisecond
		for {
			// some black magic to prevent memory leaks from `defer cancel()`
			success := func() bool {
				ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
				defer cancel()

				// SyncRPC will error if message was not received (i.e. we will get an
				// ACK if message was received).
				_, err := node.SyncRPC(ctx, dest, map[string]any{
					"type":     "gossip",
					"messages": batch,
				})

				return err == nil
			}()

			if success {
				// success, move onto next batch of messages in channel
				break
			}

			time.Sleep(backoff)
			// double backoff to prevent "stampeding"
			backoff = min(maxBackoff, backoff*2)
			backoff += time.Duration(rand.Intn(50)) * time.Millisecond
		}
	}
}
