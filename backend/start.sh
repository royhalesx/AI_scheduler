#!/bin/sh
set -e

# On first boot the volume is empty — seed it with the bundled defaults
if [ ! -f /app/data/courses.json ]; then
  echo "Volume is empty — seeding with bundled data..."
  cp /app/defaults/courses.json /app/data/courses.json
  cp /app/defaults/rmp.json /app/data/rmp.json
  echo "Data seeded."
fi

exec /app/byu-scheduler
