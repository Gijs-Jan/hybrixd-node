#!/bin/bash

WHEREAMI=`pwd`

# $HYBRIXD/$NODE/scripts/npm  => $HYBRIXD
SCRIPTDIR="`dirname \"$0\"`"
HYBRIXD="`cd \"$SCRIPTDIR/../../..\" && pwd`"

NODE="$HYBRIXD/node"
DETERMINISTIC="$HYBRIXD/deterministic"
NODEJS="$HYBRIXD/nodejs-v8-lts"
COMMON="$HYBRIXD/common"
INTERFACE="$HYBRIXD/interface"
WEB_WALLET="$HYBRIXD/web-wallet"

if [ -z "$1" ]; then
    NODES=2
else
    NODES=$1
fi

if [ "$NODES" -gt "1" ]; then
    SERVERLINE=$(grep "servers" "$NODE/hybrixd.conf" | grep -v \# )

    RESTPORT=1111
    USERPORT=8080

    # Rouke: Disabled untill further notice
    # Bootscript : add other nodes as peers to first node (which will be captian)
    #echo "{\"quartz\":{\"main\":[" > "$NODE/boot.json"
    #for (( i=2; i<=$NODES; i++ ))
    #do
    #    echo "\"rout('/engine/cluster/add/localhost:$((RESTPORT+$i-1))')\"," >> "$NODE/boot.json"
    #done
    #echo "\"stop(0,'Done')\"" >> "$NODE/boot.json"
    #echo "]}}" >> "$NODE/boot.json"

    for (( i=2; i<=$NODES; i++ ))
    do
        echo " [i] cluster: preparing node $i..."

        if [ "$i" -ne "1" ]; then
            rsync -aK "$NODE/" "$NODE$i/"

            #increment restport and userport
            #       NEWSERVERLINE="{ \"http:\/\/127.0.0.1:"$((RESTPORT+$i-1))"\" : \"\/root\", \"http:\/\/127.0.0.1:"$((USERPORT+$i-1))"\" : \"\/source\/web-wallet\"}"
            #        sed -i -e 's/'"$SERVERLINE"'/'"$NEWSERVERLINE"'/g' "$NODE$i/hybrixd.conf"
            #      echo sed -i -e 's/'"$SERVERLINE"'/'"$NEWSERVERLINE"'/g' "$NODE$i/hybrixd.conf"
            sed -i -e 's/':"$RESTPORT"'/':"$((RESTPORT+$i-1))"'/g' "$NODE$i/hybrixd.conf"
            sed -i -e 's/':"$USERPORT"'/':"$((USERPORT+$i-1))"'/g' "$NODE$i/hybrixd.conf"
        fi

        #force set encryption pubkeys TESTING!
        if [ "$i" -eq "1" ]; then
            KEYLINE="keysFile = hybrixd1.keys"
        elif [ "$i" -eq "2" ]; then
            KEYLINE="keysFile = hybrixd2.keys"
        fi
        if [ "$i" -eq "3" ]; then
            KEYLINE="keysFile = hybrixd3.keys"
        fi
        # Replace or append line to define nodeID
        echo "$KEYLINE" >> "$NODE$i/hybrixd.conf"
            #sed -i -e 's/'"$NODELINE"'/'"$NEWNODELINE"'/g' "$NODE$i/hybrixd.conf"

        if [ "$i" -ne "1" ]; then
            cd "$NODE$i"

            # Rouke: Disabled untill further notice
            # Bootscript : aAdd other nodes as peers, first as captain
            #echo "{\"quartz\":{\"main\":[" > boot.json
            #echo "\"rout('/engine/cluster/captain/localhost:$((RESTPORT))')\","  >> boot.json
            #for (( j=2; j<=$NODES; j++ ))
            #do
            #    if [ "$i" != "$j" ]; then
            #        echo "\"rout('/engine/cluster/add/localhost:$((RESTPORT+$j-1))')\"," >> boot.json
            #    fi
            #done
            #echo "\"stop(0,'Done')\"" >> boot.json
            #echo "]}}" >> boot.json

            # Start node i in the background
            echo " [i] cluster: starting node $i (in background)..."

            sh "$NODE$i/hybrixd" &
        fi

    done
fi

# Start main node
echo " [i] cluster: starting node 1..."
cd "$NODE"
sh "$NODE/hybrixd"

cd "$WHEREAMI"
