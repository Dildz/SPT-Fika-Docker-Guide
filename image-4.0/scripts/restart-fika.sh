# restart_fika.sh

## This script will restart the SPT-FIKA server Docker container and log the output to a file.
## It can be run manually from the file folder or set up as a cron task to automate the restart process.

#!/bin/bash

# Define the name of the container
CONTAINER_NAME="spt-fika"

# Define the path to the log file
LOG_FILE="/home/ubuntu/docker/containers/spt-fika/logs/spt-fika.log"

# Function to check if the Docker container is running
is_container_running() {
    docker inspect -f '{{.State.Running}}' $CONTAINER_NAME 2>/dev/null
}

echo "Checking if the $CONTAINER_NAME Docker container is running..."

# Stop the Docker container if it is running
if [ "$(is_container_running)" = "true" ]; then
    echo "$CONTAINER_NAME container is running. Stopping the container..."
    docker stop $CONTAINER_NAME

    # Wait for 10 seconds
    echo "Waiting for 10 seconds after stopping the container..."
    sleep 10
else
    echo "$CONTAINER_NAME container is not running. No need to stop it."
fi

# Capture the current timestamp
timestamp=$(date --iso-8601=seconds)
echo "Captured current timestamp: $timestamp"

# Clear the log file
echo "Clearing the log file..."
> "$LOG_FILE"

# Start the Docker container
echo "Starting the $CONTAINER_NAME Docker container..."
docker start $CONTAINER_NAME

# Parse the existing Docker logs and continue logging in real-time
echo "Parsing and tailing the Docker logs for $CONTAINER_NAME..."
docker logs -f $CONTAINER_NAME > "$LOG_FILE" 2>&1 &

echo "Logs are being written to $LOG_FILE"
echo "Tailing $CONTAINER_NAME logs in:"
sleep 1
echo "3"
sleep 1
echo "2"
sleep 1
echo "1"
sleep 1

docker logs $CONTAINER_NAME -f

