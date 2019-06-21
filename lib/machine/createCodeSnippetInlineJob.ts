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
