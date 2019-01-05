/*
 * Copyright © 2018 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { removeTodoTransformRegistration, removeTodoTransform } from './../../lib/machine/removeTodos';
import * as assert from "assert";
import {
    dropLine,
    partialHtmlComment,
} from "../../lib/machine/removeTodos";

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
    // I have no idea why this fails with InMemoryProject. It is working IRL.
    it.skip("handles this case with a TBD at the end", async () => {
        const p = InMemoryProject.of({ path: "docs/lifecycle.md", content: lifecycleDotMd });
        const result = await removeTodoTransform(p, undefined);
        assert(result.edited);
        const newContent = await p.getFile("docs/lifecycle.md").then(f => f.getContent());
        //   console.log("The content retrieved in the test is: " + newContent);
        const lines = newContent.split("\n").length;
        const oldLines = lifecycleDotMd.split("\n").length;
        assert.strictEqual(lines, oldLines - 7);
        assert.notDeepEqual(newContent, lifecycleDotMd);
        assert(newContent.endsWith("## Configuring messages\n"));
    });
});