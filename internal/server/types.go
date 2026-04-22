package server

type TopologyBody struct {
	Type     string              `json:"type"`
	Topology map[string][]string `json:"topology"`
}

type BroadcastBody struct {
	Type    string `json:"type"`
	Message int    `json:"message"`
}

type GossipBody struct {
	Type     string    `json:"type"`
	Messages []Message `json:"messages"`
}
