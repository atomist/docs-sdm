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
DOCKER_CONTAINER_NAME="docs-sdm-running-locally"

alias docker-build='docker build -t $DOCKER_TAG .'
echo " To build the docker image to run locally: docker-build"

ATOMIST_ROOT=${ATOMIST_ROOT:=$HOME/atomist}

echo "ATOMIST_ROOT = $ATOMIST_ROOT"

RUN_LOCALLY_COMMAND="docker run --rm \
    -e ATOMIST_MODE=local \
    -p 2866:2866 \
    --mount source=$ATOMIST_ROOT,target=$ATOMIST_ROOT,type=bind \
    -e ATOMIST_ROOT=$ATOMIST_ROOT \
    --mount source=$HOME/.atomist,target=/root/.atomist,type=bind \
    --name $DOCKER_CONTAINER_NAME \
    $DOCKER_TAG"

alias run-locally='echo "$RUN_LOCALLY_COMMAND" && $RUN_LOCALLY_COMMAND'
echo " To run the container so that you develop on atomist/docs and have this SDM respond: run-locally"

alias shell-into-container="docker exec -it ${DOCKER_CONTAINER_NAME} /bin/bash"
echo " To shell into the running container: shell-into-container"