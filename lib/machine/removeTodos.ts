import { TransformResult, PushAwareParametersInvocation, CodeTransformRegistration, SdmContext } from "@atomist/sdm";
import { Project, NoParameters, deepLink, GitHubRepoRef, logger } from "@atomist/automation-client";
import { listTodoCodeInspection, Todo } from "./listTodoCommand";
import * as slack from "@atomist/slack-messages";
import _ = require("lodash");

export async function removeTodoTransform(p: Project, inv: PushAwareParametersInvocation<NoParameters>): Promise<TransformResult> {
    const todos = await listTodoCodeInspection(p, undefined);
    if (todos.length === 0) {
        return { edited: false, target: p, success: true };
    }

    await asyncForEach(laterInTheFileIsFirst(todos), async t => {
        if (partialHtmlComment(t.lineContent)) {
            await inv.addressChannels(warnAboutPartialHtmlComment(inv, p, t))
        }
        deleteLine(p, t.path, t.lineFrom1);
    })

    return { edited: true, target: p, success: true };
}

export const removeTodoTransformRegistration: CodeTransformRegistration = {
    name: "removeTodoTransform",
    intent: "remove all todos",
    transform: removeTodoTransform,
}

// when deleting by line number, don't screw up the line numbers of later lines we delete
function laterInTheFileIsFirst(todos: Todo[]): Todo[] {
    return _.sortBy(todos, t => 0 - t.lineFrom1)
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

async function deleteLine(project: Project, path: string, lineFrom1: number): Promise<void> {
    return updateFileContent(project, path, s => dropLine(lineFrom1, s));
}

async function updateFileContent(project: Project,
    path: string,
    updateFn: (s: string) => string): Promise<void> {
    const file = await project.getFile(path);
    const fileContent = await file.getContent();
    const newContent = updateFn(fileContent);
    if (path === "docs/lifecycle.md") {
        logger.info("Retrieved content from " + file.path + " and it is: " + fileContent);
        logger.info("new content: " + newContent);
    }
    await file.setContent(newContent);
    return;
}

async function asyncForEach<T>(array: T[], fn: (t: T) => Promise<any>) {
    return Promise.all(array.map(fn));
}