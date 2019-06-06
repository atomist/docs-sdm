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
    HttpMethod,
    logger,
    projectUtils,
} from "@atomist/automation-client";
import { microgrammar, Microgrammar, optional, takeUntil } from "@atomist/microgrammar";
import { SuccessfulMatchReport, toValueStructure } from "@atomist/microgrammar/lib/MatchReport";
import {
    AutofixRegistration,
    CodeTransform,
    hasFileWithExtension,
} from "@atomist/sdm";

export interface SnippetReference {
    href: {
        filepath: string,
        snippetName: string,
    };
    middle: string;
    snippetComment: {
        snippetCommentContent: string,
    };
}
export const RefMicrogrammar: Microgrammar<SnippetReference> = microgrammar({
    // tslint:disable-next-line:no-invalid-template-strings
    phrase: `<!-- atomist:code-snippet:start=\${href} -->
    \${middle}
    \${snippetComment}
    <!-- atomist:code-snippet:end -->`
    , terms: {
        href: {
            filepath: /[^#]*/,
            _hash: "#",
            snippetName: /\S*/,
        },
        middle: takeUntil("<!-- atomist:"),
        snippetComment: optional(microgrammar({
            // tslint:disable-next-line:no-invalid-template-strings
            phrase: "<!-- atomist:docs-sdm:codeSnippetInline:${snippetCommentContent} -->",
        })),
    },
}) as Microgrammar<SnippetReference>;

export interface SnippetFound {
    snippetName: string;
    snippetContent: string;
}
export function SnippetMicrogrammar(snippetName: string): Microgrammar<SnippetFound> {
    return microgrammar({
        // tslint:disable-next-line:no-invalid-template-strings
        phrase: `// atomist:code-snippet:start=\${snippetName}
\${snippetContent}
// atomist:code-snippet:end`,
        terms: {
            snippetName,
        },
    }) as Microgrammar<SnippetFound>;
}

interface CodeSnippetInlineOutcome {
    did: "replaced" | "snippetNotFound";
    where: {
        markdownFilepath: string,
        sampleFilepath: string,
        snippetName: string,
    };
    edited: boolean;
}

/**
 * CodeTransform to inline referenced code snippets
 */
export const CodeSnippetInlineTransform: CodeTransform = async (p, papi) => {
    const url = "https://raw.githubusercontent.com/atomist/samples/master";
    const httpClient = papi.configuration.http.client.factory.create(url);
    const writeToLog = papi.progressLog ? papi.progressLog.write : logger.info;
    const outcomes: CodeSnippetInlineOutcome[] = [];

    await projectUtils.doWithFiles(p, "**/*.md", async f => {
        let content = await f.getContent();
        const referenceMatchReports = RefMicrogrammar.matchReportIterator(content);
        for await (const referenceMatch of referenceMatchReports) {
            const snippetReference = toValueStructure<SnippetReference>(referenceMatch);
            const file = snippetReference.href.filepath;
            const name = snippetReference.href.snippetName;

            const sample = (await httpClient.exchange<string>(
                `${url}/${file}`,
                { method: HttpMethod.Get })).body;

            const sampleMatchReports = Array.from(SnippetMicrogrammar(name).matchReportIterator(sample));
            const found = sampleMatchReports.length > 0;

            const replacementMiddle = found ? contentOfSnippet(sampleMatchReports[0]) : snippetReference.middle;
            const commentContent = found ? `Snippet ${name} found in ${file}` : `Warning: snippet '${name}' not found in ${file}`;

            const currentCommentContent = snippetReference.snippetComment ? snippetReference.snippetComment.snippetCommentContent : "";

            const needsUpdate = snippetReference.middle.trim() !== replacementMiddle.trim() ||
                currentCommentContent.trim() !== commentContent.trim();

            if (needsUpdate) {
                const newSnippetReference = `<!-- atomist:code-snippet:start=${file}#${name} -->
${replacementMiddle.trim()}
<!-- atomist:docs-sdm:codeSnippetInline: ${commentContent} -->
<!-- atomist:code-snippet:end -->`;
                content = content.replace(referenceMatch.matched, newSnippetReference);
            }

            outcomes.push({
                did: found ? "replaced" : "snippetNotFound",
                where: {
                    markdownFilepath: f.path,
                    sampleFilepath: file,
                    snippetName: name,
                },
                edited: needsUpdate,
            });
        }
        await f.setContent(content);
    });

    reportOutcomes(outcomes, writeToLog);

    const edited = !!outcomes.find(o => o.edited);

    return { target: p, success: true, edited };
};

function reportOutcomes(outcomes: CodeSnippetInlineOutcome[], writeToLog: (log: string, ...args: any[]) => void): void {
    const printReplacedSnippets = `Snippets replaced:\n` +
        outcomes.filter(o => o.did === "replaced")
            .map(o => `name: ${o.where.snippetName} from file: ${o.where.sampleFilepath} in markdown: ${o.where.markdownFilepath}`).join("\n");
    writeToLog(printReplacedSnippets);
    const unfoundSnippets = outcomes.filter(o => o.did === "snippetNotFound");
    if (unfoundSnippets.length > 0) {
        const printUnfoundSnippets = `Snippets not found:\n` +
            unfoundSnippets.map(o => `name: ${o.where.snippetName} in file: ${o.where.sampleFilepath}`).join("\n");
        writeToLog(printUnfoundSnippets);
    }
}

function contentOfSnippet(mr: SuccessfulMatchReport): string {
    const snippetFound = toValueStructure<SnippetFound>(mr);
    return `\`\`\`typescript
${snippetFound.snippetContent}
\`\`\``;
}

export const CodeSnippetInlineAutofix: AutofixRegistration = {
    name: "code inline",
    pushTest: hasFileWithExtension("md"),
    transform: CodeSnippetInlineTransform,
    options: {
        ignoreFailure: false,
    },
};
