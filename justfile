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

test-efficient-kafka:
    maelstrom test -w kafka --bin ~/go/bin/gossip-glomers --node-count 2 --concurrency 2n --time-limit 20 --rate 1000 -- --challenge 5c

test-single-node-transactions:
    maelstrom test -w txn-rw-register --bin ~/go/bin/gossip-glomers --node-count 1 --time-limit 20 --rate 1000 --concurrency 2n --consistency-models read-uncommitted --availability total -- --challenge 6a

test-read-uncommitted-transactions:
    maelstrom test -w txn-rw-register --bin ~/go/bin/gossip-glomers --node-count 2 --concurrency 2n --time-limit 20 --rate 1000 --consistency-models read-uncommitted --availability total --nemesis partition -- --challenge 6b

serve:
    maelstrom serve

gen-logs:
    maelstrom test -w echo --bin ~/go/bin/gossip-glomers --node-count 1 --time-limit 10 -- --challenge 1
    just export-log echo
    maelstrom test -w unique-ids --bin ~/go/bin/gossip-glomers --time-limit 10 --rate 1000 --node-count 3 --availability total --nemesis partition -- --challenge 2
    just export-log unique-ids
    maelstrom test -w broadcast --bin ~/go/bin/gossip-glomers --node-count 10 --time-limit 10 --rate 20 --nemesis partition -- --challenge 3
    just export-log broadcast
    maelstrom test -w g-counter --bin ~/go/bin/gossip-glomers --rate 100 --time-limit 5 --nemesis partition -- --challenge 4
    just export-log g-counter
    maelstrom test -w kafka --bin ~/go/bin/gossip-glomers --node-count 9 --concurrency 2n --time-limit 5 --rate 100 -- --challenge 5c
    just export-log kafka-log

export-log challenge run-dir="store/current":
    #!/usr/bin/env bash
    set -euo pipefail
    maelstrom_bin="$(readlink -f "$(command -v maelstrom)")"
    package_root="$(dirname "$(dirname "$maelstrom_bin")")"
    jar="$package_root/share/maelstrom/lib/maelstrom.jar"
    if [[ ! -f "$jar" ]]; then
        jar="$(dirname "$maelstrom_bin")/lib/maelstrom.jar"
    fi
    java -cp "$jar" clojure.main scripts/export-maelstrom.clj \
        "{{run-dir}}" "visualizer/public/logs/{{challenge}}.json" "{{challenge}}"
