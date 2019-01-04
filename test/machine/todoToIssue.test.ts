import * as assert from "assert";
import { ReviewComment, GitHubRepoRef } from "@atomist/automation-client";
import { bodyFormatter, reviewCommentInMarkdown } from "../../lib/machine/todoToIssue";

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
});