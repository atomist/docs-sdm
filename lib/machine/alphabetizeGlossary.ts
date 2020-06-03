/*
 * Copyright © 2020 Atomist, Inc.
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
    astUtils,
    Project,
} from "@atomist/automation-client";
import {
    AutofixRegistration,
    CodeTransformRegistration,
    TransformResult,
} from "@atomist/sdm";
import { RemarkFileParser } from "@atomist/sdm-pack-markdown";
import * as _ from "lodash";

/**
 * glossary.md contains a list of words, each one the text of a heading.
 *
 * We assume there is nothing else in this file. We're gonna grab each top-level heading along with its contents,
 * alphabetize by the heading text, and overwrite the file with that.
 */
export async function alphabetizeGlossary(project: Project): Promise<TransformResult> {
    let edited = false;
    const file = await project.getFile("docs/glossary.md");
    if (file) {
        const definitions = await astUtils.gather(project, {
            parseWith: RemarkFileParser,
            globPatterns: ["docs/glossary.md"],
            pathExpression: "//heading",
            mapper: m => {
                const headingText = (m as any).text as string;
                return {
                    word: headingText,
                    wordAndDefinition: m.$value,
                };
            },
        });

        const alphabetized = _.sortBy(definitions, d => d.word.toLowerCase());
        const newContent = alphabetized.map(d => d.wordAndDefinition).join("\n\n") + "\n";

        const oldContent = await file.getContent();
        if (oldContent !== newContent) {
            await file.setContent(newContent);
            edited = true;
        }
    }
    return {
        edited,
        target: project,
        success: true,
    };
}

export const AlphabetizeGlossaryCommand: CodeTransformRegistration = {
    name: "AlphabetizeGlossaryCommand",
    intent: "alphabetize glossary",
    transform: alphabetizeGlossary,

};

export const AlphabetizeGlossaryAutofix: AutofixRegistration = {
    name: "AlphabetizeGlossaryAutofix",
    transform: alphabetizeGlossary,
};
