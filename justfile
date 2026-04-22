build:
    go install ./cmd/...

test-echo:
    maelstrom test -w echo --bin ~/go/bin/gossip-glomers --node-count 1 --time-limit 10

test-unique-ids:
    maelstrom test -w unique-ids --bin ~/go/bin/gossip-glomers --time-limit 30 --rate 1000 --node-count 3 --availability total --nemesis partition

test-single-node-broadcast:
    maelstrom test -w broadcast --bin ~/go/bin/gossip-glomers --node-count 1 --time-limit 20 --rate 10

test-multi-node-broadcast:
    maelstrom test -w broadcast --bin ~/go/bin/gossip-glomers --node-count 5 --time-limit 20 --rate 10

test-fault-tolerant-broadcast:
    maelstrom test -w broadcast --bin ~/go/bin/gossip-glomers --node-count 5 --time-limit 20 --rate 10 --nemesis partition

test-efficient-broadcast-1:
    maelstrom test -w broadcast --bin ~/go/bin/gossip-glomers --node-count 25 --time-limit 20 --rate 100 --latency 100

serve:
    maelstrom serve
