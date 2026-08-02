#!/bin/bash

## This script will randomly select a new background image for the SPT-FIKA launcher.
## It is called by a cron task created in post-setup.sh to change the background image daily.

# Define the source directories and target file
source_dirs=(
  "/home/ubuntu/docker/containers/spt-fika/fika/SPT-launcher-images/alt1/bg.png"
  "/home/ubuntu/docker/containers/spt-fika/fika/SPT-launcher-images/alt2/bg.png"
  "/home/ubuntu/docker/containers/spt-fika/fika/SPT-launcher-images/alt3/bg.png"
  "/home/ubuntu/docker/containers/spt-fika/fika/SPT-launcher-images/alt4/bg.png"
  "/home/ubuntu/docker/containers/spt-fika/fika/SPT-launcher-images/alt5/bg.png"
  "/home/ubuntu/docker/containers/spt-fika/fika/SPT-launcher-images/alt6/bg.png"
  "/home/ubuntu/docker/containers/spt-fika/fika/SPT-launcher-images/original/bg.png"
)
target_file="/home/ubuntu/docker/containers/spt-fika/server/user/mods/fika-server/assets/images/launcher/bg.png"

# Get the size of the current target file
if [ -f "$target_file" ]; then
  target_size=$(stat -c%s "$target_file")
else
  target_size=0
fi

# Function to get the size of a file
get_file_size() {
  local file=$1
  stat -c%s "$file"
}

# Select a new image index, ensuring its size is different from the target file size
new_index=-1
new_size=$target_size

while [ "$new_size" -eq "$target_size" ]; do
  new_index=$((RANDOM % ${#source_dirs[@]}))
  new_size=$(get_file_size "${source_dirs[$new_index]}")
done

# Copy the new image to the target location, forcing overwrite
cp -f "${source_dirs[$new_index]}" "$target_file"
