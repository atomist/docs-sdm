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
    doWithProject,
    ExecPromiseError,
    ExecPromiseResult,
    ExecuteGoal,
    ProjectAwareGoalInvocation,
} from "@atomist/sdm";

/**
 * When executed, this goal will run a `mkdocs build --strict`
 * which will look for problems like links to sibling pages that don't exist.
 */
export const executeMkdocsStrict: ExecuteGoal = doWithProject(async (inv: ProjectAwareGoalInvocation) => {
    {
        const pipResult = await inv.spawn("pip", ["install", "-r", "requirements.txt"]);
        if (pipResult.code !== 0) {
            // this is unexpected
            const message = pipResult.error ? pipResult.error.message : "See the log for output";
            return { code: pipResult.status || 2, message };
        }
    }

    const errors: string[] = [];
    let mkdocsResult: ExecPromiseError | ExecPromiseResult;
    try {
        mkdocsResult = await inv.exec("mkdocs", ["build", "--strict"]);
    } catch (e) {
        const epe = e as ExecPromiseError;
        await inv.addressChannels(`mkdocs --strict failed on ${inv.id.sha} on ${inv.id.branch}: ${epe.message}`);
        errors.push(epe.message);
        mkdocsResult = epe;
    }
    inv.progressLog.write(mkdocsResult.stdout);
    inv.progressLog.write(mkdocsResult.stderr);

    return { code: errors.length };
});
