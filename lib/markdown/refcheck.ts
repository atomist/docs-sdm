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

import { ProjectReview, projectUtils, ReviewComment } from "@atomist/automation-client";
import { microgrammar } from "@atomist/microgrammar";
import { CodeInspectionRegistration } from "@atomist/sdm";

export const linkReferenceMg = microgrammar({
    phrase: "[...][${refname}]",
    terms: { refname: /[\w-_]+/ },
});

export const linkDefinitionMg = microgrammar({
    phrase: "[${refname}]: ${location}",
    terms: {
        refname: /[\w-_]+/,
        location: /\S+/,
    },
});

export const inspectReferences: CodeInspectionRegistration<ProjectReview> = {
    name: "Markdown reference inspection",
    inspection: async p => {
        const comments: ReviewComment[] = [];
        await projectUtils.doWithFiles(p, "**/*.md", async f => {
            const content = await f.getContent();

            const linkDefinitions = linkDefinitionMg.findMatches(content);
            const definedNames = linkDefinitions.map(m => m.refname);

            const linkReferences = linkReferenceMg.findMatches(content);
            linkReferences.forEach(refmatch => {
                if (definedNames.includes(refmatch.refname)) {
                    return;
                }
                comments.push({
                    severity: "error",
                    category: "unresolved-link-reference",
                    detail: `${f.path} references ${refmatch.refname} which is not defined`,
                    sourceLocation: {
                        path: f.path,
                        offset: refmatch.$offset,
                    },
                });
            });

        });
        return { repoId: p.id, comments };
    },
};
