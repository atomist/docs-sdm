import { ReviewListener, CodeInspection, ReviewListenerInvocation, CodeInspectionRegistration, ReviewListenerRegistration } from "@atomist/sdm";
import { ProjectReview, NoParameters, Project, ReviewComment, GitHubRepoRef, Issue, deepLink, logger, ProjectOperationCredentials, RemoteRepoRef, TokenCredentials } from "@atomist/automation-client";
import { listTodoCodeInspection, Todo } from "./listTodoCommand";
import _ = require("lodash");
import { findIssue, createIssue, KnownIssue } from "@atomist/sdm-pack-issue/lib/review/issue";
import { github } from "@atomist/sdm-core";

import axios, { AxiosRequestConfig } from "axios";

const todosAsProjectReview: CodeInspection<ProjectReview, NoParameters> =
    async (p: Project) => {
        function todoToReviewComment(todo: Todo): ReviewComment {
            return {
                severity: "error",
                category: "todo",
                detail: todo.lineContent,
                sourceLocation: {
                    path: todo.path,
                    lineFrom1: todo.lineFrom1,
                    offset: undefined,
                },
            }
        }
        const todos = await listTodoCodeInspection(p, undefined);
        return {
            repoId: p.id,
            comments: todos.map(todoToReviewComment),
        }
    };

export const TodoAutoInspection: CodeInspectionRegistration<ProjectReview> = {
    name: "TodoAutoInspection",
    inspection: todosAsProjectReview,
}

const issueRepo: GitHubRepoRef = GitHubRepoRef.from({
    owner: "atomisthq",
    repo: "docs-issues",
});

const todoIssueCreationInspectionListener: ReviewListener = async (ri: ReviewListenerInvocation) => {
    const todoComments: ReviewComment[] = ri.review.comments.filter(rc => rc.category === "todo");
    const todosByFile = _.groupBy(todoComments, t => t.sourceLocation.path);

    for (const fileWithTodos in todosByFile) {
        const relevantComments = todosByFile[fileWithTodos];
        const title = `Improve ` + fileWithTodos;
        const existingIssue = await findIssue(ri.credentials, issueRepo, title);

        // there are some comments
        if (!existingIssue) {
            const issue: Issue = {
                title,
                body: `${bodyFormatter(relevantComments, ri.id as GitHubRepoRef)}`,
            };
            logger.info("Creating issue %j from review comment", issue);
            await createIssue(ri.credentials, issueRepo, issue);
        } else {
            // Supplement the issue if necessary, reopening it if need be
            const additionalTODOs = relevantComments.
                filter(c => !reviewCommentInMarkdown(existingIssue.body, c))
            if (additionalTODOs.length > 0) {
                logger.info("Updating issue %d with the latest ", existingIssue.number);
                const body = existingIssue.body + "\n" + bodyFormatter(additionalTODOs, ri.id as GitHubRepoRef)
                try {
                    await updateIssue(ri.credentials, issueRepo,
                        {
                            ...existingIssue,
                            state: "open",
                            body,
                        });
                } catch (x) {
                    const e = x as Error;
                    await ri.addressChannels("Warning: tried to update issue " + existingIssue.url + " but got an error: " + e.stack)
                }
            } else {
                logger.info("Not updating issue %d; no new TODOs detected", existingIssue.number);
            }
        }
    }
}

export async function updateIssue(credentials: ProjectOperationCredentials, rr: RemoteRepoRef, issue: KnownIssue): Promise<KnownIssue> {
    const safeIssue = {
        state: issue.state,
        body: issue.body,
    };
    const token = (credentials as TokenCredentials).token;
    const grr = rr as GitHubRepoRef;
    const url = encodeURI(`${grr.scheme}${grr.apiBase}/repos/${rr.owner}/${rr.repo}/issues/${issue.number}`);
    logger.info(`Request to '${url}' to update issue`);
    try {
        const resp = await axios.patch(url, safeIssue, github.authHeaders(token) as unknown as AxiosRequestConfig);
        logger.warn("WTF is here")
        return resp.data;
    } catch (e) {
        e.message = `Failed to update issue ${issue.number}: ${e.message}`;
        logger.error(e.message);
        throw e;
    }
}

export const TodoIssueListenerRegistration: ReviewListenerRegistration = {
    name: "CreateIssueForTodos",
    listener: todoIssueCreationInspectionListener,
};

export function bodyFormatter(reviewComments: ReviewComment[], grr: GitHubRepoRef): string {
    const header = `Automatically created by atomist/docs-sdm, based on ${grr.owner}/${grr.repo}@${grr.sha}\n`
    return header + reviewComments.map(rc => reviewCommentToMarkdown(rc, grr)).join("");
}

function reviewCommentToMarkdown(c: ReviewComment, grr: GitHubRepoRef): string {
    const loc = deepLinkToComment(c, grr);
    return `- [ ] ${loc} \`${c.detail}\`\n`;
}

function deepLinkToComment(c: ReviewComment, grr: GitHubRepoRef): string {
    let loc: string = "";
    if (c.sourceLocation && c.sourceLocation.path) {
        const line = (c.sourceLocation.lineFrom1) ? `:${c.sourceLocation.lineFrom1}` : "";
        loc = "`" + c.sourceLocation.path + line + "`";
        const url = deepLink(grr, c.sourceLocation);
        loc = `[${loc}](${url})`;
        loc += ": ";
    }
    return loc;
}

export function reviewCommentInMarkdown(body: string, rc: ReviewComment): boolean {
    const reString = `\\b${rc.sourceLocation.lineFrom1}\\b.*${rc.detail}$`;
    // console.log("reString = " + reString);
    const r = new RegExp(reString, "m");
    // console.log("r = " + r);
    return r.test(body);
}