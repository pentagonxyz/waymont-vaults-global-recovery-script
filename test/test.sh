#!/bin/sh
START_TIMESTAMP=$(date +%s)
node node_modules/.bin/hardhat node > node.log &
HARDHAT_NODE_PID=$!
while true
do
    if grep "Started HTTP and WebSocket JSON-RPC server at" node.log
    then
        npx hardhat test --network localhost
        pkill -P $$
        rm node.log
        exit 0
    elif ! ps -p $HARDHAT_NODE_PID > /dev/null
    then
        echo "Hardhat node background process exited before tests could run."
        pkill -P $$
        rm node.log
        exit 1
    elif [ $(($(date +%s) - "$START_TIMESTAMP")) -ge 10 ]
    then
        echo 'Timed out after waiting 10 seconds for Hardhat node to start. Try manually running `npx hardhat node` and `npx hardhat test --network localhost`.'
        pkill -P $$
        rm node.log
        exit 1
    fi
done
