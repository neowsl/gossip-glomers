package transaction

// Store is a transaction store with atomic Read and Write operations.
type Store interface {
	// Read returns the current value of the key.
	// Returns a nil value for non-existent keys.
	Read(key int) (value *int, err error)

	// Write sets the value of the key.
	Write(key, value int) error
}
