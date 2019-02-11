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
    configurationValue,
    Project,
} from "@atomist/automation-client";
import { doWithFiles } from "@atomist/automation-client/lib/project/util/projectUtils";
import {
    doWithProject,
    ExecuteGoal,
    ExecuteGoalResult,
    ProgressLog,
    ProjectAwareGoalInvocation,
    slackErrorMessage,
} from "@atomist/sdm";
import {
    Attachment,
    SlackMessage,
} from "@atomist/slack-messages";
import { Credentials, S3 } from "aws-sdk";
import * as mime from "mime-types";
import { promisify } from "util";

function putObject(s3: S3, params: S3.Types.PutObjectRequest): () => Promise<S3.Types.PutObjectOutput> {
    return promisify<S3.Types.PutObjectOutput>(cb => s3.putObject(params, cb));
}

export const executePublishToS3: ExecuteGoal = doWithProject(
    doIt, { readOnly: true });

export async function doIt(inv: ProjectAwareGoalInvocation): Promise<ExecuteGoalResult> {
    if (!inv.id.sha) {
        return { code: 99, message: "SHA is not defined. I need that" };
    }
    try {
        const s3 = new S3({
            credentials: new Credentials(inv.configuration.sdm.aws.accessKey, inv.configuration.sdm.aws.secretKey),
        });
        const result = await pushToS3(s3, inv.project, {
            bucketName: "docs-sdm.atomist.com",
            globPattern: "site/**/*",
            pathPrefix: inv.id.sha,
            public: true,
        });
        inv.progressLog.write("URL: " + result.url);
        inv.progressLog.write(result.warnings.join("\n"));

        await inv.addressChannels(formatHappyMessage(result.url, result.warnings));
    } catch (e) {
        return { code: 98, message: e.message };
    }
    return {

        code: 0,
    };
}

function formatHappyMessage(url: string, warnings: string[]): SlackMessage {
    const attachments: Attachment[] = warnings.length === 0 ? [] : [{
        fallback: "boo",
        title: "Warnings",
        text: warnings.join("\n"),
        color: "#c95456",
    }];
    return {
        text: "Published to S3: " + url,
        attachments,
    };
}

async function pushToS3(s3: S3, project: Project, params: {
    bucketName: string,
    globPattern: string,
    pathPrefix: string, // todo: function from pathname in project to pathname in bucket instead
    public: boolean,
}) {
    const { bucketName, globPattern, pathPrefix } = params;
    const keyPrefix = pathPrefix.endsWith("/") ? pathPrefix : pathPrefix + "/";
    const warnings: string[] = [];
    await doWithFiles(project, globPattern, async file => {
        const content = await file.getContent();
        const key = keyPrefix + file.path;
        const contentType = mime.lookup(file.path);
        if (contentType === false) {
            warnings.push("Not uploading: Unable to determine content type for " + file.path);
            return;
        }

        console.log(`File: ${file.path}, key, ${key}, contentType: ${contentType}`);
        await putObject(s3, {
            Bucket: bucketName,
            Key: key,
            Body: content,
            ContentType: contentType,
        })();
        console.log("OK! Published to " + key);

        // .catch(err => {
        //     console.log("HERE I AM IN THIS THING");
        //     console.log(err);
        // });
    });

    return {
        url: `http://${bucketName}.s3-website.us-west-2.amazonaws.com/${keyPrefix}`,
        warnings,
    };
}
