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
    CodeInspectionRegistration,
    CodeInspectionResult,
    CommandListenerInvocation,
} from "@atomist/sdm";
import {
    deepLink,
    GitHubRepoRef,
    Issue,
    logger,
} from "@atomist/automation-client";
import {
    listTodoCodeInspection,
    Todo,
} from "./listTodoCommand";
import _ = require("lodash");
import {
    createIssue,
    findIssue,
    updateIssue,
} from "@atomist/sdm-pack-issue/lib/review/issue";
import * as escapeStringRegexp from "escape-string-regexp";

const issueRepo: GitHubRepoRef = GitHubRepoRef.from({
    owner: "atomisthq",
    repo: "docs-issues",
});

const todoIssueCreation = async (
    allCodeInspectionResults: Array<CodeInspectionResult<Todo[]>>,
    inv: CommandListenerInvocation) => {
    for (const oneProjectCodeInspectionResult of allCodeInspectionResults) {
        const projectId = oneProjectCodeInspectionResult.repoId;
        const todos = oneProjectCodeInspectionResult.result
        const todosByFile = _.groupBy(todos, t => t.path);

        for (const fileWithTodos in todosByFile) {
            const relevantTodos = todosByFile[fileWithTodos];
            const title = `Improve ` + fileWithTodos;
            const existingIssue = await findIssue(inv.credentials, issueRepo, title);

            // there are some comments
            if (!existingIssue) {
                const issue: Issue = {
                    title,
                    body: `${bodyFormatter(relevantTodos, projectId as GitHubRepoRef)}`,
                };
                logger.info("Creating issue %j from review comment", issue);
                await createIssue(inv.credentials, issueRepo, issue);
            } else {
                // Supplement the issue if necessary, reopening it if need be
                const additionalTODOs = relevantTodos.
                    filter(c => !markdownIncludesTodo(existingIssue.body, c))
                if (additionalTODOs.length > 0) {
                    logger.info("Updating issue %d with the latest ", existingIssue.number);
                    const body = existingIssue.body + "\n" + bodyFormatter(additionalTODOs, projectId as GitHubRepoRef)
                    try {
                        await updateIssue(inv.credentials, issueRepo,
                            {
                                ...existingIssue,
                                state: "open",
                                body,
                            });
                    } catch (x) {
                        const e = x as Error;
                        await inv.addressChannels("Warning: tried to update issue " + existingIssue.url + " but got an error: " + e.stack)
                    }
                } else {
                    logger.info("Not updating issue %d; no new TODOs detected", existingIssue.number);
                }
            }
        }
    }
}

export const createIssueForTodos: CodeInspectionRegistration<Todo[]> = {
    name: "CreateIssueForTodos",
    intent: "create issues for TODOs",
    inspection: listTodoCodeInspection,
    onInspectionResults: todoIssueCreation,
};

export function bodyFormatter(reviewComments: Todo[], grr: GitHubRepoRef): string {
    const header = `Automatically created by atomist/docs-sdm, based on ${grr.owner}/${grr.repo}@${grr.sha}\n`
    return header + reviewComments.map(rc => todoToMarkdown(rc, grr)).join("");
}

function todoToMarkdown(c: Todo, grr: GitHubRepoRef): string {
    const loc = deepLinkToTodo(c, grr);
    return `- [ ] ${loc} \`${c.lineContent}\`\n`;
}

function deepLinkToTodo(c: Todo, grr: GitHubRepoRef): string {
    let loc: string = "";
    const line = (c.lineFrom1) ? `:${c.lineFrom1}` : "";
    loc = "`" + c.path + line + "`";
    const url = deepLink(grr, { lineFrom1: c.lineFrom1, path: c.path, offset: undefined });
    loc = `[${loc}](${url})`;
    loc += ": ";
    return loc;
}

export function markdownIncludesTodo(body: string, rc: Todo): boolean {
    const reString = `\\b${rc.lineFrom1}\\b.*${escapeStringRegexp(rc.lineContent)}\`?$`;
    // console.log("reString = " + reString);
    const r = new RegExp(reString, "m");
    // console.log("r = " + r);
    return r.test(body);
}