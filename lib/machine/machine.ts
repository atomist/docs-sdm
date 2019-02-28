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

import { logger } from "@atomist/automation-client";
import {
    allOf,
    Autofix,
    Fingerprint,
    goal,
    goals,
    ImmaterialGoals,
    isMaterialChange,
    lastLinesLogInterpreter,
    not,
    PushTest,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration,
    ToDefaultBranch,
    whenPushSatisfies,
} from "@atomist/sdm";
import {
    createSoftwareDeliveryMachine,
    gitHubGoalStatus,
    goalState,
} from "@atomist/sdm-core";
import { Build } from "@atomist/sdm-pack-build";
import { PublishToS3 } from "@atomist/sdm-pack-s3";
import { executePublishToS3 } from "../publish/publishToS3";
import {
    mkdocsBuilderRegistration,
} from "./../build/mkdocsBuilder";
import {
    AlphabetizeGlossaryAutofix,
    AlphabetizeGlossaryCommand,
} from "./alphabetizeGlossary";
import {
    PutTbdInEmptySectionsAutofix,
    PutTbdInEmptySectionsCommand,
} from "./emptySectionsContainTbd";
import {
    executeHtmlproof,
    MkdocsBuildAfterCheckout,
} from "./htmltest";
import {
    listTodoCodeInspectionRegistration,
} from "./listTodoCommand";
import { MkdocsSiteGenerator } from "./mkdocsGenerator";
import { executeMkdocsStrict } from "./mkdocsStrict";
import {
    TbdFingerprinterRegistration,
    tbdFingerprintListener,
} from "./tbdFingerprinter";

export function machine(
    configuration: SoftwareDeliveryMachineConfiguration,
): SoftwareDeliveryMachine {

    logger.info("The configured log level is: " + configuration.logging.level);

    const sdm = createSoftwareDeliveryMachine({
        name: "Atomist Documentation Software Delivery Machine",
        configuration,
    });

    sdm.addCodeTransformCommand(PutTbdInEmptySectionsCommand);
    sdm.addCodeTransformCommand(AlphabetizeGlossaryCommand);

    sdm.addCodeInspectionCommand(listTodoCodeInspectionRegistration());

    const autofix = new Autofix().with(PutTbdInEmptySectionsAutofix)
        .with(AlphabetizeGlossaryAutofix);

    const fingerprint = new Fingerprint().with(TbdFingerprinterRegistration)
        .withListener(tbdFingerprintListener);

    const build = new Build("mkdocs build")
        .with(mkdocsBuilderRegistration());

    const strictMkdocsBuild = goal(
        { displayName: "mkdocs strict", },
        executeMkdocsStrict);

    const htmltest = goal(
        { displayName: "htmltest" },
        executeHtmlproof,
        { logInterpreter: lastLinesLogInterpreter("bummer", 10) })
        .withProjectListener(MkdocsBuildAfterCheckout);

    const publish = new PublishToS3({
        uniqueName: "publish draft to s3",
        bucketName: "docs-sdm.atomist.com",
        region: "us-west-2",
        filesToPublish: ["site/**/*"],
        pathTranslation: (filepath, inv) => inv.id.sha + "/" + filepath.replace("site/", ""),
        pathToIndex: "site/index.html",
    });

    const mkDocsGoals = goals("mkdocs")
        .plan(autofix, fingerprint)
        .plan(build).after(autofix)
        .plan(strictMkdocsBuild).after(build)
        .plan(publish).after(build)
        .plan(htmltest).after(publish);

    const officialPublish = goals("Release site")
        .plan(goal({ uniqueName: "publish for realz", preApproval: true },
            async (inv) => { inv.addressChannels("Pretend I just published this") }
        )).after(strictMkdocsBuild, publish, htmltest)

    sdm.withPushRules(
        whenPushSatisfies(allOf(IsMkdocsProject, not(isMaterialChange({
            extensions: ["html", "js"],
            files: ["mkdocs.yml"],
            globs: ["docs/**/*"],
        })))).itMeans("Nothing about the markdown changed")
            .setGoals(ImmaterialGoals.andLock()),
        whenPushSatisfies(IsMkdocsProject)
            .setGoals(mkDocsGoals),
        whenPushSatisfies(IsMkdocsProject, ToDefaultBranch)
            .setGoals(officialPublish),
    );

    sdm.addGeneratorCommand(MkdocsSiteGenerator);

    sdm.addExtensionPacks(
        goalState(),
        gitHubGoalStatus(),
    );

    return sdm;
}

const IsMkdocsProject: PushTest = {
    name: "IsMkdocsProject",
    mapping: inv => inv.project.hasFile("mkdocs.yml"),
};
