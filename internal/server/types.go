package server

type BaseBody struct {
	Type string `json:"type"`
}

type TopologyBody struct {
	BaseBody
	Topology map[string][]string `json:"topology"`
}

type BroadcastBody struct {
	BaseBody
	Message int `json:"message"`
}

type GossipBody struct {
	BaseBody
	Messages []Message `json:"messages"`
}

type AddBody struct {
	BaseBody
	Delta int `json:"delta"`
}

type SendBody struct {
	BaseBody
	Key string `json:"key"`
	Msg int    `json:"msg"`
}

type PollBody struct {
	BaseBody
	Offsets map[string]int `json:"offsets"`
}

type CommitOffsetsBody = PollBody

type ListCommittedOffsetsBody struct {
	BaseBody
	Keys []string `json:"keys"`
}
