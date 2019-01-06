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
    RepoRef,
} from "@atomist/automation-client";
import { gatherFromFiles } from "@atomist/automation-client/lib/project/util/projectUtils";
import {
    CodeInspection,
    CodeInspectionRegistration,
    CodeInspectionResult,
    CommandListenerInvocation,
} from "@atomist/sdm";
import * as slack from "@atomist/slack-messages";
import _ = require("lodash");

const todoRegex = /\btodo\b/i;
const tbdRegex = /\btbd\b/i;

export interface Todo {
    path: string;
    lineFrom1: number;
    lineContent: string;
    emphasis: number;
}
/*
 * This does not need to be a transform. It does not change the project.
 * I just want to run a command with access to the project and this gets me that
 */
export const listTodoCodeInspection: CodeInspection<Todo[]> = async (project, inv) => {
    const todos: Todo[] = _.flatten(await gatherFromFiles(project, "**/*.md", async f => {
        const lines: string[] = (await f.getContent()).split("\n");
        const items = lines
            .map((l, i) => {
                if (todoRegex.test(l) || tbdRegex.test(l)) {
                    const item: Todo = {
                        path: f.path,
                        lineFrom1: i + 1,
                        lineContent: l,
                        emphasis: howBadIsIt(l),
                    };
                    return item;
                }
                return undefined;
            });
        return items.filter(a => !!a);
    }));
    return _.sortBy(todos, t => 0 - t.emphasis);
};

const commonIncludeRegex = /{!.*!}/g;
const htmlCommentRegex = /<!--/g;

function howBadIsIt(todoLine: string): number {
    const asterisks = todoLine.split("*").length - 1;
    const withoutSyntaxExclamations = todoLine
        .replace(commonIncludeRegex, "")
        .replace(htmlCommentRegex, "");
    const exclamations = withoutSyntaxExclamations.split("!").length - 1;

    return asterisks + exclamations;
}

async function reportTodos(
    results: Array<CodeInspectionResult<Todo[]>>,
    inv: CommandListenerInvocation): Promise<void> {
    await Promise.all(results.map(async r =>
        inv.addressChannels(constructMessage(r.repoId, r.result)),
    ));
    return;
}

function constructMessage(projectId: RepoRef, todos: Todo[]): slack.SlackMessage {
    const header = `There are ${todos.length} TODOs in ` +
        slack.url(projectId.url, `${projectId.owner}/${projectId.repo}`) +
        (todos.length > 0 ? ":" : ".");

    const message: slack.SlackMessage = {
        text: header,
        attachments: [{
            fallback: "All the todos",
            text: todos.map(t => constructTodoLine(projectId, t)).join("\n"),
        }],
        unfurl_links: false,
        unfurl_media: false,
    };
    return message;
}

function constructTodoLine(projectId: RepoRef, todo: Todo): string {
    const branch = projectId.branch || "master";
    return slack.url(`${projectId.url}/edit/${branch}/${todo.path}#L${todo.lineFrom1}`,
        `${todo.path}:${todo.lineFrom1}`) +
        ` ${todo.lineContent}`;
}

export function listTodoCodeInspectionRegistration(): CodeInspectionRegistration<Todo[]> {
    return {
        name: "listTodo",
        intent: ["list todos", "what needs done"],
        inspection: listTodoCodeInspection,
        onInspectionResults: reportTodos,
    };
}
