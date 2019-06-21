import {
    GraphQL,
    Success,
} from "@atomist/automation-client";
import { EventHandlerRegistration } from "@atomist/sdm";
import { createJob } from "@atomist/sdm-core";
import { OnPushToSamples } from "../typings/types";
import { CodeSnippetInlineCommand } from "./codeSnippetInline";

export const CreateCodeSnippetInlineJobOnPushToSamples: EventHandlerRegistration<OnPushToSamples.Subscription> = {
    name: "CreateCodeSnippetInlineJobOnPushToSamples",
    description: "Create a job to run the CodeSnippetInlineCommand",
    subscription: GraphQL.subscription("OnPushToSamples"),
    listener: async (e, ctx) => {
        await createJob({
                command: CodeSnippetInlineCommand,
                description: "Run 'CodeSnippetInlineCommand' on push to samples repository",
                parameters: {
                    "targets.repo": "docs",
                    "targets.owner": "atomist",
                },
            },
            ctx);
        return Success;
    },
};
