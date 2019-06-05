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
} from "@atomist/automation-client";
import { ProgressLog, PushAwareParametersInvocation, TransformResult } from "@atomist/sdm";
import * as assert from "assert";
import { CodeSnippetInlineTransform } from "../../lib/machine/codeSnippetInline";

class FakeProgressLog implements ProgressLog {
    constructor() {
    }
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

    it("should inline all referenced code snippets", async () => {
        const fakeInv = fakeInvocation();
        const projectWithMarkdownFile = InMemoryProject.of({ path: "docs/Generator.md", content: generatorMarkdown() });
        const result = (await CodeSnippetInlineTransform(
            projectWithMarkdownFile, fakeInv,
        )) as TransformResult;
        assert(result.success);
        const mdFile = await projectWithMarkdownFile.getFile("docs/Generator.md");
        const mdContent = await mdFile.getContent();
        assert(mdContent.includes("DotnetCoreGenerator"));
        assert(fakeInv.progressLog.log.includes("Snippets replaced:\nname: dotnetGenerator"), fakeInv.progressLog.log);
    });

    it("should fail if a snippet is not found in the file", async () => {
        const projectWithMarkdownFile = InMemoryProject.of({
            path: "docs/Generator.md",
            content: generatorMarkdown("poo"),
        });
        const result = await CodeSnippetInlineTransform(
            projectWithMarkdownFile, fakeInvocation(),
        ) as TransformResult;
        assert(!result.success);
        assert.strictEqual(result.error.message, "Snippets not found:\nname: poo in file: lib/sdm/dotnetCore.ts");
    });

});

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
