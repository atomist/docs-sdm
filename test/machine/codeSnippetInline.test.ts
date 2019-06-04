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
    GitProject,
    InMemoryProject,
} from "@atomist/automation-client";
import { CodeSnippetInlineTransform } from "../../lib/machine/codeSnippetInline";
import * as assert from "assert";

describe("CodeSnippetInlineTransform", () => {

    it("should inline all referenced code snippets", async () => {
        const projectWithMarkdownFile = InMemoryProject.of({ path: "docs/Generator.md", content: GeneratorMarkdown });
        const result = (await CodeSnippetInlineTransform(
            projectWithMarkdownFile,
            { configuration: { http: { client: { factory: DefaultHttpClientFactory } } } } as any)) as GitProject;
        const mdFile = await result.getFile("docs/Generator.md");
        const mdContent = await mdFile.getContent();
        assert(mdContent.includes("DotnetCoreGenerator"));
    });

});

const GeneratorMarkdown = `

# This is a sample docs page referencing a code snippet


<!-- atomist:code-snippet:start=lib/sdm/dotnetCore.ts#dotnetGenerator -->
\`\`\`typescript
import { HandlerResult, NoParameters } from "@atomist/automation-client";
import { CommandListenerInvocation } from "@atomist/sdm";
export async function helloWorldListener(ci: CommandListenerInvocation<NoParameters>): Promise<void> {
    return ci.addressChannels("Hello, world");
}
\`\`\`
<!-- atomist:code-snippet:end-->

Some more text to make it more interesting

<!-- atomist:code-snippet:start=lib/sdm/dotnetCore.ts#dotnetGenerator -->
\`\`\`typescript
Just some other text
\`\`\`
<!-- atomist:code-snippet:end-->

And even more text
`;
