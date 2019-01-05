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

import {
    CodeTransformRegistration,
    PushAwareParametersInvocation,
    SdmContext,
    TransformResult,
} from "@atomist/sdm";
import {
    deepLink,
    GitHubRepoRef,
    logger,
    NoParameters,
    Project,
} from "@atomist/automation-client";
import {
    listTodoCodeInspection,
    Todo,
} from "./listTodoCommand";
import * as slack from "@atomist/slack-messages";
import _ = require("lodash");

export async function removeTodoTransform(p: Project, inv: PushAwareParametersInvocation<NoParameters>): Promise<TransformResult> {
    const todos = await listTodoCodeInspection(p, undefined);
    if (todos.length === 0) {
        return { edited: false, target: p, success: true };
    }

    const todosByFile = _.groupBy(todos, t => t.path);

    for (const path in todosByFile) {
        const todosWithinFile = todosByFile[path];
        for (const t of todosWithinFile) {
            if (partialHtmlComment(t.lineContent)) {
                await inv.addressChannels(warnAboutPartialHtmlComment(inv, p, t))
            }
        }
        const linesToDelete = todosWithinFile.map(t => t.lineFrom1);
        deleteLines(p, path, linesToDelete);
    }

    return { edited: true, target: p, success: true };
}

export const removeTodoTransformRegistration: CodeTransformRegistration = {
    name: "removeTodoTransform",
    intent: "remove all todos",
    transform: removeTodoTransform,
}

const htmlCommentBegins = /<\!--/g;
const htmlCommentEnds = /-->/g;

// this could be wrong if they do something weird
export function partialHtmlComment(line: string): boolean {
    const beginnings = countOccurrences(htmlCommentBegins, line);
    const endings = countOccurrences(htmlCommentEnds, line);
    return beginnings !== endings;
}

function countOccurrences(ofRegExp: RegExp, inString: string): number {
    if (!ofRegExp.global) {
        throw new Error("You forgot to use a global regexp. Add a g");
    }
    return (inString.match(ofRegExp) || []).length;
}

function warnAboutPartialHtmlComment(inv: SdmContext, p: Project, t: Todo): string {
    const linkToLine = deepLink(p.id as GitHubRepoRef, { lineFrom1: t.lineFrom1, path: t.path, offset: undefined })
    return `Warning: This is a partial HTML comment that I'm deleting. You're gonna need to fix it up.
${slack.url(linkToLine, t.path + ":" + t.lineFrom1)} \`${t.lineContent}\``;
}

export function dropLine(lineFrom1: number, fileContent: string) {
    const lines = fileContent.split("\n");
    return [...lines.slice(0, lineFrom1 - 1), ...lines.slice(lineFrom1)].join("\n");
}

async function deleteLines(project: Project, path: string, linesFrom1: number[]): Promise<void> {
    return updateFileContent(project, path, s => {
        let result = s;
        const linesInReverseOrder = _.sortBy(linesFrom1, t => 0 - t);
        linesInReverseOrder.forEach(n => {
            result = dropLine(n, result)
        });
        return result;
    });
}

async function updateFileContent(project: Project,
    path: string,
    updateFn: (s: string) => string): Promise<void> {
    const file = await project.getFile(path);
    const fileContent = await file.getContent();
    const newContent = updateFn(fileContent);
    // if (path === "docs/lifecycle.md") {
    //     console.log("Retrieved content from " + file.path + " and it is: " + fileContent);
    //     console.log("new content: " + newContent);
    // }
    await file.setContent(newContent);
    return;
}
