package server

// Message stores details relevant to a message. Each Message is marked by a
// unique snowflake.
type Message struct {
	Snowflake uint64 `json:"snowflake"`
	Content   int    `json:"content"`
}
