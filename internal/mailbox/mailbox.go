package mailbox

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

type Config struct {
	// The maximum number of envelopes to send in one RPC request.
	MaxEnvelopesPerBatch int
	// The maximum time to wait before retrying a failed RPC request.
	MaxBackoff time.Duration
}

// Envelope[T] pairs the type-specific payload with routing and deduplication
// fields.
type Envelope[T any] struct {
	Src       string       `json:"src"`
	Snowflake snowflake.ID `json:"snowflake"`
	Content   T            `json:"content"`
}

type TopologyBody struct {
	service.BaseBody
	Topology map[string][]string `json:"topology"`
}

type mailboxBatchGossipBody[T any] struct {
	service.BaseBody
	Envelopes []Envelope[T] `json:"envelopes"`
}

// Mailbox holds logic for delivering messages between nodes.
// SetNode and SetTopology must be called before sending messages.
// OnEnvelopeReceived may be directly set to subscribe to new envelopes.
type Mailbox[T any] struct {
	cfg                Config
	node               *maelstrom.Node
	mu                 sync.RWMutex
	gen                *snowflake.Generator
	adj                []string
	envelopes          map[snowflake.ID]Envelope[T]
	outgoing           map[string]chan Envelope[T]
	OnEnvelopeReceived func(envelope Envelope[T])
}

func New[T any](config Config) *Mailbox[T] {
	return &Mailbox[T]{
		cfg:                config,
		envelopes:          make(map[snowflake.ID]Envelope[T], 1024),
		outgoing:           make(map[string]chan Envelope[T]),
		OnEnvelopeReceived: func(_ Envelope[T]) {},
	}
}

// SetNode sets this Mailbox's node, initialises the Snowflake ID generator,
// and sets up a handler for the receiving end.
func (m *Mailbox[T]) SetNode(node *maelstrom.Node) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.node = node
	m.gen = snowflake.NewGenerator(node.ID())

	m.node.Handle("mailbox_batch_gossip", func(msg maelstrom.Message) error {
		var body mailboxBatchGossipBody[T]
		if err := json.Unmarshal(msg.Body, &body); err != nil {
			return err
		}

		// only send unseen Envelopes to avoid infinite cycle
		newEnvelopes := make([]Envelope[T], 0, len(body.Envelopes))

		m.mu.Lock()
		for _, e := range body.Envelopes {
			// prevent infinite cycle if already seen
			if _, seen := m.envelopes[e.Snowflake]; seen {
				continue
			}

			go m.OnEnvelopeReceived(e)

			m.envelopes[e.Snowflake] = e
			newEnvelopes = append(newEnvelopes, e)
		}
		neighbours := m.adj
		m.mu.Unlock()

		// stop gossip chain if no new Envelopes
		if len(newEnvelopes) > 0 {
			for _, e := range newEnvelopes {
				for _, n := range neighbours {
					if n == e.Src || n == msg.Src {
						continue
					}

					m.outgoing[n] <- e
				}
			}
		}

		return node.Reply(msg, map[string]any{
			"type": "mailbox_batch_gossip_ok",
		})
	})
}

// SetTopology sets this Mailbox's topology and initialises outgoing channels.
func (m *Mailbox[T]) SetTopology(topology map[string][]string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.adj = topology[m.node.ID()]

	// initialise all channels and workers so we don't have to do it later
	for _, n := range m.adj {
		ch := make(chan Envelope[T], 10000)
		m.outgoing[n] = ch
		go m.spawnNeighbourWorker(n)
	}
}

// SendAll appends the message to this Mailbox's messages and broadcasts the
// message to all other nodes along the topology.
// Returns the sent envelope.
func (m *Mailbox[T]) SendAll(message T) Envelope[T] {
	newEnvelope := Envelope[T]{
		Src:       m.node.ID(),
		Snowflake: m.gen.NextID(),
		Content:   message,
	}

	m.mu.Lock()
	m.envelopes[newEnvelope.Snowflake] = newEnvelope
	m.mu.Unlock()

	for _, n := range m.adj {
		m.outgoing[n] <- newEnvelope
	}

	return newEnvelope
}

// Read returns all the messages in this Mailbox.
func (m *Mailbox[T]) Read() []T {
	m.mu.RLock()
	defer m.mu.RUnlock()

	res := make([]T, 0, len(m.envelopes))
	for _, e := range m.envelopes {
		res = append(res, e.Content)
	}

	return res
}

// spawnNeighbourWorker() spawns a new goroutine that consumes Envelopes from
// the outgoing channel and forwards them to dest, waiting until dest becomes
// responsive if it goes offline.
func (m *Mailbox[T]) spawnNeighbourWorker(dest string) {
	ch := m.outgoing[dest]

	for firstMsg := range ch {
		// batch-send envelopes to avoid overloading network
		// prepare batch first, then commit to sending (otherwise data will be
		// lost)
		batch := []Envelope[T]{firstMsg}

		for range m.cfg.MaxEnvelopesPerBatch - 1 {
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
				ctx, cancel := context.WithTimeout(
					context.Background(),
					2*time.Second,
				)
				defer cancel()

				// SyncRPC will error if Envelope was not received (i.e. we
				// will get an ACK if envelope was received).
				_, err := m.node.SyncRPC(ctx, dest, map[string]any{
					"type":      "mailbox_batch_gossip",
					"envelopes": batch,
				})

				return err == nil
			}()

			if success {
				// success, move onto next batch of Envelopes in channel
				break
			}

			time.Sleep(backoff)
			// double backoff to prevent "stampeding"
			backoff = min(m.cfg.MaxBackoff, backoff*2)
			backoff += time.Duration(rand.Intn(50)) * time.Millisecond
		}
	}
}
