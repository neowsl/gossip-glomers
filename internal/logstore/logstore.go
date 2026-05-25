package logstore

// LogStore is an append-only Kafka-style log store.
type LogStore interface {
	// Append inserts a new message to the log of the given key. It returns the
	// offset of the new message, guaranteed to be greater than any previous
	// offsets in the log.
	Append(key string, msg int) (offset int, err error)

	// Poll returns a map of keys to messages, where each message is guaranteed
	// to have an offset >= the given offset.
	Poll(offsets map[string]int) (msgs map[string][][2]int, err error)

	// Commit updates the offsets for each key in the store.
	Commit(offsets map[string]int) error

	// ListCommitted returns the committed offsets for each of the given keys.
	ListCommitted(keys []string) (offsets map[string]int, err error)
}

// Message represents a message that can be sent to / polled from a LogStore
type Message struct {
	Offset  int
	Content int
}
