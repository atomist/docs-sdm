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
    markdownIncludesTodo,
} from "../../lib/machine/todoToIssue";
import { Todo } from "../../lib/machine/listTodoCommand";

const fakeRR = GitHubRepoRef.from({ owner: "yes", repo: "no", sha: "1b1ef2c3004597682f69134fc4fcfbf20316f28d" });

const oneTodo: Todo = {
    lineContent: "I am a lizard",
    lineFrom1: 42,
    path: "docs/blah.md",
    emphasis: 0,
};

describe("Finding TODOs in the body", () => {
    it("Sees a todo that it already put there", async () => {
        const constructedBody = bodyFormatter([oneTodo], fakeRR);

        assert(markdownIncludesTodo(constructedBody, oneTodo));
    });

    it("Does not find it when it is on a different line number", () => {
        const anotherTodo = { ...oneTodo, lineFrom1: 4 };
        const constructedBody = bodyFormatter([oneTodo], fakeRR);
        assert(!markdownIncludesTodo(constructedBody, anotherTodo));
    });

    it("Does not find it when it has a different content", () => {
        const anotherTodo = { ...oneTodo, lineContent: "Your mother was a lizard" };
        const constructedBody = bodyFormatter([oneTodo], fakeRR);
        assert(!markdownIncludesTodo(constructedBody, anotherTodo));
    });

    it("Can find a TODO in a string that regexp does not like", () => {
        const anotherTodo = { ...oneTodo, lineContent: "<!-- ** TODO you hate double asterisks -->" };
        const constructedBody = bodyFormatter([anotherTodo], fakeRR);
        assert(markdownIncludesTodo(constructedBody, anotherTodo));
    })
});