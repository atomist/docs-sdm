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

import * as assert from "assert";
import {
    GitHubRepoRef,
    ReviewComment,
} from "@atomist/automation-client";
import {
    bodyFormatter,
    reviewCommentInMarkdown,
} from "../../lib/machine/todoToIssue";

const fakeRR = GitHubRepoRef.from({ owner: "yes", repo: "no", sha: "1b1ef2c3004597682f69134fc4fcfbf20316f28d" });

const oneRC: ReviewComment = {
    detail: "I am a lizard",
    category: "todo",
    severity: "error",
    sourceLocation: {
        lineFrom1: 42,
        path: "docs/blah.md",
        offset: undefined,
    }
};

describe("Finding TODOs in the body", () => {
    it("Sees a todo that it already put there", async () => {
        const constructedBody = bodyFormatter([oneRC], fakeRR);

        assert(reviewCommentInMarkdown(constructedBody, oneRC));
    });

    it("Does not find it when it is on a different line number", () => {
        const anotherRC = { ...oneRC, sourceLocation: { ...oneRC.sourceLocation, lineFrom1: 4 } };
        const constructedBody = bodyFormatter([oneRC], fakeRR);
        assert(!reviewCommentInMarkdown(constructedBody, anotherRC));
    });

    it("Does not find it when it has a different content", () => {
        const anotherRC = { ...oneRC, detail: "Your mother was a lizard" };
        const constructedBody = bodyFormatter([oneRC], fakeRR);
        assert(!reviewCommentInMarkdown(constructedBody, anotherRC));
    });

    it("Can find a TODO in a string that regexp does not like", () => {
        const anotherRC = { ...oneRC, detail: "<!-- ** TODO you hate double asterisks -->" };
        const constructedBody = bodyFormatter([anotherRC], fakeRR);
        assert(reviewCommentInMarkdown(constructedBody, anotherRC));
    })
});