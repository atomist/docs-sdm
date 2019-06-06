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
    DefaultHttpClientFactory,
    InMemoryProject,
    NoParameters,
    Project,
} from "@atomist/automation-client";
import { toValueStructure } from "@atomist/microgrammar/lib/MatchReport";
import { ProgressLog, PushAwareParametersInvocation, TransformResult } from "@atomist/sdm";
import * as assert from "assert";
import { CodeSnippetInlineTransform, RefMicrogrammar, SnippetMicrogrammar, SnippetReference } from "../../lib/machine/codeSnippetInline";

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

function fakeInvocation(): PushAwareParametersInvocation<NoParameters> {
    return {
        progressLog: new FakeProgressLog(),
        configuration: { http: { client: { factory: DefaultHttpClientFactory } } },
    } as any;
}

describe("CodeSnippetInlineTransform", () => {

    // before I implement this, I really need to fake the HTTP call
    // because otherwise the tests are super fragile depending on the contents
    // of the sample repo... or I could run the transform twice
    it.skip("should not be edited if the snippet was already correct");

    it.skip("Can replace two snippet references");

    it.skip("Inserts a warning when a sample file was not found");

    it.skip("Inserts a link to the code sample in the file");

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
        assert(mdContent.includes("DotnetCoreGenerator"));
        assert(fakeInv.progressLog.log.includes("Snippets replaced:\nname: dotnetGenerator"), fakeInv.progressLog.log);
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
        assert(fakeInv.progressLog.log.includes("Snippets not found:\nname: poo in file: lib/sdm/dotnetCore.ts"));

        const snippetAfterEdit = parseSnippetReferences(projectWithMarkdownFile, "docs/Generator.md")[0];
        assert.strictEqual(snippetAfterEdit.middle.trim(), snippetBeforeEdit.middle.trim());
        assert.strictEqual(snippetAfterEdit.snippetComment.snippetCommentContent.trim(),
            "Warning: snippet 'poo' not found in lib/sdm/dotnetCore.ts");

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

function generatorMarkdown(snippetName: string = "dotnetGenerator"): string {
    return `

# This is a sample docs page referencing a code snippet

Some more text to make it more interesting

<!-- atomist:code-snippet:start=lib/sdm/dotnetCore.ts#${snippetName} -->
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
                snippetName: "snippetypoo",
            },
            middle: `\`\`\`typescript
Just some other text
\`\`\`
`,
            snippetComment: undefined,
        });
    });
});

function realSnippetFile(snippetName: string) {
    return `
/* Let's just pull out this little chunk
 *               docker daemon. Please make sure to configure your terminal for
 *               docker access.</p>
 */

// atomist:code-snippet:start=${snippetName}
/**
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
};
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
