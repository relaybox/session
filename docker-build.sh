# Get version from package.json
VERSION=$(cat package.json | grep '"version":' | awk -F'"' '{print $4}')

# Tag the image with both 'latest' and the specific version number
docker build -t relaybox/session:latest -t relaybox/session:$VERSION .
