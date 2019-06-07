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
import {
    microgrammar,
    Microgrammar,
    optional,
    takeUntil,
} from "@atomist/microgrammar";
import {
    SuccessfulMatchReport,
    toValueStructure,
} from "@atomist/microgrammar/lib/MatchReport";
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
    did: "replace" | "snippetNotFound" | "sampleFileNotFound";
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

            // const whatToDo: {
            //     do: "replace" | "sampleFileNotFound" | "snippetNotFound",
            //     commentContent: string,
            //     snippetContent?: string,
            // } = Either.of(`${url}/${file}`).map(fetchFile).leftMap(httpError => ({
            //     do: "sampleFileNotFound",
            //     commentContent: `Failed to retrieve ${url}/${file}, status ${httpError.status}`,
            // })).map(findSnippet(name)).leftMap(() => ({
            //     do: "snippetNotFound",
            //     commentContent: `Warning: snippet '${name}' not found in ${file}`,
            // }
            // )).map(snippet => ({
            //     do: "replace",
            //     commentContent: `Snippet ${name} found in ${file}`,
            //     snippetContent: contentOfSnippet(snippet),
            // })).cata(identity, identity);


            // const whatToDo: {
            //     do: "replace" | "sampleFileNotFound" | "snippetNotFound",
            //     commentContent: string,
            //     snippetContent?: string,
            // } = startWith(fetchFile(`${url}/${file}`).orElse({
            //     do: "sampleFileNotFound",
            //     commentContent: `Failed to retrieve ${url}/${file}`,
            // })).andWhenThatWorks(findSnippet(name).orElse(
            //     {
            //         do: "snippetNotFound",
            //         commentContent: `Warning: snippet '${name}' not found in ${file}`,
            //     },
            // )).andWhenThatWorks(snippet => ({
            //     do: "replace",
            //     commentContent: `Snippet ${name} found in ${file}`,
            //     snippetContent: contentOfSnippet(snippet),
            // }));

            async function whatToSubstitute(sampleFileUrl: string, snippetName: string): Promise<{
                do: "replace" | "sampleFileNotFound" | "snippetNotFound",
                commentContent: string,
                snippetContent?: string,
            }> {
                const sampleResponse = (await httpClient.exchange<string>(
                    sampleFileUrl,
                    { method: HttpMethod.Get }));
                if (!sampleResponse.body) {
                    logger.error(`Failed to retrieve ${sampleFileUrl}: status ${sampleResponse.status}`);
                    return {
                        do: "sampleFileNotFound",
                        commentContent: `Warning: looking for '${snippetName}' but could not retrieve file ${file}`,
                    };
                }

                const sampleMatchReports = Array.from(SnippetMicrogrammar(snippetName).matchReportIterator(sampleResponse.body));
                if (sampleMatchReports.length === 0) {
                    return {
                        do: "snippetNotFound",
                        commentContent: `Warning: snippet '${snippetName}' not found in ${sampleFileUrl}`,
                    };
                }

                return {
                    do: "replace",
                    commentContent: `Snippet '${snippetName}' found in ${sampleFileUrl}`,
                    snippetContent: contentOfSnippet(sampleMatchReports[0]),
                };
            }

            const whatToDo = await whatToSubstitute(`${url}/${file}`, name);

            const currentCommentContent = snippetReference.snippetComment ? snippetReference.snippetComment.snippetCommentContent.trim() : "";
            const currentSnippetContent = snippetReference.middle.trim();

            const needsUpdate = (whatToDo.snippetContent && whatToDo.snippetContent !== currentSnippetContent.trim()) ||
                currentCommentContent !== whatToDo.commentContent;

            if (needsUpdate) {
                const newSnippetReference = `<!-- atomist:code-snippet:start=${file}#${name} -->
${whatToDo.snippetContent || snippetReference.middle.trim()}
<!-- atomist:docs-sdm:codeSnippetInline: ${whatToDo.commentContent} -->
<!-- atomist:code-snippet:end -->`;
                content = content.replace(referenceMatch.matched, newSnippetReference);
            }

            outcomes.push({
                did: whatToDo.do,
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
        outcomes.filter(o => o.did === "replace")
            .map(o => `name: ${o.where.snippetName} from file: ${o.where.sampleFilepath} in markdown: ${o.where.markdownFilepath}`).join("\n");
    writeToLog(printReplacedSnippets);
    const unfoundFiles = outcomes.filter(o => o.did === "sampleFileNotFound");
    if (unfoundFiles.length > 0) {
        const printUnfoundSnippets = `Files not found:\n` +
            unfoundFiles.map(o => `name: ${o.where.snippetName} in nonexistent file: ${o.where.sampleFilepath}`).join("\n");
        writeToLog(printUnfoundSnippets);
    }
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
${snippetFound.snippetContent.trim()}
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
