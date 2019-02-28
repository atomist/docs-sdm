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
    GitProject,
    logger,
    toStringArray,
} from "@atomist/automation-client";
import {
    doWithProject,
    execPromise,
    ExecPromiseError,
    ExecPromiseResult,
    ExecuteGoal,
    GoalInvocation,
    GoalProjectListener,
    GoalProjectListenerEvent,
    GoalProjectListenerRegistration,
    ProjectAwareGoalInvocation,
    spawnLog,
    SpawnLogOptions,
    SpawnLogResult,
} from "@atomist/sdm";
import { SpawnSyncOptions } from "child_process";
import * as fs from "fs-extra";
import _ = require("lodash");
import * as path from "path";
import { promisify } from "util";

export const MkdocsBuildAfterCheckout: GoalProjectListenerRegistration = {
    name: "mkdocs build",
    events: [GoalProjectListenerEvent.before],
    listener: async (project, goalInvocation, event) => {
        if (!await project.hasDirectory("site")) {
            const siteRoot = await project.getFile("site/index.html");
            if (siteRoot) {
                return { code: 0, message: "Looks OK, site directory already exists in " + project.baseDir };
            } else {
                logger.error("WTAF, site/ exists but not index.html");
            }
        }

        const inv: ProjectAwareGoalInvocation = toProjectAwareGoalInvocation(project, goalInvocation);

        logger.info("I AM THE MkdocsBuildAfterCheckout GoalProjectListener and I got event "
            + event + " for goal " + inv.goal.name);
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
            mkdocsResult = await inv.exec("mkdocs", ["build"]);
        } catch (e) {
            const epe = e as ExecPromiseError;
            await inv.addressChannels(`mkdocs failed on ${inv.id.sha} on ${inv.id.branch}: ${epe.message}`);
            errors.push(epe.message);
            mkdocsResult = epe;
        }
        inv.progressLog.write(mkdocsResult.stdout);
        inv.progressLog.write(mkdocsResult.stderr);

        return { code: errors.length };
    },
};

// TODO: move to @atomist/sdm
/**
 * Convenience method to create project aware goal invocations
 */
export function toProjectAwareGoalInvocation(project: GitProject, gi: GoalInvocation): ProjectAwareGoalInvocation {
    const { progressLog } = gi;

    function spawn(cmd: string, args: string[], opts: SpawnLogOptions): Promise<SpawnLogResult> {
        const optsToUse: SpawnLogOptions = {
            cwd: project.baseDir,
            log: progressLog,
            ...opts,
        };
        return spawnLog(cmd, toStringArray(args), optsToUse);
    }

    function exec(cmd: string,
        args: string | string[] = [],
        opts: SpawnSyncOptions = {}): Promise<ExecPromiseResult> {
        const optsToUse: SpawnSyncOptions = {
            cwd: project.baseDir,
            ...opts,
        };
        return execPromise(cmd, toStringArray(args), optsToUse);
    }

    return { ...gi, project, spawn, exec };
}

export const executeHtmlproof: ExecuteGoal = doWithProject(async (inv: ProjectAwareGoalInvocation) => {

    const errors: string[] = []; // TODO: can eliminate because we are only doing one thing now

    await setUpCacheDirectory(inv);

    let htlmproofResult: ExecPromiseError | ExecPromiseResult;
    try {
        htlmproofResult = await inv.exec("htmltest", []);
    } catch (e) {
        const epe = e as ExecPromiseError;
        await inv.addressChannels(`htmltest failed on ${inv.id.sha} on ${inv.id.branch}: ${epe.message}`);
        errors.push(epe.message);
        htlmproofResult = epe;
    }
    inv.progressLog.write(htlmproofResult.stdout);
    inv.progressLog.write(htlmproofResult.stderr);

    return { code: errors.length };
}, { readOnly: true });

async function setUpCacheDirectory(inv: ProjectAwareGoalInvocation): Promise<void> {
    const configuredCacheDir = _.get(inv, "configuration.sdm.cache.path");
    if (!configuredCacheDir) {
        inv.progressLog.write("No cache directory configured");
        return;
    }
    const htmltestCacheDir = configuredCacheDir + path.sep + "htmltest";
    await fs.ensureDir(htmltestCacheDir);
    inv.progressLog.write("Caching htmltest results in: " + htmltestCacheDir);
    const htmltestLooksForCacheIn = inv.project.baseDir + path.sep + "tmp";
    await promisify(c =>
        fs.symlink(htmltestCacheDir, htmltestLooksForCacheIn, "dir",
            (err) => c(err, undefined)))();
    // TODO: ln -s htmltestCacheDir Project.baseDir/tmp
}
