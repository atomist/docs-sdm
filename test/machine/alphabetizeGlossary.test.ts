/*
 * Copyright © 2019 Atomist, Inc.
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

import { InMemoryProject } from "@atomist/automation-client";
import * as assert from "assert";
import { alphabetizeGlossary } from "../../lib/machine/alphabetizeGlossary";

describe("alphabetizeGlossary transform", () => {
    it("does nothing when the glossary file is not there", async () => {
        const projectWithNonMarkdownFile = InMemoryProject.of({ path: "stuff", content: "things" });
        const result = await alphabetizeGlossary(projectWithNonMarkdownFile);
        assert(result.success);
        assert(!result.edited);
    });

    it("alphabetizes one that is there", async () => {
        const projectWithMarkdownFile = InMemoryProject.of({
            path: "docs/glossary.md",
            content: outOfOrderGlossary(),
        });
        const result = await alphabetizeGlossary(projectWithMarkdownFile);
        assert(result.success);
        assert(result.edited);

        const newContent = (await projectWithMarkdownFile.getFile("docs/glossary.md")).getContentSync();
        assert.strictEqual(newContent, orderedGlossary(), newContent);
    });
});

function outOfOrderGlossary(): string {
    return `#### stuff
Stuff is great.

#### things
Things are great too

#### armadillos
This starts with A

#### Super thing
This is after stuff but before thing
`;
}

function orderedGlossary(): string {
    return `#### armadillos
This starts with A

#### stuff
Stuff is great.

#### Super thing
This is after stuff but before thing

#### things
Things are great too
`;
}
