# Goal: if you source this file, you'll be set up with handy aliases to run this project.
# And to develop on it.

# TODO: check that docker is running

if ! docker ps > /dev/null
then
   echo "
#######################################
Docker is not running. You'll need that.
#######################################
"
fi

DOCKER_TAG="docs-sdm"

alias docker-build='docker build -t $DOCKER_TAG'
echo " To build the docker image to run locally: docker-build"

ATOMIST_ROOT=${ATOMIST_ROOT:=$HOME/atomist}

echo "ATOMIST_ROOT = $ATOMIST_ROOT"

# TODO: you need to have docker builded
alias run-locally='docker run --rm
    -e ATOMIST_MODE=local
    --mount source=$ATOMIST_ROOT,target=$ATOMIST_ROOT
    -e ATOMIST_ROOT=$ATOMIST_ROOT
    --mount source=$HOME/.atomist,target=/root/.atomist,type=bind
    $DOCKER_TAG'
echo " To run the container so that you develop on atomist/docs and have this SDM respond: run-locally"