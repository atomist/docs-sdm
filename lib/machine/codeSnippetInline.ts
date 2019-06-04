import {
    HttpMethod,
    projectUtils,
} from "@atomist/automation-client";
import {
    AutofixRegistration,
    CodeTransform,
    hasFileWithExtension,
} from "@atomist/sdm";

const RefRegexp: RegExp =
    /<!--[\s]*atomist:code-snippet:start=(\S*)[\s]*-->[\s\S]*?<!--[\s]*atomist:code-snippet:end[\s]*-->/gm;

const SnippetRegexp = /\/\/[\s]*atomist:code-snippet:start=([\S]*)([\s\S]*)\/\/[\s]*atomist:code-snippet:end[\s]*/gm;

/**
 * CodeTransform to inline referenced code snippets
 */
export const CodeSnippetInlineTransform: CodeTransform = async (p, papi) => {
    const url = "https://raw.githubusercontent.com/atomist/samples/master";
    const httpClient = papi.configuration.http.client.factory.create(url);

    await projectUtils.doWithFiles(p, "**/*.md", async f => {
        let content = await f.getContent();
        RefRegexp.lastIndex = 0;
        let match = RefRegexp.exec(content);
        while (!!match) {
            const href = match[1] as string;
            const file = href.split("#")[0];
            const name = href.split("#")[1];

            const sample = (await httpClient.exchange<string>(
                `${url}/${file}`,
                { method: HttpMethod.Get })).body;

            SnippetRegexp.lastIndex = 0;
            let sampleMatch = SnippetRegexp.exec(sample);
            while (!!sampleMatch) {
                if (sampleMatch[1] === name) {
                    content = content.replace(
                        match[0],
                        `<!-- atomist:code-snippet:start=${href} -->
\`\`\`typescript
${sampleMatch[2].trim()}
\`\`\`
<!-- atomist:code-snippet:end -->`);
                }
                sampleMatch = SnippetRegexp.exec(sample);
            }
            match = RefRegexp.exec(content);
        }
        await f.setContent(content);
    });

    return p;
};

export const CodeSnippetInlineAutofix: AutofixRegistration = {
    name: "code inline",
    pushTest: hasFileWithExtension("md"),
    transform: CodeSnippetInlineTransform,
};
