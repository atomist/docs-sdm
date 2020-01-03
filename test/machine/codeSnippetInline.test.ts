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
    HttpClient,
    HttpClientFactory,
    HttpResponse,
    InMemoryProject,
    NoParameters,
    Project,
} from "@atomist/automation-client";
import { toValueStructure } from "@atomist/microgrammar/lib/MatchReport";
import {
    ProgressLog,
    PushAwareParametersInvocation,
    TransformResult,
    WriteToAllProgressLog,
} from "@atomist/sdm";
import * as assert from "assert";
import {
    CodeSnippetInlineTransform,
    RefMicrogrammar,
    SnippetMicrogrammar,
    SnippetReference,
} from "../../lib/machine/codeSnippetInline";

class FakeProgressLog implements ProgressLog {
    public name: string; public url?: string;
    public flush(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    public close(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    public isAvailable(): Promise<boolean> {
        throw new Error("Method not implemented.");
    }
    public write = (log: string): void => {
        this.log = this.log + log;
    }
    public log?: string = "";
    public stripAnsi?: boolean;
}

type FakeInternet = Array<{ url: string, response: string }>;

function fakeFactory(www: FakeInternet): HttpClientFactory {
    return {
        create(): HttpClient {
            // tslint:disable-next-line:no-object-literal-type-assertion
            return {
                www,
                async exchange(url: string): Promise<HttpResponse<any>> {
                    const whatIsOutThere = www.find(w => w.url === url);
                    if (!whatIsOutThere) {
                        return {
                            status: 404,
                        };
                    }
                    return {
                        status: 200,
                        body: whatIsOutThere.response,
                    };
                },
            } as HttpClient;
        },
    };
}

function sampleRepoFileUrl(filepath: string, params: { repo?: string, owner?: string } = {}): string {
    const { owner, repo } = { repo: "samples", owner: "atomist", ...params };
    return `https://raw.githubusercontent.com/${owner}/${repo}/master/${filepath}`;
}

function fakeInvocation(www: FakeInternet = [{
    url: sampleRepoFileUrl("lib/sdm/dotnetCore.ts"),
    response: realSnippetFile("dotnetGenerator"),
}]): PushAwareParametersInvocation<NoParameters> {
    return {
        progressLog: new WriteToAllProgressLog("test", new FakeProgressLog(), new FakeProgressLog()),
        configuration: { http: { client: { factory: fakeFactory(www) } } },
    } as any;
}

describe("CodeSnippetInlineTransform", () => {

    // before I implement this, I really need to fake the HTTP call
    // because otherwise the tests are super fragile depending on the contents
    // of the sample repo... or I could run the transform twice
    it.skip("should not be edited if the snippet was already correct");

    it("Can replace two snippet references in different files", async () => {
        const sampleFile1 = "lib/whatever/hi.ts";
        const mdFile1 = "docs/aboutHi.md";
        const snippet1 = "barney";
        const sampleFile2 = "lib/moreStuff/yes.ts";
        const mdFile2 = "docs/aboutYes.md";
        const snippet2 = "scarlet";
        const fakeInv = fakeInvocation([{
            url: sampleRepoFileUrl(sampleFile1),
            response: realSnippetFile(snippet1),
        }, {
            url: sampleRepoFileUrl(sampleFile2),
            response: realSnippetFile(snippet2),
        },
        ]);
        const projectWithMarkdownFile = InMemoryProject.of({
            path: mdFile1,
            content: generatorMarkdown(snippet1, sampleFile1),
        },
            {
                path: mdFile2,
                content: generatorMarkdown(snippet2, sampleFile2),
            });
        const result = (await CodeSnippetInlineTransform(
            projectWithMarkdownFile, fakeInv,
        )) as TransformResult;
        assert(result.success);

        const snippet1AfterEdit = parseSnippetReferences(projectWithMarkdownFile, mdFile1)[0];
        assert(snippet1AfterEdit.middle.includes("DotnetCoreGenerator"), fakeInv.progressLog.log);
        assert.strictEqual(snippet1AfterEdit.snippetComment.snippetCommentContent.trim(),
            `Snippet '${snippet1}' found in ${sampleRepoFileUrl(sampleFile1)}`);

        const snippet2AfterEdit = parseSnippetReferences(projectWithMarkdownFile, mdFile2)[0];
        assert(snippet2AfterEdit.middle.includes("DotnetCoreGenerator"), snippet1AfterEdit.middle);
        assert.strictEqual(snippet2AfterEdit.snippetComment.snippetCommentContent.trim(),
            `Snippet '${snippet2}' found in ${sampleRepoFileUrl(sampleFile2)}`);

        assert(result.edited, "should be edited");
    });

    it.skip("Inserts a warning when a sample file was not found");

    it("Inserts a link to the code sample in the file", async () => {
        const fakeInv = fakeInvocation();
        const projectWithMarkdownFile = InMemoryProject.of({
            path: "docs/Generator.md",
            content: generatorMarkdown(),
        });
        const result = (await CodeSnippetInlineTransform(
            projectWithMarkdownFile, fakeInv,
        )) as TransformResult;
        assert(result.success);
        assert(result.edited, "should be edited");
        const updatedSnippet = parseSnippetReferences(projectWithMarkdownFile, "docs/Generator.md")[0];
        assert(!!updatedSnippet.snippetLink, "Oh no, no link");
        const expectedLink = "https://github.com/atomist/samples/tree/master/lib/sdm/dotnetCore.ts#L8-L23";
        assert.strictEqual(updatedSnippet.snippetLink.href, expectedLink);
    });

    it("should inline all referenced code snippets", async () => {
        const fakeInv = fakeInvocation();
        const projectWithMarkdownFile = InMemoryProject.of({ path: "docs/Generator.md", content: generatorMarkdown() });
        const result = (await CodeSnippetInlineTransform(
            projectWithMarkdownFile, fakeInv,
        )) as TransformResult;
        assert(result.success);
        assert(result.edited, "should be edited");
        const mdFile = await projectWithMarkdownFile.getFile("docs/Generator.md");
        const mdContent = await mdFile.getContent();
        assert(mdContent.includes(correctSnippetContent), mdContent);
        assert(fakeInv.progressLog.log.includes("Snippets replaced:\nname: dotnetGenerator"), fakeInv.progressLog.log);
    });

    it("should inline a referenced code snippets in a repository other than samples", async () => {
        const fakeInv = fakeInvocation([{
            url: sampleRepoFileUrl("test/machine/codeSnippetInline.test.ts", { repo: "docs-sdm" }),
            response: testySnippetBit(),
        }]);
        const projectWithMarkdownFile = InMemoryProject.of({
            path: "docs/Generator.md",
            content: generatorMarkdown("testysnippet",
                "test/machine/codeSnippetInline.test.ts", // this file
                "atomist/docs-sdm"), // this repo :-)
        });
        const result = (await CodeSnippetInlineTransform(
            projectWithMarkdownFile, fakeInv,
        )) as TransformResult;
        assert(result.success);
        assert(result.edited, "should be edited");
        const mdFile = await projectWithMarkdownFile.getFile("docs/Generator.md");
        const mdContent = await mdFile.getContent();
        assert(mdContent.includes(`const TestySnippet = "hooray, you found me";`), mdContent);
        assert(fakeInv.progressLog.log.includes("Snippets replaced:\nname: testysnippet"), fakeInv.progressLog.log);
    });

    it("should add a comment about notFound if a snippet is inserted, but only once", async () => {
        const fakeInv = fakeInvocation();
        const projectWithMarkdownFile = InMemoryProject.of({
            path: "docs/Generator.md",
            content: generatorMarkdown("poo"),
        });
        const snippetBeforeEdit = parseSnippetReferences(projectWithMarkdownFile, "docs/Generator.md")[0];
        const result = await CodeSnippetInlineTransform(
            projectWithMarkdownFile, fakeInv,
        ) as TransformResult;
        assert(result.success, "should be successful");
        assert(result.edited, "should be edited");
        assert(fakeInv.progressLog.log.includes("Snippets not found:\nname: poo in file: "), fakeInv.progressLog.log);

        const snippetAfterEdit = parseSnippetReferences(projectWithMarkdownFile, "docs/Generator.md")[0];
        assert.strictEqual(snippetAfterEdit.middle.trim(), snippetBeforeEdit.middle.trim());
        assert.strictEqual(snippetAfterEdit.snippetComment.snippetCommentContent.trim(),
            `Warning: snippet 'poo' not found in ${sampleRepoFileUrl("lib/sdm/dotnetCore.ts")}`);

        // run again on same project. Should not change it
        const secondResult = await CodeSnippetInlineTransform(
            projectWithMarkdownFile, fakeInv,
        ) as TransformResult;
        assert(secondResult.success, "should be successful");
        assert(fakeInv.progressLog.log.includes("Snippets not found:\nname: poo in file: lib/sdm/dotnetCore.ts"));

        const snippetAfterSecondEdit = parseSnippetReferences(projectWithMarkdownFile, "docs/Generator.md")[0];
        assert.deepStrictEqual(snippetAfterSecondEdit, snippetAfterEdit);
        assert(!secondResult.edited, "should not be edited");

    });

});

function parseSnippetReferences(p: Project, filename: string): SnippetReference[] {
    const mdContent = p.findFileSync(filename).getContentSync();
    const results = Array.from(RefMicrogrammar.matchReportIterator(mdContent));
    // tslint:disable-next-line:no-unnecessary-callback-wrapper
    return results.map(match => toValueStructure<SnippetReference>(match));
}

function testySnippetBit() {
    return `
    blah blah blah

// atomist:code-snippet:start=testysnippet
const TestySnippet = "hooray, you found me";
// atomist:code-snippet:end
blah blah`;
}

function generatorMarkdown(snippetName: string = "dotnetGenerator",
                           sampleFilepath: string = "lib/sdm/dotnetCore.ts",
                           sampleRepo: string = "atomist/samples"): string {
    const repoSpec = sampleRepo === "atomist/samples" ? "" : `@${sampleRepo}`;
    return `

# This is a sample docs page referencing a code snippet

Some more text to make it more interesting

<!-- atomist:code-snippet:start=${sampleFilepath}#${snippetName}${repoSpec} -->
\`\`\`typescript
Just some other text
\`\`\`
<!-- atomist:code-snippet:end-->

And even more text
`;
}

describe("microgrammar for parsing snippet reference", () => {
    it("can parse it", async () => {
        const results = Array.from(RefMicrogrammar.matchReportIterator(generatorMarkdown("snippetypoo")));
        assert.strictEqual(results.length, 1);
        const match = results[0];
        const valueStructure = toValueStructure(match);

        assert.deepStrictEqual(valueStructure, {
            href: {
                filepath: "lib/sdm/dotnetCore.ts",
                repoRef: undefined,
                snippetName: "snippetypoo",
            },
            middle: `\`\`\`typescript
Just some other text
\`\`\`
`,
            snippetComment: undefined,
            snippetLink: undefined,
        });
    });

    it("finds a good snippet after a bad snippet reference", () => {
        const results = Array.from(RefMicrogrammar.matchReportIterator(`
\`\`\`html
            <!-- atomist:code-snippet:start=SNIPPET_NAME -->
            <!-- atomist:code-snippet:end -->
\`\`\`

<!-- atomist:code-snippet:start=lib/command/helloWorld.ts#helloWorldCommandAdd -->
new stuff should go here
<!-- atomist:docs-sdm:codeSnippetInline: Warning: looking for 'helloWorldCommandAdd' but could not retrieve file https://github.com/atomist/samples/tree/master/SNIPPET_NAME -->
<!-- atomist:code-snippet:end -->

        `));
        const match = results[results.length - 1]; // the last one should be the good one
        const valueStructure = toValueStructure(match);

        assert.deepStrictEqual(valueStructure.href, {
            filepath: "lib/command/helloWorld.ts",
            repoRef: undefined,
            snippetName: "helloWorldCommandAdd",
        });
    });

    it("can parse one that has been successfully replaced", async () => {
        const fakeInv = fakeInvocation();
        const projectWithMarkdownFile = InMemoryProject.of({
            path: "docs/Generator.md",
            content: generatorMarkdown(),
        });
        // tslint:disable-next-line:no-unused-expression
        await CodeSnippetInlineTransform(
            projectWithMarkdownFile, fakeInv,
        ) as TransformResult;

        const postTransformMarkdown = projectWithMarkdownFile.findFileSync("docs/Generator.md").getContentSync();
        const results = Array.from(RefMicrogrammar.matchReportIterator(postTransformMarkdown));

        assert.strictEqual(results.length, 1, postTransformMarkdown);
    });
});

const correctSnippetContent = `/**
 * .NET Core generator registration
 */
const DotnetCoreGenerator: GeneratorRegistration = {
    name: "DotnetCoreGenerator",
    intent: "create dotnet-core project",
    description: "Creates a new .NET Core project",
    tags: ["dotnet"],
    autoSubmit: true,
    startingPoint: GitHubRepoRef.from({ owner: "atomist-seeds", repo: "dotnet-core-service", branch: "master" }),
    transform: [
        UpdateReadmeTitle,
        replaceSeedSlug("atomist-seeds", "dotnet-core-service"),
        DotnetCoreProjectFileCodeTransform,
    ],
};`;

function realSnippetFile(snippetName: string): string {
    return `
/* Let's just pull out this little chunk
 *               docker daemon. Please make sure to configure your terminal for
 *               docker access.</p>
 */

// atomist:code-snippet:start=${snippetName}
${correctSnippetContent}
// atomist:code-snippet:end

export const configuration = configure(async sdm => {

    // Register the generator with the SDM
`;
}

describe("microgrammar for parsing snippet content", () => {
    it("can parse a real snippet", async () => {
        const snippetName = "dotnetGenerator";
        const results = Array.from(SnippetMicrogrammar(snippetName).matchReportIterator(realSnippetFile(snippetName)));
        assert.strictEqual(results.length, 1);
        const match = results[0];
        const valueStructure = toValueStructure(match);

        assert.deepStrictEqual(valueStructure, {
            snippetName,
            snippetContent: `/**
 * .NET Core generator registration
 */
const DotnetCoreGenerator: GeneratorRegistration = {
    name: "DotnetCoreGenerator",
    intent: "create dotnet-core project",
    description: "Creates a new .NET Core project",
    tags: ["dotnet"],
    autoSubmit: true,
    startingPoint: GitHubRepoRef.from({ owner: "atomist-seeds", repo: "dotnet-core-service", branch: "master" }),
    transform: [
        UpdateReadmeTitle,
        replaceSeedSlug("atomist-seeds", "dotnet-core-service"),
        DotnetCoreProjectFileCodeTransform,
    ],
};`,
        });
    });
});
