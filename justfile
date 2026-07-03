build:
    go install ./cmd/...

test-echo:
    maelstrom test -w echo --bin ~/go/bin/gossip-glomers --node-count 1 --time-limit 10 -- --challenge 1

test-unique-ids:
    maelstrom test -w unique-ids --bin ~/go/bin/gossip-glomers --time-limit 30 --rate 1000 --node-count 3 --availability total --nemesis partition -- --challenge 2

test-single-node-broadcast:
    maelstrom test -w broadcast --bin ~/go/bin/gossip-glomers --node-count 1 --time-limit 20 --rate 10 -- --challenge 3

test-multi-node-broadcast:
    maelstrom test -w broadcast --bin ~/go/bin/gossip-glomers --node-count 5 --time-limit 20 --rate 10 -- --challenge 3

test-fault-tolerant-broadcast:
    maelstrom test -w broadcast --bin ~/go/bin/gossip-glomers --node-count 5 --time-limit 20 --rate 10 --nemesis partition -- --challenge 3

test-efficient-broadcast-1:
    maelstrom test -w broadcast --bin ~/go/bin/gossip-glomers --node-count 25 --time-limit 20 --rate 100 --latency 100 -- --challenge 3

test-grow-only-counter:
    maelstrom test -w g-counter --bin ~/go/bin/gossip-glomers --rate 100 --time-limit 20 --nemesis partition -- --challenge 4

test-single-node-kafka:
    maelstrom test -w kafka --bin ~/go/bin/gossip-glomers --node-count 1 --concurrency 2n --time-limit 20 --rate 1000 -- --challenge 5a

test-multi-node-kafka:
    maelstrom test -w kafka --bin ~/go/bin/gossip-glomers --node-count 2 --concurrency 2n --time-limit 20 --rate 1000 -- --challenge 5b

serve:
    maelstrom serve

gen-logs:
    maelstrom test -w echo --bin ~/go/bin/gossip-glomers --node-count 1 --time-limit 10 -- --challenge 1
    maelstrom test -w unique-ids --bin ~/go/bin/gossip-glomers --time-limit 10 --rate 1000 --node-count 3 --availability total --nemesis partition -- --challenge 2
    maelstrom test -w broadcast --bin ~/go/bin/gossip-glomers --node-count 10 --time-limit 10 --rate 20 --nemesis partition -- --challenge 3
    maelstrom test -w g-counter --bin ~/go/bin/gossip-glomers --rate 100 --time-limit 5 --nemesis partition -- --challenge 4
