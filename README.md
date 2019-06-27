# @atomist/docs-sdm

[![npm version](https://img.shields.io/npm/v/@atomist/docs-sdm.svg)](https://www.npmjs.com/package/@atomist/docs-sdm)

[Atomist][atomist] software delivery machine ([SDM](https://docs.atomist.com/developer/sdm/)) for delivering our documentation.

This machine runs in our cloud (and [on my laptop](https://docs.atomist.com/developer/local/), when I want it to) and delivers our documentation. It builds the markdown into a site using mkdocs, then ships the output to s3.

See the results in the [Atomist docs][atomist-doc].

[atomist-doc]: https://docs.atomist.com/ (Atomist Documentation)

## Autofixes

### Update code snippets

To reference code from the [Atomist samples repository](https://github.com/atomist/samples), 
reference it like this, with the file path (lib/command/helloWorld.ts) and a snippet name (helloWorldCommandAdd): 

```
<!-- atomist:code-snippet:start=lib/command/helloWorld.ts#helloWorldCommandAdd -->

It doesn't matter what you put in here. It will be replaced (if the snippet reference resolves)

<!-- atomist:code-snippet:end -->
```
[(See this in commands.md)](https://github.com/atomist/docs/docs/developer/commands.md)

Meanwhile, get your code snippet into the master branch in [the referenced file in samples](https://github.com/atomist/samples/tree/master/lib/command/helloWorld.ts#L27-L34), like this, with a snippet name.

```typescript
// atomist:code-snippet:start=helloWorldCommandAdd
import { WeLoveToIncludeImportsInDocs } from "@atomist/sdm";

export function actualCodeGoesHere() {
    return "Hello, world!";
}
// atomist:code-snippet:end
```

The autofix will find the code in the samples repo and stick it between your delineating comments, along with a link to the source.
See the results in [the commands docs page](https://docs.atomist.com/developer/commands/index.html#register-your-command).

[include]: https://github.com/cmacmackin/markdown-include (GitHub repo for Markdown Include Extension)

## Prerequisites

See the [Atomist Developer documentation][atomist-dev] for
instructions on setting up your development environment.  Briefly, you
will need [Git][git], [Node.js][node], and the [Atomist
CLI][atomist-cli] installed and properly configured on your system.
With these installed, you can run this SDM in local mode.

To run this SDM for your team, you will need an Atomist workspace.
See the [Atomist Getting Started Guide][atomist-start] for
instructions on how to get an Atomist workspace and connect it to your
source code repositories, continuous integration, chat platform, etc.

[atomist-dev]: https://docs.atomist.com/developer/prerequisites/ (Atomist - Developer Prerequisites)
[git]: https://git-scm.com/ (Git)
[atomist-cli]: https://github.com/atomist/cli (Atomist Command-Line Interface)
[atomist-start]: https://docs.atomist.com/user/ (Atomist - Getting Started)

## Running

See the [Atomist Developer documentation][atomist-dev] for details on
how to run this SDM.  Briefly, once the prerequisites are met on your
system you can start the SDM in local mode with the following command:

```
$ atomist start --local
```

The Atomist documentation for [running SDMs][atomist-run] has
instructions for connecting and SDM to the Atomist API for software
and running an SDM in various environments.

[atomist-run]: https://docs.atomist.com/developer/run/ (Atomist - Running SDMs)

## Support

General support questions should be discussed in the `#support`
channel in the [Atomist community Slack workspace][slack].

If you find a problem, please create an [issue][].

[issue]: https://github.com/atomist/blank-sdm/issues

## Development

You will need to install [Node.js][node] to build and test this
project.

[node]: https://nodejs.org/ (Node.js)

### Build and test

Install dependencies.

```
$ npm install
```

Use the `build` package script to compile, test, lint, and build the
documentation.

```
$ npm run build
```

### Run locally in Docker

```
docker build -t docs-sdm .
```

To run in team mode, I need an API key accessible from the docker container. I populated #HOME/.atomist by running `atomist config` once.

```
docker run --rm --mount source=$HOME/.atomist,target=/root/.atomist,type=bind docs-sdm
```

### Release

Releases are handled via the [Atomist SDM][atomist-sdm].  Just press
the 'Approve' button in the Atomist dashboard or Slack.

[atomist-sdm]: https://github.com/atomist/atomist-sdm (Atomist Software Delivery Machine)

---

Created by [Atomist][atomist].
Need Help?  [Join our Slack workspace][slack].

[atomist]: https://atomist.com/ (Atomist - How Teams Deliver Software)
[slack]: https://join.atomist.com/ (Atomist Community Slack)
