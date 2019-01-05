import { removeTodoTransformRegistration, removeTodoTransform } from './../../lib/machine/removeTodos';
import * as assert from "assert";
import { partialHtmlComment, dropLine } from "../../lib/machine/removeTodos";

describe("partial HTML comment", () => {
    it("Should not see a full comment as a partial comment", () => {
        assert(!partialHtmlComment("<!-- I am a whole comment -->"));
        assert(partialHtmlComment("<!-- it starts here"));
        assert(!partialHtmlComment("There is nothing to see here"));
        assert(partialHtmlComment("  it ends here --> and the markdown continues"));
    });
});

describe("dropping a line", () => {
    it("drops a line from the middle", () => {
        const input = `one
    two
    three`;
        const output = `one
    three`;
        assert.deepEqual(dropLine(2, input), output);
    });

    it("drops a line from the end", () => {
        const input = `one
    two
    three`;
        const output = `one
    two`;
        assert.deepEqual(dropLine(3, input), output);
    });
});

import { InMemoryProject } from "@atomist/automation-client";

const lifecycleDotMd = `Chat notifications about pushes, builds, pull requests, issues, and issue comments are
fewer and far more useful when they're correlated by Atomist. You get one message per push, and 
that message updates as new information comes in. Less spam in your channels! Even better, 
the messages have buttons that make them useful.

## Messages

<!-- TODO: look another one hello today -->

### Push 

A code push is the most recognized event in the delivery process.


<!-- ** TODO YO ** -->

### Pull Request

<!-- todo again -->

:truth: *TODO*

### Build

Build status is included on the push notification.
If a build fails, the person who made the commit gets a private message with a link to the log.

### Issue

{!tbd.md!}

### Issue Comment

I can change this here

## Linked Channels

{!tbd.md!}

## Configuring messages

{!tbd.md!}`

describe("the whole transform", () => {
    it("handles this case with a TBD at the end", async () => {
        const p = InMemoryProject.of({ path: "docs/lifecycle.md", content: lifecycleDotMd });
        const result = await removeTodoTransform(p, undefined);
        assert(result.edited);
        const newContent = await p.getFile("docs/lifecycle.md").then(f => f.getContent());
        const lines = newContent.split("\n").length;
        const oldLines = lifecycleDotMd.split("\n").length;
        assert.strictEqual(lines, oldLines - 7);
        assert.notDeepEqual(newContent, lifecycleDotMd);
        assert(newContent.endsWith("## Configuring messages\n"));
    });
});